-- Published data contract and KTO discovery lifecycle.
-- Raw/core/editorial tables remain service-role/internal; only published
-- serving views and the existing public RPCs are extended additively.

begin;

alter table core.place_sources
  add column if not exists ingestion_status text not null default 'approved',
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists last_pet_checked_at timestamptz;

update core.place_sources
set ingestion_status = 'approved'
where ingestion_status is null or ingestion_status not in ('candidate', 'approved', 'rejected', 'stale');

alter table core.place_sources
  drop constraint if exists place_sources_ingestion_status_check;
alter table core.place_sources
  add constraint place_sources_ingestion_status_check
  check (ingestion_status in ('candidate', 'approved', 'rejected', 'stale'));

alter table core.place_pet_policies
  add column if not exists data_status text not null default 'unknown',
  add column if not exists last_checked_at timestamptz,
  add column if not exists details_json jsonb not null default '{}'::jsonb;

update core.place_pet_policies
set data_status = case
  when coalesce(source_updated_at, updated_at) is null then 'unknown'
  when nullif(pet_note_short, '') is null and lower(coalesce(pet_policy, 'unknown')) = 'unknown' then 'unknown'
  else 'fresh'
end,
last_checked_at = coalesce(last_checked_at, source_updated_at, updated_at)
where data_status = 'unknown';

alter table core.place_pet_policies
  drop constraint if exists place_pet_policies_data_status_check;
alter table core.place_pet_policies
  add constraint place_pet_policies_data_status_check
  check (data_status in ('fresh', 'stale', 'unavailable', 'unknown'));

alter table raw.sync_runs
  drop constraint if exists sync_runs_status_check;
alter table raw.sync_runs
  add constraint sync_runs_status_check
  check (status in ('running', 'completed', 'partial', 'failed'));

create table if not exists raw.kto_pet_candidates (
  content_id text primary key,
  area_code text not null,
  sigungu_code text not null,
  content_type_id text not null,
  list_payload jsonb not null default '{}'::jsonb,
  normalized_place jsonb not null default '{}'::jsonb,
  source_modified_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sync_run_id uuid references raw.sync_runs(id) on delete set null
);

create table if not exists raw.kto_festival (
  content_id text primary key,
  payload_json jsonb not null default '{}'::jsonb,
  start_date date,
  end_date date,
  source_modified_at timestamptz,
  fetched_at timestamptz not null default now(),
  last_sync_run_id uuid references raw.sync_runs(id) on delete set null
);

alter table raw.kto_pet_candidates enable row level security;
alter table raw.kto_festival enable row level security;

create index if not exists idx_pet_candidates_last_seen
  on raw.kto_pet_candidates(last_seen_at desc);
create index if not exists idx_pet_candidates_area_type
  on raw.kto_pet_candidates(area_code, sigungu_code, content_type_id);
create index if not exists idx_place_sources_ingestion_status
  on core.place_sources(ingestion_status, last_seen_at desc);
create index if not exists idx_place_pet_policies_data_status
  on core.place_pet_policies(data_status, last_checked_at);

grant select, insert, update on raw.kto_pet_candidates, raw.kto_festival to service_role;
grant select, insert, update on core.place_sources, core.place_pet_policies to service_role;
grant select, insert, update on core.events to service_role;

create or replace function public.sync_kto_pet_candidate(
  p_run_id uuid,
  p_content_id text,
  p_content_type_id text,
  p_payload jsonb,
  p_normalized_place jsonb,
  p_area_code text,
  p_sigungu_code text
)
returns uuid
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_place_id uuid;
  v_existing_status text;
  v_slug text := nullif(pg_catalog.btrim(p_normalized_place ->> 'slug'), '');
  v_name text := nullif(pg_catalog.btrim(p_normalized_place ->> 'official_name'), '');
  v_address text := nullif(pg_catalog.btrim(p_normalized_place ->> 'address_full'), '');
  v_lat numeric;
  v_lng numeric;
  v_modified_at timestamptz;
begin
  if nullif(pg_catalog.btrim(p_content_id), '') is null then
    raise exception 'pet candidate content id is required';
  end if;

  begin
    v_lat := nullif(p_normalized_place ->> 'lat', '')::numeric;
    v_lng := nullif(p_normalized_place ->> 'lng', '')::numeric;
  exception when others then
    v_lat := null;
    v_lng := null;
  end;

  begin
    v_modified_at := nullif(p_normalized_place ->> 'source_modified_at', '')::timestamptz;
  exception when others then
    v_modified_at := null;
  end;

  insert into raw.kto_pet_candidates (
    content_id, area_code, sigungu_code, content_type_id,
    list_payload, normalized_place, source_modified_at,
    first_seen_at, last_seen_at, last_sync_run_id
  )
  values (
    pg_catalog.btrim(p_content_id),
    coalesce(nullif(pg_catalog.btrim(p_area_code), ''), ''),
    coalesce(nullif(pg_catalog.btrim(p_sigungu_code), ''), ''),
    coalesce(nullif(pg_catalog.btrim(p_content_type_id), ''), ''),
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_normalized_place, '{}'::jsonb),
    v_modified_at,
    pg_catalog.now(), pg_catalog.now(), p_run_id
  )
  on conflict (content_id) do update
    set area_code = excluded.area_code,
        sigungu_code = excluded.sigungu_code,
        content_type_id = excluded.content_type_id,
        list_payload = excluded.list_payload,
        normalized_place = excluded.normalized_place,
        source_modified_at = coalesce(excluded.source_modified_at, raw.kto_pet_candidates.source_modified_at),
        last_seen_at = pg_catalog.now(),
        last_sync_run_id = excluded.last_sync_run_id;

  -- A malformed list item is retained for audit, but cannot create an
  -- unusable place row. The runner can still report it as a candidate error.
  if v_slug is null or v_name is null or v_lat is null or v_lng is null then
    return null;
  end if;

  select ps.place_id, ps.ingestion_status
  into v_place_id, v_existing_status
  from core.place_sources ps
  where ps.kto_content_id = pg_catalog.btrim(p_content_id)
  limit 1;

  if v_place_id is null then
    insert into core.places (
      slug, official_name, address_full, lat, lng, contact_phone,
      source_overview_raw, source_modified_at, is_active, updated_at
    )
    values (
      v_slug, v_name, v_address, v_lat, v_lng,
      nullif(pg_catalog.btrim(p_normalized_place ->> 'contact_phone'), ''),
      nullif(p_normalized_place ->> 'source_overview_raw', ''),
      v_modified_at, true, pg_catalog.now()
    )
    on conflict (slug) do update
      set official_name = excluded.official_name,
          address_full = coalesce(excluded.address_full, core.places.address_full),
          lat = excluded.lat,
          lng = excluded.lng,
          contact_phone = coalesce(excluded.contact_phone, core.places.contact_phone),
          source_overview_raw = coalesce(excluded.source_overview_raw, core.places.source_overview_raw),
          source_modified_at = coalesce(excluded.source_modified_at, core.places.source_modified_at),
          updated_at = pg_catalog.now()
    returning id into v_place_id;
  else
    update core.places
    set official_name = v_name,
        address_full = coalesce(v_address, address_full),
        lat = v_lat,
        lng = v_lng,
        contact_phone = coalesce(nullif(pg_catalog.btrim(p_normalized_place ->> 'contact_phone'), ''), contact_phone),
        source_modified_at = coalesce(v_modified_at, source_modified_at),
        updated_at = pg_catalog.now()
    where id = v_place_id;
  end if;

  insert into core.place_sources (
    place_id, kto_content_id, kto_content_type_id, sync_enabled,
    ingestion_status, first_seen_at, last_seen_at
  )
  values (
    v_place_id, pg_catalog.btrim(p_content_id), pg_catalog.btrim(p_content_type_id), true,
    'candidate', pg_catalog.now(), pg_catalog.now()
  )
  on conflict (kto_content_id) do update
    set place_id = excluded.place_id,
        kto_content_type_id = excluded.kto_content_type_id,
        last_seen_at = pg_catalog.now(),
        ingestion_status = case
          when core.place_sources.ingestion_status = 'approved' then 'approved'
          when core.place_sources.ingestion_status = 'rejected' then 'rejected'
          else 'candidate'
        end;

  return v_place_id;
end;
$$;

create or replace function public.sync_list_pet_enrichment(
  p_limit integer default 250
)
returns table (
  place_id uuid,
  kto_content_id text,
  source_modified_at timestamptz,
  last_pet_checked_at timestamptz,
  data_status text
)
language sql
stable
set search_path = pg_catalog
as $$
  select p.id,
         ps.kto_content_id,
         p.source_modified_at,
         ps.last_pet_checked_at,
         coalesce(pp.data_status, 'unknown')
  from core.places p
  join core.place_sources ps on ps.place_id = p.id
  left join core.place_pet_policies pp on pp.place_id = p.id
  where p.is_active = true
    and coalesce(ps.sync_enabled, true) = true
    and ps.ingestion_status in ('candidate', 'approved', 'stale')
    and (
      pp.place_id is null
      or pp.last_checked_at is null
      or pp.data_status in ('stale', 'unavailable', 'unknown')
      or (p.source_modified_at is not null and (pp.source_updated_at is null or p.source_modified_at > pp.source_updated_at))
    )
  order by
    case when pp.place_id is null or pp.last_checked_at is null then 0 else 1 end,
    ps.last_pet_checked_at nulls first,
    p.official_name
  limit greatest(0, least(coalesce(p_limit, 250), 1000));
$$;

create or replace function public.sync_finalize_pet_discovery(p_run_id uuid)
returns integer
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_started_at timestamptz;
  v_count integer;
begin
  select started_at into v_started_at from raw.sync_runs where id = p_run_id;
  if v_started_at is null then
    raise exception 'sync run % not found', p_run_id;
  end if;

  update core.place_sources
  set ingestion_status = 'stale'
  where ingestion_status = 'candidate'
    and last_seen_at < v_started_at;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.sync_kto_pet_item(
  p_run_id uuid,
  p_content_id text,
  p_payload jsonb
)
returns boolean
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_place_id uuid;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_type text := pg_catalog.lower(coalesce(v_payload ->> 'acmpyTypeCd', ''));
  v_possible text := pg_catalog.lower(coalesce(v_payload ->> 'acmpyPsblCpam', ''));
  v_policy text;
  v_raw_note text;
  v_short_note text;
begin
  insert into raw.kto_pet_tour (source_endpoint, content_id, payload_json)
  values ('detailPetTour2', pg_catalog.btrim(p_content_id), v_payload)
  on conflict (source_endpoint, content_id) do update
    set payload_json = excluded.payload_json,
        fetched_at = pg_catalog.now();

  select ps.place_id into v_place_id
  from core.place_sources ps
  where ps.kto_content_id = pg_catalog.btrim(p_content_id)
  limit 1;

  if v_place_id is null then
    return false;
  end if;

  if v_type like '%불가%' or v_possible like '%불가%' or v_type like '%불허%' or v_possible like '%불허%' then
    v_policy := 'not_allowed';
  elsif v_type like '%일부%' or v_possible like '%일부%'
     or v_type like '%제한%' or v_possible like '%제한%'
     or v_type like '%문의%' or v_possible like '%문의%' then
    v_policy := 'partial';
  elsif v_type like '%가능%' or v_possible like '%가능%'
     or v_type like '%허용%' or v_possible like '%허용%' then
    v_policy := 'allowed';
  else
    v_policy := 'unknown';
  end if;

  v_raw_note := nullif(pg_catalog.concat_ws(E'\n',
    nullif(pg_catalog.btrim(v_payload ->> 'acmpyPsblCpam'), ''),
    nullif(pg_catalog.btrim(v_payload ->> 'acmpyNeedMtr'), ''),
    nullif(pg_catalog.btrim(v_payload ->> 'etcAcmpyInfo'), ''),
    nullif(pg_catalog.btrim(v_payload ->> 'acmpyTypeCd'), ''),
    nullif(pg_catalog.btrim(v_payload ->> 'relaAcdntRiskMtr'), ''),
    nullif(pg_catalog.btrim(v_payload ->> 'relaPosesFclty'), ''),
    nullif(pg_catalog.btrim(v_payload ->> 'relaRntlPrdlst'), ''),
    nullif(pg_catalog.btrim(v_payload ->> 'relaFrnshPrdlst'), ''),
    nullif(pg_catalog.btrim(v_payload ->> 'relaPurcPrdlst'), '')
  ), '');
  v_short_note := nullif(pg_catalog.left(pg_catalog.regexp_replace(coalesce(v_raw_note, ''), '\\s+', ' ', 'g'), 240), '');

  insert into core.place_pet_policies (
    place_id, pet_policy, pet_note_raw, pet_note_short,
    is_manual_override, source_provider, source_updated_at,
    data_status, last_checked_at, details_json, updated_at
  )
  values (
    v_place_id, v_policy, v_raw_note, v_short_note,
    false, 'KTO', pg_catalog.now(), 'fresh', pg_catalog.now(), v_payload, pg_catalog.now()
  )
  on conflict (place_id) do update
    set pet_policy = excluded.pet_policy,
        pet_note_raw = excluded.pet_note_raw,
        pet_note_short = excluded.pet_note_short,
        source_provider = excluded.source_provider,
        source_updated_at = excluded.source_updated_at,
        data_status = excluded.data_status,
        last_checked_at = excluded.last_checked_at,
        details_json = excluded.details_json,
        updated_at = pg_catalog.now()
    where coalesce(core.place_pet_policies.is_manual_override, false) = false;

  update core.place_sources
  set last_pet_checked_at = pg_catalog.now()
  where kto_content_id = pg_catalog.btrim(p_content_id);

  return true;
end;
$$;

create or replace function public.sync_mark_pet_check(
  p_run_id uuid,
  p_content_id text,
  p_status text,
  p_payload jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_place_id uuid;
begin
  if pg_catalog.lower(pg_catalog.btrim(coalesce(p_status, ''))) not in ('unavailable', 'unknown') then
    return false;
  end if;

  insert into raw.kto_pet_tour (source_endpoint, content_id, payload_json)
  values ('detailPetTour2', pg_catalog.btrim(p_content_id), coalesce(p_payload, '{}'::jsonb))
  on conflict (source_endpoint, content_id) do update
    set payload_json = excluded.payload_json,
        fetched_at = pg_catalog.now();

  select ps.place_id into v_place_id
  from core.place_sources ps
  where ps.kto_content_id = pg_catalog.btrim(p_content_id)
  limit 1;

  if v_place_id is null then
    return false;
  end if;

  insert into core.place_pet_policies (
    place_id, pet_policy, pet_note_raw, pet_note_short,
    is_manual_override, source_provider, source_updated_at,
    data_status, last_checked_at, details_json, updated_at
  )
  values (
    v_place_id, 'unknown', null, null,
    false, 'KTO', pg_catalog.now(), 'unavailable', pg_catalog.now(), coalesce(p_payload, '{}'::jsonb), pg_catalog.now()
  )
  on conflict (place_id) do update
    set source_provider = excluded.source_provider,
        source_updated_at = excluded.source_updated_at,
        data_status = excluded.data_status,
        last_checked_at = excluded.last_checked_at,
        details_json = excluded.details_json,
        updated_at = pg_catalog.now()
    where coalesce(core.place_pet_policies.is_manual_override, false) = false;

  update core.place_sources
  set last_pet_checked_at = pg_catalog.now()
  where kto_content_id = pg_catalog.btrim(p_content_id);

  return true;
end;
$$;

create or replace function public.sync_kto_event_item(
  p_run_id uuid,
  p_content_id text,
  p_payload jsonb,
  p_normalized_event jsonb
)
returns uuid
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_event_id uuid;
  v_start date;
  v_end date;
  v_modified_at timestamptz;
  v_content_id text := nullif(pg_catalog.btrim(p_content_id), '');
  v_event_name text := nullif(pg_catalog.btrim(p_normalized_event ->> 'event_name'), '');
begin
  if v_content_id is null or v_event_name is null then
    raise exception 'event content id and name are required';
  end if;

  begin
    v_start := nullif(p_normalized_event ->> 'start_date', '')::date;
    v_end := nullif(p_normalized_event ->> 'end_date', '')::date;
    v_modified_at := nullif(p_normalized_event ->> 'source_modified_at', '')::timestamptz;
  exception when others then
    raise exception 'event % has invalid dates', v_content_id;
  end;

  if v_start is null or v_end is null or v_end < v_start then
    raise exception 'event % has an invalid date range', v_content_id;
  end if;

  insert into raw.kto_festival (
    content_id, payload_json, start_date, end_date, source_modified_at, fetched_at, last_sync_run_id
  )
  values (v_content_id, coalesce(p_payload, '{}'::jsonb), v_start, v_end, v_modified_at, pg_catalog.now(), p_run_id)
  on conflict (content_id) do update
    set payload_json = excluded.payload_json,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        source_modified_at = excluded.source_modified_at,
        fetched_at = pg_catalog.now(),
        last_sync_run_id = excluded.last_sync_run_id;

  insert into core.events (
    event_content_id, event_name, start_date, end_date, venue_address,
    lat, lng, hero_image_url, contact_phone, event_place, play_time,
    usage_fee, program_raw, source_modified_at, updated_at
  )
  values (
    v_content_id,
    v_event_name,
    v_start,
    v_end,
    nullif(pg_catalog.btrim(p_normalized_event ->> 'venue_address'), ''),
    nullif(p_normalized_event ->> 'lat', '')::numeric,
    nullif(p_normalized_event ->> 'lng', '')::numeric,
    nullif(pg_catalog.btrim(p_normalized_event ->> 'hero_image_url'), ''),
    nullif(pg_catalog.btrim(p_normalized_event ->> 'contact_phone'), ''),
    nullif(pg_catalog.btrim(p_normalized_event ->> 'event_place'), ''),
    nullif(pg_catalog.btrim(p_normalized_event ->> 'play_time'), ''),
    nullif(pg_catalog.btrim(p_normalized_event ->> 'usage_fee'), ''),
    nullif(pg_catalog.btrim(p_normalized_event ->> 'program_raw'), ''),
    v_modified_at,
    pg_catalog.now()
  )
  on conflict (event_content_id) do update
    set event_name = excluded.event_name,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        venue_address = excluded.venue_address,
        lat = excluded.lat,
        lng = excluded.lng,
        hero_image_url = excluded.hero_image_url,
        contact_phone = excluded.contact_phone,
        event_place = excluded.event_place,
        play_time = excluded.play_time,
        usage_fee = excluded.usage_fee,
        program_raw = excluded.program_raw,
        source_modified_at = excluded.source_modified_at,
        updated_at = pg_catalog.now()
  returning id into v_event_id;

  return v_event_id;
end;
$$;

-- The source tables are never a browser API. New RPCs follow the same
-- service-role-only policy as the existing sync functions.
revoke all on function public.sync_kto_pet_candidate(uuid, text, text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.sync_list_pet_enrichment(integer) from public, anon, authenticated;
revoke all on function public.sync_finalize_pet_discovery(uuid) from public, anon, authenticated;
revoke all on function public.sync_mark_pet_check(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_kto_event_item(uuid, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kto_pet_candidate(uuid, text, text, jsonb, jsonb, text, text) to service_role;
grant execute on function public.sync_list_pet_enrichment(integer) to service_role;
grant execute on function public.sync_finalize_pet_discovery(uuid) to service_role;
grant execute on function public.sync_mark_pet_check(uuid, text, text, jsonb) to service_role;
grant execute on function public.sync_kto_event_item(uuid, text, jsonb, jsonb) to service_role;

-- Keep the legacy sync RPC usable while writing the richer lifecycle columns.
revoke all on function public.sync_kto_pet_item(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kto_pet_item(uuid, text, jsonb) to service_role;

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
    'pet_policy', coalesce(ppp.pet_policy, 'unknown'),
    'pet_note', coalesce(ppp.pet_note_short, ppp.pet_note_raw),
    'pet_data_status', coalesce(ppp.data_status, 'unknown'),
    'pet_source_updated_at', ppp.source_updated_at,
    'crowd_forecast', (
      select pg_catalog.json_build_object(
        'forecast_date', f.forecast_date,
        'rate', f.forecast_score,
        'level', f.crowd_level
      )
      from core.place_crowd_forecasts f
      where f.place_id = p.id
      order by f.forecast_date desc, f.source_updated_at desc
      limit 1
    ),
    'crowd_data_status', (
      select case
        when f.id is null then 'unknown'
        when f.source_updated_at < pg_catalog.now() - pg_catalog.make_interval(hours => 48) then 'stale'
        else 'fresh'
      end
      from core.place_crowd_forecasts f
      where f.place_id = p.id
      order by f.forecast_date desc, f.source_updated_at desc
      limit 1
    ),
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
  left join core.place_pet_policies ppp on ppp.place_id = p.id
  where (p.slug = p_slug or p.id::text = p_slug)
    and p.is_active = true
  limit 1;

  return v_result;
end;
$$;

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
          'pet_policy', coalesce(ppp.pet_policy, 'unknown'),
          'pet_note', coalesce(ppp.pet_note_short, ppp.pet_note_raw),
          'pet_data_status', coalesce(ppp.data_status, 'unknown'),
          'pet_source_updated_at', ppp.source_updated_at,
          'crowd_forecast', (
            select pg_catalog.json_build_object('forecast_date', f.forecast_date, 'rate', f.forecast_score, 'level', f.crowd_level)
            from core.place_crowd_forecasts f
            where f.place_id = p.id
            order by f.forecast_date desc, f.source_updated_at desc
            limit 1
          ),
          'crowd_data_status', (
            select case
              when f.id is null then 'unknown'
              when f.source_updated_at < pg_catalog.now() - pg_catalog.make_interval(hours => 48) then 'stale'
              else 'fresh'
            end
            from core.place_crowd_forecasts f
            where f.place_id = p.id
            order by f.forecast_date desc, f.source_updated_at desc
            limit 1
          ),
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
      left join core.place_pet_policies ppp on ppp.place_id = p.id
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

create or replace view serving.v_imported_places
with (security_invoker = true)
as
select
  p.id,
  p.slug,
  p.official_name,
  coalesce(pc.display_name, p.official_name) as display_name,
  p.address_full,
  p.lat,
  p.lng,
  p.contact_phone,
  p.source_overview_raw,
  coalesce(pc.short_description, p.short_description) as short_description,
  p.category,
  ps.kto_content_id,
  ps.kto_content_type_id,
  hero.image_url as hero_image_url,
  hero.thumbnail_url as hero_thumbnail_url,
  p.source_modified_at,
  p.is_active,
  coalesce(ppp.pet_policy, 'unknown') as pet_policy,
  coalesce(ppp.pet_note_short, ppp.pet_note_raw) as pet_note,
  coalesce(ppp.data_status, 'unknown') as pet_data_status,
  ppp.source_updated_at as pet_source_updated_at,
  crowd.forecast_date as crowd_forecast_date,
  crowd.forecast_score as crowd_forecast_rate,
  crowd.crowd_level as crowd_forecast_level,
  case
    when crowd.id is null then 'unknown'
    when crowd.source_updated_at < now() - interval '48 hours' then 'stale'
    else 'fresh'
  end as crowd_data_status
from core.places p
left join core.place_sources ps on ps.place_id = p.id
left join editorial.place_copy pc on pc.place_id = p.id
left join core.place_pet_policies ppp on ppp.place_id = p.id
left join lateral (
  select pi.image_url, pi.thumbnail_url
  from core.place_images pi
  where pi.place_id = p.id and pi.is_hero = true
  order by pi.display_order, pi.created_at
  limit 1
) hero on true
left join lateral (
  select f.id, f.forecast_date, f.forecast_score, f.crowd_level, f.source_updated_at
  from core.place_crowd_forecasts f
  where f.place_id = p.id
  order by f.forecast_date desc, f.source_updated_at desc
  limit 1
) crowd on true
where p.is_active = true
  and public.is_published_place(p.id);

create or replace view serving.v_published_places
with (security_invoker = true)
as
select
  p.id,
  p.slug,
  p.official_name,
  p.lat,
  p.lng,
  p.category,
  coalesce(pc.display_name, p.official_name) as display_name,
  pc.night_highlight,
  pps.display_priority,
  hero.image_url as hero_image_url,
  coalesce(ppp.pet_policy, 'unknown') as pet_policy,
  coalesce(ppp.pet_note_short, ppp.pet_note_raw) as pet_note,
  coalesce(ppp.data_status, 'unknown') as pet_data_status,
  ppp.source_updated_at as pet_source_updated_at,
  crowd.forecast_date as crowd_forecast_date,
  crowd.forecast_score as crowd_forecast_rate,
  crowd.crowd_level as crowd_forecast_level,
  case
    when crowd.id is null then 'unknown'
    when crowd.source_updated_at < now() - interval '48 hours' then 'stale'
    else 'fresh'
  end as crowd_data_status
from core.places p
join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
left join editorial.place_copy pc on pc.place_id = p.id
left join core.place_pet_policies ppp on ppp.place_id = p.id
left join lateral (
  select pi.image_url
  from core.place_images pi
  where pi.place_id = p.id and pi.is_hero = true
  order by pi.display_order, pi.created_at, pi.id
  limit 1
) hero on true
left join lateral (
  select f.id, f.forecast_date, f.forecast_score, f.crowd_level, f.source_updated_at
  from core.place_crowd_forecasts f
  where f.place_id = p.id
  order by f.forecast_date desc, f.source_updated_at desc
  limit 1
) crowd on true
where p.is_active = true
order by pps.display_priority desc;

create or replace view serving.v_course_detail
as
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
  (select pi.image_url from core.place_images pi where pi.place_id = p.id and pi.is_hero = true limit 1) as hero_image_url,
  coalesce(ppp.pet_policy, 'unknown') as pet_policy,
  coalesce(ppp.pet_note_short, ppp.pet_note_raw) as pet_note,
  coalesce(ppp.data_status, 'unknown') as pet_data_status,
  ppp.source_updated_at as pet_source_updated_at,
  crowd.forecast_date as crowd_forecast_date,
  crowd.forecast_score as crowd_forecast_rate,
  crowd.crowd_level as crowd_forecast_level,
  case
    when crowd.id is null then 'unknown'
    when crowd.source_updated_at < now() - interval '48 hours' then 'stale'
    else 'fresh'
  end as crowd_data_status
from core.courses c
join editorial.course_copy cc on cc.course_id = c.id
join editorial.course_publish_state cps on cps.course_id = c.id and cps.is_published = true
join core.course_places cp on cp.course_id = c.id
join core.places p on p.id = cp.place_id and p.is_active = true
join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
left join editorial.place_copy pc on pc.place_id = p.id
left join core.place_pet_policies ppp on ppp.place_id = p.id
left join lateral (
  select f.id, f.forecast_date, f.forecast_score, f.crowd_level, f.source_updated_at
  from core.place_crowd_forecasts f
  where f.place_id = p.id
  order by f.forecast_date desc, f.source_updated_at desc
  limit 1
) crowd on true
where not exists (
  select 1
  from core.course_places cp0
  join core.places p0 on p0.id = cp0.place_id
  left join editorial.place_publish_state pps0 on pps0.place_id = p0.id
  where cp0.course_id = c.id
    and (p0.is_active is not true or pps0.is_published is not true)
)
order by c.id, cp.order_index;

create or replace view serving.v_place_detail
as
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
  coalesce(ppp.pet_policy, 'unknown') as pet_policy,
  ppp.pet_note_short,
  (select pg_catalog.json_agg(pg_catalog.json_build_object('id', pi.id, 'image_url', pi.image_url, 'is_hero', pi.is_hero, 'display_order', pi.display_order) order by pi.display_order)
   from core.place_images pi where pi.place_id = p.id) as images,
  coalesce(ppp.pet_note_short, ppp.pet_note_raw) as pet_note,
  coalesce(ppp.data_status, 'unknown') as pet_data_status,
  ppp.source_updated_at as pet_source_updated_at,
  crowd.forecast_date as crowd_forecast_date,
  crowd.forecast_score as crowd_forecast_rate,
  crowd.crowd_level as crowd_forecast_level,
  case
    when crowd.id is null then 'unknown'
    when crowd.source_updated_at < now() - interval '48 hours' then 'stale'
    else 'fresh'
  end as crowd_data_status
from core.places p
join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
left join editorial.place_copy pc on pc.place_id = p.id
left join core.place_pet_policies ppp on ppp.place_id = p.id
left join lateral (
  select f.id, f.forecast_date, f.forecast_score, f.crowd_level, f.source_updated_at
  from core.place_crowd_forecasts f
  where f.place_id = p.id
  order by f.forecast_date desc, f.source_updated_at desc
  limit 1
) crowd on true
where p.is_active = true;

create or replace view serving.v_now_good_spot_candidates
as
select
  p.id as place_id,
  p.slug,
  coalesce(pc.display_name, p.official_name) as display_name,
  hero.image_url as hero_image_url,
  p.lat,
  p.lng,
  pps.display_priority,
  pps.night_suitability_score,
  pps.recommended_from,
  pps.recommended_until,
  pps.recommendation_boost,
  forecast.forecast_score,
  forecast.crowd_level,
  (forecast.forecast_score is not null) as forecast_available,
  case
    when forecast.id is null then 'unknown'
    when forecast.source_updated_at < now() - interval '48 hours' then 'stale'
    else 'fresh'
  end as data_status
from core.places p
join editorial.place_publish_state pps on pps.place_id = p.id
left join editorial.place_copy pc on pc.place_id = p.id
join lateral (
  select pi.image_url
  from core.place_images pi
  where pi.place_id = p.id and pi.is_hero = true
  order by pi.display_order, pi.created_at, pi.id
  limit 1
) hero on true
left join lateral (
  select f.id, f.forecast_score, f.crowd_level, f.source_updated_at
  from core.place_crowd_forecasts f
  where f.place_id = p.id
    and f.forecast_date = ((current_timestamp at time zone 'Asia/Seoul')::date)
  order by f.source_updated_at desc, f.id desc
  limit 1
) forecast on true
where p.is_active = true
  and pps.is_published = true
  and pps.is_now_good_enabled = true;

create or replace view public.v_imported_places
with (security_invoker = true)
as
select imported.*
from serving.v_imported_places imported
join serving.v_published_places published on published.id = imported.id;

create or replace view public.v_published_places
with (security_invoker = true)
as
select imported.*
from serving.v_imported_places imported
join serving.v_published_places published on published.id = imported.id;

create or replace view public.v_now_good_spot_candidates
with (security_invoker = true)
as
select * from serving.v_now_good_spot_candidates;

create or replace view public.v_course_detail
with (security_invoker = true)
as
select
  detail.course_id,
  detail.course_slug,
  detail.theme_tags,
  detail.estimated_duration_min,
  detail.walking_distance_km,
  detail.recommended_start_time,
  detail.pet_ready_flag,
  detail.hero_title,
  detail.subtitle,
  detail.route_summary,
  detail.order_index,
  detail.place_id,
  detail.place_slug,
  detail.official_name,
  detail.lat,
  detail.lng,
  detail.category,
  detail.recommended_stay_min,
  detail.display_name,
  detail.mission_radius_m,
  detail.mission_type,
  detail.mission_prompt,
  detail.couple_question,
  detail.night_highlight,
  detail.photo_tip,
  detail.short_story,
  detail.hero_image_url,
  detail.pet_policy,
  detail.pet_note,
  detail.pet_data_status,
  detail.pet_source_updated_at,
  detail.crowd_forecast_date,
  detail.crowd_forecast_rate,
  detail.crowd_forecast_level,
  detail.crowd_data_status
from serving.v_course_detail detail
where exists (
  select 1 from public.v_home_courses home where home.id = detail.course_id
);

-- Check-ins mutate user-owned progress and must never be callable with anon.
revoke execute on function public.checkin_place(uuid, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.checkin_place(uuid, uuid, numeric, numeric, text) to authenticated, service_role;

-- Preserve the existing public read surface while exposing the additive fields.
grant select on public.v_imported_places, public.v_published_places, public.v_now_good_spot_candidates to anon, authenticated;

grant select (
  id,
  place_id,
  pet_policy,
  pet_note_raw,
  pet_note_short,
  source_updated_at,
  data_status,
  last_checked_at
) on table core.place_pet_policies to anon, authenticated;

drop policy if exists place_pet_policies_public_published on core.place_pet_policies;
create policy place_pet_policies_public_published
on core.place_pet_policies
for select
to anon, authenticated
using (public.is_published_place(place_id));

grant select (
  place_id,
  is_published,
  display_priority,
  is_now_good_enabled,
  night_suitability_score,
  recommended_from,
  recommended_until,
  recommendation_boost
) on table editorial.place_publish_state to anon, authenticated;

drop policy if exists place_publish_state_public_published on editorial.place_publish_state;
create policy place_publish_state_public_published
on editorial.place_publish_state
for select
to anon, authenticated
using (is_published = true);

grant select (
  id,
  place_id,
  forecast_date,
  forecast_score,
  crowd_level,
  source_updated_at
) on table core.place_crowd_forecasts to anon, authenticated;

drop policy if exists place_crowd_forecasts_public_published on core.place_crowd_forecasts;
create policy place_crowd_forecasts_public_published
on core.place_crowd_forecasts
for select
to anon, authenticated
using (public.is_published_place(place_id));

commit;
