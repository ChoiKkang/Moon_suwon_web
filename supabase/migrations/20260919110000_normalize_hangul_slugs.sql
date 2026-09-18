-- Make Hangul slugs survive Unicode normalization.
--
-- normalizeSlug() stored title.normalize('NFKD') output, so Korean titles were
-- saved with their syllables split into conjoining jamo. Browsers and macOS
-- share URLs in NFC, so a visitor opening a Hangul place URL sent a composed
-- slug that never equalled the decomposed row and got a 404.
--
-- Recompose the stored slugs and match on the normalized form in both slug
-- lookup RPCs, so the mobile app and the web resolve a place or course whichever
-- form a client sends. The function bodies below are the deployed definitions
-- with only the WHERE clause changed.

update core.places
set slug = normalize(slug, nfc)
where slug <> normalize(slug, nfc);

update core.courses
set slug = normalize(slug, nfc)
where slug <> normalize(slug, nfc);

create or replace function public.get_place_by_slug(p_slug text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
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
  where (
      p.slug = p_slug
      or normalize(p.slug, nfc) = normalize(p_slug, nfc)
      or p.id::text = p_slug
    )
    and p.is_active = true
  limit 1;

  return v_result;
end;
$$
;

create or replace function public.get_course_by_slug(p_slug text)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $$
declare
  v_course_id uuid;
begin
  select c.id
  into v_course_id
  from core.courses c
  join editorial.course_publish_state cps on cps.course_id = c.id and cps.is_published = true
  where (
      c.slug = p_slug
      or normalize(c.slug, nfc) = normalize(p_slug, nfc)
      or c.id::text = p_slug
    )
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
$$
;

grant execute on function public.get_place_by_slug(text) to anon, authenticated;
grant execute on function public.get_course_by_slug(text) to anon, authenticated;
