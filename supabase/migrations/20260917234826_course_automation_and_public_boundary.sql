-- Course draft idempotency, atomic writes, and public serving-boundary hardening.
-- The mobile app continues to consume the existing public RPC/view shapes.

begin;

alter table core.courses
  add column if not exists automation_source text,
  add column if not exists automation_key text,
  add column if not exists last_automated_at timestamptz;

create unique index if not exists idx_courses_automation_identity
  on core.courses (automation_source, automation_key)
  where automation_source is not null and automation_key is not null;

create or replace function public.admin_upsert_course(p_payload jsonb)
returns uuid
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_course_id uuid;
  v_existing_id uuid;
  v_existing_published boolean := false;
  v_place_ids uuid[];
  v_theme_tags text[];
  v_slug text;
  v_hero_title text;
  v_automation_source text;
  v_automation_key text;
  v_updated_by uuid;
  v_is_published boolean;
begin
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'course payload must be a JSON object';
  end if;

  v_slug := nullif(pg_catalog.btrim(p_payload ->> 'slug'), '');
  v_hero_title := nullif(pg_catalog.btrim(p_payload ->> 'hero_title'), '');
  if v_slug is null or v_hero_title is null then
    raise exception 'course slug and title are required';
  end if;

  if pg_catalog.jsonb_typeof(p_payload -> 'place_ids') <> 'array' then
    raise exception 'course place_ids must be an array';
  end if;

  begin
    select pg_catalog.array_agg(item.value::uuid order by item.ordinality)
    into v_place_ids
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'place_ids')
      with ordinality as item(value, ordinality);
  exception when invalid_text_representation then
    raise exception 'course place_ids contains an invalid UUID';
  end;

  if v_place_ids is null or pg_catalog.cardinality(v_place_ids) = 0 then
    raise exception 'course must contain at least one place';
  end if;

  if (select count(*) from pg_catalog.unnest(v_place_ids))
     <> (select count(distinct place_id) from pg_catalog.unnest(v_place_ids) as ids(place_id)) then
    raise exception 'course places must be unique';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(v_place_ids) as ids(place_id)
    left join core.places p on p.id = ids.place_id
    where p.id is null
  ) then
    raise exception 'course contains an unknown place';
  end if;

  if p_payload ? 'id' and nullif(pg_catalog.btrim(p_payload ->> 'id'), '') is not null then
    if (p_payload ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'course id is invalid';
    end if;
    v_course_id := (p_payload ->> 'id')::uuid;
  end if;

  v_automation_source := nullif(pg_catalog.btrim(p_payload ->> 'automation_source'), '');
  v_automation_key := nullif(pg_catalog.btrim(p_payload ->> 'automation_key'), '');
  if (v_automation_source is null) <> (v_automation_key is null) then
    raise exception 'automation_source and automation_key must be provided together';
  end if;

  if v_automation_source is not null then
    select c.id, coalesce(cps.is_published, false)
    into v_existing_id, v_existing_published
    from core.courses c
    left join editorial.course_publish_state cps on cps.course_id = c.id
    where c.automation_source = v_automation_source
      and c.automation_key = v_automation_key
    limit 1;

    if v_existing_id is not null then
      if v_course_id is not null and v_course_id <> v_existing_id then
        raise exception 'automation key belongs to another course';
      end if;
      v_course_id := v_existing_id;
      -- An operator may publish a generated draft.  A later automation run
      -- must never overwrite that editorial decision.
      if v_existing_published then
        return v_course_id;
      end if;
    end if;
  end if;

  if p_payload ? 'theme_tags' and pg_catalog.jsonb_typeof(p_payload -> 'theme_tags') = 'array' then
    select coalesce(pg_catalog.array_agg(pg_catalog.btrim(item.value)), '{}'::text[])
    into v_theme_tags
    from pg_catalog.jsonb_array_elements_text(p_payload -> 'theme_tags') as item(value)
    where pg_catalog.btrim(item.value) <> '';
  else
    v_theme_tags := '{}'::text[];
  end if;

  if p_payload ? 'updated_by' and nullif(pg_catalog.btrim(p_payload ->> 'updated_by'), '') is not null then
    if (p_payload ->> 'updated_by') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'updated_by is invalid';
    end if;
    v_updated_by := (p_payload ->> 'updated_by')::uuid;
  end if;

  v_is_published := coalesce((p_payload ->> 'is_published')::boolean, false);
  if v_automation_source is not null then
    v_is_published := false;
  end if;

  if v_is_published and (
    select count(*) from core.places p
    join editorial.place_publish_state pps on pps.place_id = p.id
    where p.id = any(v_place_ids)
      and p.is_active = true
      and pps.is_published = true
  ) <> pg_catalog.cardinality(v_place_ids) then
    raise exception 'published courses may only contain active published places';
  end if;

  insert into core.courses (
    id,
    slug,
    theme_tags,
    estimated_duration_min,
    walking_distance_km,
    recommended_start_time,
    pet_ready_flag,
    automation_source,
    automation_key,
    last_automated_at,
    updated_at
  )
  values (
    coalesce(v_course_id, extensions.gen_random_uuid()),
    v_slug,
    v_theme_tags,
    greatest(1, coalesce((p_payload ->> 'estimated_duration_min')::integer, 60)),
    nullif((p_payload ->> 'walking_distance_km'), '')::numeric,
    nullif(pg_catalog.btrim(p_payload ->> 'recommended_start_time'), ''),
    coalesce((p_payload ->> 'pet_ready_flag')::boolean, false),
    v_automation_source,
    v_automation_key,
    case when v_automation_source is not null then pg_catalog.now() else null end,
    pg_catalog.now()
  )
  on conflict (id) do update set
    slug = excluded.slug,
    theme_tags = excluded.theme_tags,
    estimated_duration_min = excluded.estimated_duration_min,
    walking_distance_km = excluded.walking_distance_km,
    recommended_start_time = excluded.recommended_start_time,
    pet_ready_flag = excluded.pet_ready_flag,
    automation_source = coalesce(excluded.automation_source, core.courses.automation_source),
    automation_key = coalesce(excluded.automation_key, core.courses.automation_key),
    last_automated_at = case
      when excluded.automation_source is not null then pg_catalog.now()
      else core.courses.last_automated_at
    end,
    updated_at = pg_catalog.now()
  returning id into v_course_id;

  insert into editorial.course_copy (
    course_id,
    hero_title,
    subtitle,
    route_summary,
    og_title,
    og_description,
    og_image_url,
    updated_by,
    updated_at
  )
  values (
    v_course_id,
    v_hero_title,
    nullif(pg_catalog.btrim(p_payload ->> 'subtitle'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'route_summary'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'og_title'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'og_description'), ''),
    nullif(pg_catalog.btrim(p_payload ->> 'og_image_url'), ''),
    v_updated_by,
    pg_catalog.now()
  )
  on conflict (course_id) do update set
    hero_title = excluded.hero_title,
    subtitle = excluded.subtitle,
    route_summary = excluded.route_summary,
    og_title = excluded.og_title,
    og_description = excluded.og_description,
    og_image_url = excluded.og_image_url,
    updated_by = excluded.updated_by,
    updated_at = pg_catalog.now();

  insert into editorial.course_publish_state (
    course_id,
    is_published,
    display_priority,
    ops_memo,
    published_at,
    updated_by,
    updated_at
  )
  values (
    v_course_id,
    v_is_published,
    greatest(0, coalesce((p_payload ->> 'display_priority')::integer, 0)),
    nullif(pg_catalog.btrim(p_payload ->> 'ops_memo'), ''),
    case when v_is_published then pg_catalog.now() else null end,
    v_updated_by,
    pg_catalog.now()
  )
  on conflict (course_id) do update set
    is_published = excluded.is_published,
    display_priority = excluded.display_priority,
    ops_memo = excluded.ops_memo,
    published_at = case when excluded.is_published then coalesce(editorial.course_publish_state.published_at, pg_catalog.now()) else null end,
    updated_by = excluded.updated_by,
    updated_at = pg_catalog.now();

  delete from core.course_places where course_id = v_course_id;
  insert into core.course_places (course_id, place_id, order_index)
  select v_course_id, ids.place_id, ids.ordinality::integer - 1
  from pg_catalog.unnest(v_place_ids) with ordinality as ids(place_id, ordinality);

  return v_course_id;
end;
$$;

revoke all on function public.admin_upsert_course(jsonb) from public, anon, authenticated;
grant execute on function public.admin_upsert_course(jsonb) to service_role;

create or replace function public.get_course_detail(p_course_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result json;
begin
  select pg_catalog.json_build_object(
    'id', c.id,
    'slug', c.slug,
    'theme_tags', c.theme_tags,
    'estimated_duration_min', c.estimated_duration_min,
    'walking_distance_km', c.walking_distance_km,
    'recommended_start_time', c.recommended_start_time,
    'pet_ready_flag', c.pet_ready_flag,
    'hero_title', cc.hero_title,
    'subtitle', cc.subtitle,
    'route_summary', cc.route_summary,
    'places', (
      select pg_catalog.json_agg(
        pg_catalog.json_build_object(
          'order_index', cp.order_index,
          'place_id', p.id,
          'slug', p.slug,
          'official_name', p.official_name,
          'display_name', coalesce(pc.display_name, p.official_name),
          'lat', p.lat,
          'lng', p.lng,
          'category', p.category,
          'recommended_stay_min', p.recommended_stay_min,
          'mission_type', pc.mission_type,
          'mission_prompt', pc.mission_prompt,
          'mission_radius_m', coalesce(pc.mission_radius_m, 80),
          'couple_question', pc.couple_question,
          'night_highlight', pc.night_highlight,
          'photo_tip', pc.photo_tip,
          'short_story', pc.short_story,
          'hero_image_url', (
            select pi.image_url
            from core.place_images pi
            where pi.place_id = p.id and pi.is_hero = true
            order by pi.display_order, pi.created_at, pi.id
            limit 1
          )
        ) order by cp.order_index
      )
      from core.course_places cp
      join core.places p on p.id = cp.place_id
      join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
      left join editorial.place_copy pc on pc.place_id = p.id
      where cp.course_id = c.id and p.is_active = true
    )
  )
  into v_result
  from core.courses c
  join editorial.course_copy cc on cc.course_id = c.id
  join editorial.course_publish_state cps on cps.course_id = c.id and cps.is_published = true
  where c.id = p_course_id
    and exists (select 1 from core.course_places cp0 where cp0.course_id = c.id)
    and not exists (
      select 1
      from core.course_places cp0
      join core.places p0 on p0.id = cp0.place_id
      left join editorial.place_publish_state pps0 on pps0.place_id = p0.id
      where cp0.course_id = c.id
        and (p0.is_active is not true or pps0.is_published is not true)
    );

  return v_result;
end;
$$;

create or replace function public.get_course_by_slug(p_slug text)
returns json
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_course_id uuid;
begin
  select c.id
  into v_course_id
  from core.courses c
  join editorial.course_publish_state cps on cps.course_id = c.id and cps.is_published = true
  where (c.slug = p_slug or c.id::text = p_slug)
    and exists (select 1 from core.course_places cp0 where cp0.course_id = c.id)
    and not exists (
      select 1
      from core.course_places cp0
      join core.places p0 on p0.id = cp0.place_id
      left join editorial.place_publish_state pps0 on pps0.place_id = p0.id
      where cp0.course_id = c.id
        and (p0.is_active is not true or pps0.is_published is not true)
    )
  limit 1;

  return public.get_course_detail(v_course_id);
end;
$$;

create or replace function public.get_place_by_slug(p_slug text)
returns json
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_result json;
begin
  select pg_catalog.json_build_object(
    'id', p.id,
    'slug', p.slug,
    'official_name', p.official_name,
    'address_full', p.address_full,
    'lat', p.lat,
    'lng', p.lng,
    'contact_phone', p.contact_phone,
    'short_description', p.short_description,
    'recommended_stay_min', p.recommended_stay_min,
    'category', p.category,
    'display_name', coalesce(pc.display_name, p.official_name),
    'mission_radius_m', coalesce(pc.mission_radius_m, 80),
    'night_highlight', pc.night_highlight,
    'photo_tip', pc.photo_tip,
    'mission_type', pc.mission_type,
    'mission_prompt', pc.mission_prompt,
    'couple_question', pc.couple_question,
    'short_story', pc.short_story,
    'og_title', coalesce(pc.og_title, pc.display_name, p.official_name),
    'og_description', pc.og_description,
    'og_image_url', pc.og_image_url,
    'images', (
      select pg_catalog.json_agg(
        pg_catalog.json_build_object(
          'id', pi.id,
          'image_url', pi.image_url,
          'is_hero', pi.is_hero,
          'display_order', pi.display_order
        ) order by pi.display_order
      )
      from core.place_images pi
      where pi.place_id = p.id
    )
  )
  into v_result
  from core.places p
  join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
  left join editorial.place_copy pc on pc.place_id = p.id
  where (p.slug = p_slug or p.id::text = p_slug)
    and p.is_active = true
  limit 1;

  return v_result;
end;
$$;

-- These records are consumed through curated serving views/RPCs, not by the
-- browser's direct PostgREST table endpoint.
revoke select on table
  core.places,
  core.place_sources,
  core.place_images,
  core.courses,
  core.course_places,
  core.place_crowd_forecasts,
  core.place_pet_policies,
  editorial.place_copy
from anon, authenticated;

drop policy if exists "Public can read active places" on core.places;
drop policy if exists "Public can read sources for active places" on core.place_sources;
drop policy if exists "Public can read images for active places" on core.place_images;
drop policy if exists "Public can read copy for active places" on editorial.place_copy;
drop policy if exists courses_select on core.courses;
drop policy if exists course_places_select on core.course_places;
drop policy if exists place_crowd_forecasts_select on core.place_crowd_forecasts;
drop policy if exists place_pet_policies_select on core.place_pet_policies;

-- Keep the public event view invoker-safe.  Only current/future rows and the
-- columns used by the promotion site are available to anonymous clients.
drop policy if exists events_select on core.events;
create policy events_upcoming_select
on core.events
for select
to anon, authenticated
using (end_date >= current_date);

grant usage on schema core to anon, authenticated;
grant select (
  id,
  event_content_id,
  event_name,
  start_date,
  end_date,
  venue_address,
  event_place,
  play_time,
  usage_fee,
  hero_image_url
) on table core.events to anon, authenticated;

create or replace view public.v_upcoming_events
with (security_invoker = true)
as
select
  id,
  event_content_id,
  event_name,
  start_date,
  end_date,
  venue_address,
  event_place,
  play_time,
  usage_fee,
  hero_image_url
from core.events
where end_date >= current_date
order by start_date asc, event_name asc;

-- Keep serving views aligned with editorial state.  View columns remain
-- unchanged so existing web/mobile adapters do not need a contract change.
create or replace view serving.v_home_courses as
select
  c.id,
  c.slug,
  c.theme_tags,
  c.estimated_duration_min,
  c.walking_distance_km,
  c.recommended_start_time,
  c.pet_ready_flag,
  cc.hero_title,
  cc.subtitle,
  cc.route_summary,
  cps.display_priority,
  (select count(*) from core.course_places cp where cp.course_id = c.id) as spot_count,
  (select pi.image_url
   from core.course_places cp2
   join core.places p2 on p2.id = cp2.place_id and p2.is_active = true
   join editorial.place_publish_state pps2 on pps2.place_id = p2.id and pps2.is_published = true
   join core.place_images pi on pi.place_id = cp2.place_id and pi.is_hero = true
   where cp2.course_id = c.id
   order by cp2.order_index
   limit 1) as hero_image_url
from core.courses c
join editorial.course_copy cc on cc.course_id = c.id
join editorial.course_publish_state cps on cps.course_id = c.id
where cps.is_published = true
  and exists (select 1 from core.course_places cp0 where cp0.course_id = c.id)
  and not exists (
    select 1
    from core.course_places cp0
    join core.places p0 on p0.id = cp0.place_id
    left join editorial.place_publish_state pps0 on pps0.place_id = p0.id
    where cp0.course_id = c.id
      and (p0.is_active is not true or pps0.is_published is not true)
  )
order by cps.display_priority;

create or replace view serving.v_course_detail as
select
  c.id as course_id,
  c.slug as course_slug,
  c.theme_tags,
  c.estimated_duration_min,
  c.walking_distance_km,
  c.recommended_start_time,
  c.pet_ready_flag,
  cc.hero_title,
  cc.subtitle,
  cc.route_summary,
  cp.order_index,
  p.id as place_id,
  p.slug as place_slug,
  p.official_name,
  p.lat,
  p.lng,
  p.category,
  p.recommended_stay_min,
  coalesce(pc.display_name, p.official_name) as display_name,
  coalesce(pc.mission_radius_m, 80) as mission_radius_m,
  pc.mission_type,
  pc.mission_prompt,
  pc.couple_question,
  pc.night_highlight,
  pc.photo_tip,
  pc.short_story,
  (select pi.image_url from core.place_images pi where pi.place_id = p.id and pi.is_hero = true limit 1) as hero_image_url
from core.courses c
join editorial.course_copy cc on cc.course_id = c.id
join core.course_places cp on cp.course_id = c.id
join core.places p on p.id = cp.place_id and p.is_active = true
join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
left join editorial.place_copy pc on pc.place_id = p.id
order by c.id, cp.order_index;

create or replace view serving.v_place_detail as
select
  p.id,
  p.slug,
  p.official_name,
  p.address_full,
  p.lat,
  p.lng,
  p.contact_phone,
  p.short_description,
  p.recommended_stay_min,
  p.category,
  coalesce(pc.display_name, p.official_name) as display_name,
  coalesce(pc.mission_radius_m, 80) as mission_radius_m,
  pc.night_highlight,
  pc.photo_tip,
  pc.mission_type,
  pc.mission_prompt,
  pc.couple_question,
  pc.short_story,
  ppp.pet_policy,
  ppp.pet_note_short,
  (select pg_catalog.json_agg(pg_catalog.json_build_object('id', pi.id, 'image_url', pi.image_url, 'is_hero', pi.is_hero, 'display_order', pi.display_order) order by pi.display_order)
   from core.place_images pi where pi.place_id = p.id) as images
from core.places p
join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
left join editorial.place_copy pc on pc.place_id = p.id
left join core.place_pet_policies ppp on ppp.place_id = p.id
where p.is_active = true;

create or replace view serving.v_web_place_page as
select
  p.id,
  p.slug,
  p.official_name,
  p.address_full,
  p.lat,
  p.lng,
  p.short_description,
  p.category,
  coalesce(pc.display_name, p.official_name) as display_name,
  pc.night_highlight,
  pc.photo_tip,
  coalesce(pc.og_title, pc.display_name, p.official_name) as og_title,
  pc.og_description,
  pc.og_image_url,
  (select pg_catalog.json_agg(pg_catalog.json_build_object('id', pi.id, 'image_url', pi.image_url, 'is_hero', pi.is_hero, 'display_order', pi.display_order) order by pi.display_order)
   from core.place_images pi where pi.place_id = p.id) as images
from core.places p
join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
left join editorial.place_copy pc on pc.place_id = p.id
where p.is_active = true;

-- The legacy imported alias is retained for compatibility but is no longer a
-- back door to unpublished source records.
create or replace view public.v_imported_places as
select imported.id, imported.slug, imported.official_name, imported.display_name,
  imported.address_full, imported.lat, imported.lng, imported.contact_phone,
  imported.source_overview_raw, imported.short_description, imported.category,
  imported.kto_content_id, imported.kto_content_type_id, imported.hero_image_url,
  imported.hero_thumbnail_url, imported.source_modified_at, imported.is_active
from serving.v_imported_places imported
join serving.v_published_places published on published.id = imported.id;

create or replace function public.sync_reconcile_stale_runs(p_max_age_minutes integer default 90)
returns integer
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_updated integer;
begin
  if p_max_age_minutes is null or p_max_age_minutes < 5 or p_max_age_minutes > 1440 then
    raise exception 'stale run age must be between 5 and 1440 minutes';
  end if;

  update raw.sync_runs
  set status = 'failed',
      completed_at = coalesce(completed_at, pg_catalog.now()),
      metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'reconciled', true,
        'reconciled_at', pg_catalog.now()
      )
  where status = 'running'
    and started_at < pg_catalog.now() - pg_catalog.make_interval(mins => p_max_age_minutes);

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.sync_reconcile_stale_runs(integer) from public, anon, authenticated;
grant execute on function public.sync_reconcile_stale_runs(integer) to service_role;

commit;
