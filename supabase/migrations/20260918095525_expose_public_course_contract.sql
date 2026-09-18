begin;

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

grant select on public.v_course_detail to anon, authenticated;

commit;
