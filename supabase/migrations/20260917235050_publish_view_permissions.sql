-- Make the security-invoker imported view usable without reopening
-- unpublished rows through direct PostgREST table access.

begin;

create or replace function public.is_published_place(p_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from core.places p
    join editorial.place_publish_state pps on pps.place_id = p.id
    where p.id = p_place_id
      and p.is_active = true
      and pps.is_published = true
  );
$$;

revoke all on function public.is_published_place(uuid) from public;
grant execute on function public.is_published_place(uuid) to anon, authenticated, service_role;

drop policy if exists places_public_published on core.places;
create policy places_public_published
on core.places
for select
to anon, authenticated
using (public.is_published_place(id));

drop policy if exists place_sources_public_published on core.place_sources;
create policy place_sources_public_published
on core.place_sources
for select
to anon, authenticated
using (public.is_published_place(place_id));

drop policy if exists place_images_public_published on core.place_images;
create policy place_images_public_published
on core.place_images
for select
to anon, authenticated
using (public.is_published_place(place_id));

drop policy if exists place_copy_public_published on editorial.place_copy;
create policy place_copy_public_published
on editorial.place_copy
for select
to anon, authenticated
using (public.is_published_place(place_id));

grant select (
  id,
  slug,
  official_name,
  address_full,
  lat,
  lng,
  contact_phone,
  source_overview_raw,
  short_description,
  recommended_stay_min,
  category,
  source_modified_at,
  is_active
) on table core.places to anon, authenticated;

grant select (place_id, kto_content_id, kto_content_type_id)
on table core.place_sources to anon, authenticated;

grant select (id, place_id, image_url, thumbnail_url, is_hero, display_order, created_at)
on table core.place_images to anon, authenticated;

grant select (
  place_id,
  display_name,
  short_description,
  mission_radius_m,
  night_highlight,
  photo_tip,
  mission_type,
  mission_prompt,
  couple_question,
  short_story,
  og_title,
  og_description,
  og_image_url
) on table editorial.place_copy to anon, authenticated;

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
  p.is_active
from core.places p
left join core.place_sources ps on ps.place_id = p.id
left join editorial.place_copy pc on pc.place_id = p.id
left join lateral (
  select pi.image_url, pi.thumbnail_url
  from core.place_images pi
  where pi.place_id = p.id and pi.is_hero = true
  order by pi.display_order, pi.created_at
  limit 1
) hero on true
where p.is_active = true
  and public.is_published_place(p.id);

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
join editorial.course_publish_state cps on cps.course_id = c.id and cps.is_published = true
join core.course_places cp on cp.course_id = c.id
join core.places p on p.id = cp.place_id and p.is_active = true
join editorial.place_publish_state pps on pps.place_id = p.id and pps.is_published = true
left join editorial.place_copy pc on pc.place_id = p.id
where not exists (
  select 1
  from core.course_places cp0
  join core.places p0 on p0.id = cp0.place_id
  left join editorial.place_publish_state pps0 on pps0.place_id = p0.id
  where cp0.course_id = c.id
    and (p0.is_active is not true or pps0.is_published is not true)
)
order by c.id, cp.order_index;

create or replace view serving.v_local_recommendations as
select
  pls.place_id,
  ls.id as local_spot_id,
  ls.name,
  ls.spot_type,
  ls.summary,
  ls.lat,
  ls.lng,
  ls.walking_minutes,
  ls.pet_friendly,
  (
    select pg_catalog.json_agg(
      pg_catalog.json_build_object('label', lsl.link_label, 'url', lsl.link_url, 'display_order', lsl.display_order)
      order by lsl.display_order
    )
    from core.local_spot_links lsl
    where lsl.local_spot_id = ls.id
  ) as links
from core.place_local_spots pls
join core.local_spots ls on ls.id = pls.local_spot_id
where ls.is_active = true
  and public.is_published_place(pls.place_id);

commit;
