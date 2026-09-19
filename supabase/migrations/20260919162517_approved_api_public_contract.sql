-- Additive, reviewed public contract for the mobile app and promotional web.
-- Raw/candidate tables remain private; only this curated RPC may cross the boundary.

create or replace function public.get_place_by_slug(p_slug text)
returns json
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
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
    'display_name', pg_catalog.coalesce(pc.display_name, p.official_name),
    'mission_radius_m', pg_catalog.coalesce(pc.mission_radius_m, 80),
    'night_highlight', pc.night_highlight,
    'photo_tip', pc.photo_tip,
    'mission_type', pc.mission_type,
    'mission_prompt', pc.mission_prompt,
    'couple_question', pc.couple_question,
    'short_story', pc.short_story,
    'og_title', pg_catalog.coalesce(pc.og_title, pc.display_name, p.official_name),
    'og_description', pc.og_description,
    'og_image_url', pc.og_image_url,
    'pet_policy', pg_catalog.coalesce(ppp.pet_policy, 'unknown'),
    'pet_note', pg_catalog.coalesce(ppp.pet_note_short, ppp.pet_note_raw),
    'pet_data_status', pg_catalog.coalesce(ppp.data_status, 'unknown'),
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
    ),
    'approved_photos', (
      select pg_catalog.json_build_object(
        'items', pg_catalog.coalesce(
          pg_catalog.json_agg(
            pg_catalog.json_build_object(
              'id', photo.id,
              'title', photo.title,
              'image_url', photo.image_url,
              'thumbnail_url', photo.thumbnail_url,
              'copyright_code', photo.copyright_code,
              'photographer', photo.photographer,
              'source_url', photo.source_url
            ) order by photo.title
          ), '[]'::json
        ),
        'data_status', case
          when pg_catalog.max(photo.fetched_at) is null then 'unknown'
          when pg_catalog.max(photo.fetched_at) < pg_catalog.now() - pg_catalog.make_interval(days => 8) then 'stale'
          else 'fresh'
        end,
        'source_updated_at', pg_catalog.max(photo.source_updated_at),
        'fetched_at', pg_catalog.max(photo.fetched_at)
      )
      from core.place_photo_candidates photo
      where photo.place_id = p.id
        and photo.review_status = 'approved'
    ),
    'wellness_tags', (
      select pg_catalog.json_build_object(
        'items', pg_catalog.coalesce(
          pg_catalog.json_agg(
            pg_catalog.json_build_object('name', wellness.name, 'tags', wellness.tags)
            order by wellness.name
          ), '[]'::json
        ),
        'data_status', case
          when pg_catalog.max(wellness.fetched_at) is null then 'unknown'
          when pg_catalog.max(wellness.fetched_at) < pg_catalog.now() - pg_catalog.make_interval(days => 8) then 'stale'
          else 'fresh'
        end,
        'source_updated_at', pg_catalog.max(wellness.source_updated_at),
        'fetched_at', pg_catalog.max(wellness.fetched_at)
      )
      from core.place_wellness wellness
      where wellness.place_id = p.id
        and wellness.review_status = 'approved'
    ),
    'related_places', (
      select pg_catalog.json_build_object(
        'items', pg_catalog.coalesce(
          pg_catalog.json_agg(
            pg_catalog.json_build_object(
              'id', related.id,
              'slug', related.slug,
              'display_name', pg_catalog.coalesce(related_copy.display_name, related.official_name),
              'relation_score', relation.relation_score
            ) order by relation.relation_score desc nulls last, related.official_name
          ), '[]'::json
        ),
        'data_status', case
          when pg_catalog.max(relation.fetched_at) is null then 'unknown'
          when pg_catalog.max(relation.fetched_at) < pg_catalog.now() - pg_catalog.make_interval(days => 35) then 'stale'
          else 'fresh'
        end,
        'source_updated_at', null,
        'fetched_at', pg_catalog.max(relation.fetched_at)
      )
      from core.place_relations relation
      join core.places related
        on related.id = relation.related_place_id
       and related.is_active = true
      join editorial.place_publish_state related_state
        on related_state.place_id = related.id
       and related_state.is_published = true
      left join editorial.place_copy related_copy on related_copy.place_id = related.id
      where relation.origin_place_id = p.id
        and relation.review_status = 'approved'
    ),
    'weather_summary', (
      select pg_catalog.json_build_object(
        'items', pg_catalog.coalesce(
          pg_catalog.json_agg(
            pg_catalog.json_build_object(
              'forecast_at', weather.forecast_at,
              'category', weather.category,
              'value_text', weather.value_text,
              'value_number', weather.value_number,
              'unit', weather.unit
            ) order by weather.forecast_at, weather.category
          ), '[]'::json
        ),
        'data_status', case
          when pg_catalog.max(weather.fetched_at) is null then 'unknown'
          when pg_catalog.max(weather.fetched_at) < pg_catalog.now() - pg_catalog.make_interval(hours => 8) then 'stale'
          else 'fresh'
        end,
        'source_updated_at', pg_catalog.max(weather.issued_at),
        'fetched_at', pg_catalog.max(weather.fetched_at)
      )
      from core.weather_forecasts weather
      where weather.forecast_kind = 'short'
        and weather.scope_key = '60:121'
        and weather.issued_at = (
          select pg_catalog.max(latest_weather.issued_at)
          from core.weather_forecasts latest_weather
          where latest_weather.forecast_kind = 'short'
            and latest_weather.scope_key = '60:121'
        )
        and weather.forecast_at >= pg_catalog.now() - pg_catalog.make_interval(hours => 1)
        and weather.forecast_at <= pg_catalog.now() + pg_catalog.make_interval(hours => 24)
    ),
    'mid_weather_summary', (
      select pg_catalog.json_build_object(
        'items', pg_catalog.coalesce(
          pg_catalog.json_agg(
            pg_catalog.json_build_object(
              'forecast_at', weather.forecast_at,
              'category', weather.category,
              'value_text', weather.value_text,
              'value_number', weather.value_number,
              'unit', weather.unit
            ) order by weather.forecast_at, weather.category
          ), '[]'::json
        ),
        'data_status', case
          when pg_catalog.max(weather.fetched_at) is null then 'unknown'
          when pg_catalog.max(weather.fetched_at) < pg_catalog.now() - pg_catalog.make_interval(hours => 18) then 'stale'
          else 'fresh'
        end,
        'source_updated_at', pg_catalog.max(weather.issued_at),
        'fetched_at', pg_catalog.max(weather.fetched_at)
      )
      from core.weather_forecasts weather
      where weather.forecast_kind = 'mid'
        and weather.scope_key = '11B00000:11B10101'
        and weather.issued_at = (
          select pg_catalog.max(latest_weather.issued_at)
          from core.weather_forecasts latest_weather
          where latest_weather.forecast_kind = 'mid'
            and latest_weather.scope_key = '11B00000:11B10101'
        )
        and weather.forecast_at >= pg_catalog.now()
    ),
    'nearby_bus_arrivals', (
      select pg_catalog.json_build_object(
        'items', pg_catalog.coalesce(
          pg_catalog.json_agg(
            pg_catalog.json_build_object(
              'station_id', stop.station_id,
              'station_name', stop.station_name,
              'route_id', arrival.route_id,
              'route_name', arrival.route_name,
              'arrival_order', arrival.arrival_order,
              'arrival_seconds', arrival.arrival_seconds,
              'remaining_stops', arrival.remaining_stops
            ) order by stop.station_name, arrival.arrival_seconds nulls last
          ), '[]'::json
        ),
        'data_status', case
          when pg_catalog.max(arrival.fetched_at) is null then 'unknown'
          when pg_catalog.max(arrival.fetched_at) < pg_catalog.now() - pg_catalog.make_interval(mins => 5) then 'expired'
          when pg_catalog.max(arrival.fetched_at) < pg_catalog.now() - pg_catalog.make_interval(mins => 2) then 'stale'
          else 'fresh'
        end,
        'source_updated_at', pg_catalog.max(arrival.fetched_at),
        'fetched_at', pg_catalog.max(arrival.fetched_at)
      )
      from core.place_bus_stops stop
      join core.bus_arrival_snapshots arrival on arrival.station_id = stop.station_id
      where stop.place_id = p.id
        and stop.review_status = 'approved'
        and arrival.fetched_at >= pg_catalog.now() - pg_catalog.make_interval(mins => 5)
    )
  )
  into v_result
  from core.places p
  join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
  left join editorial.place_copy pc on pc.place_id = p.id
  left join core.place_pet_policies ppp on ppp.place_id = p.id
  where (
      p.slug = p_slug
      or normalize(p.slug, nfc) = normalize(p_slug, nfc)
      or p.id::text = p_slug
    )
    and p.is_active = true
  limit 1;

  return v_result;
end;
$$;

revoke all on function public.get_place_by_slug(text) from public;
grant execute on function public.get_place_by_slug(text) to anon, authenticated;

create or replace function public.admin_get_regional_visitor_summary(
  p_from date default (current_date - 30),
  p_to date default current_date
)
returns table(
  stat_date date,
  district_code text,
  visitor_type text,
  visitor_count numeric,
  source_updated_at timestamptz,
  fetched_at timestamptz
)
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select
    visitors.stat_date,
    visitors.district_code,
    visitors.visitor_type,
    visitors.visitor_count,
    visitors.source_updated_at,
    visitors.fetched_at
  from core.regional_visitor_stats visitors
  where visitors.stat_date between p_from and p_to
  order by visitors.stat_date, visitors.district_code, visitors.visitor_type;
$$;

revoke all on function public.admin_get_regional_visitor_summary(date, date) from public, anon, authenticated;
grant execute on function public.admin_get_regional_visitor_summary(date, date) to service_role;
