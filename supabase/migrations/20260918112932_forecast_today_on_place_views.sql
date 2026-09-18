-- Serve today's crowd forecast on every place surface.
--
-- The place views and RPCs picked the forecast with the highest forecast_date,
-- so a published spot could advertise a rate up to a month ahead while
-- public.v_now_good_spot_candidates filtered on the Seoul-local current date.
-- Route every lookup through core.current_place_forecast so all surfaces agree.

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
      from core.current_place_forecast(p.id) f
    ),
    'crowd_data_status', (
      select case
        when f.id is null then 'unknown'
        when f.source_updated_at < pg_catalog.now() - pg_catalog.make_interval(hours => 48) then 'stale'
        else 'fresh'
      end
      from core.current_place_forecast(p.id) f
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
            from core.current_place_forecast(p.id) f
          ),
          'crowd_data_status', (
            select case
              when f.id is null then 'unknown'
              when f.source_updated_at < pg_catalog.now() - pg_catalog.make_interval(hours => 48) then 'stale'
              else 'fresh'
            end
            from core.current_place_forecast(p.id) f
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
  from core.current_place_forecast(p.id) f
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
  from core.current_place_forecast(p.id) f
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
  from core.current_place_forecast(p.id) f
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
  from core.current_place_forecast(p.id) f
) crowd on true
where p.is_active = true;
