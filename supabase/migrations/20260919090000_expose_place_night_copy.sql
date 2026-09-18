-- 장소 상세 페이지는 운영자가 입력한 야간 포인트·포토 팁·짧은 이야기를 보여준다.
-- 이 값들은 serving.v_course_detail에만 노출되어 있어서, 코스에 포함되지 않은
-- 공개 장소는 문구가 있어도 화면에 아무것도 표시할 수 없었다.
--
-- 뷰는 이미 editorial.place_copy를 조인하고 있으므로 컬럼만 추가한다. 공개
-- 대상은 기존과 동일하게 is_published_place()가 통제하고, place_copy의 컬럼
-- 단위 grant에 이미 세 컬럼이 포함되어 있어 권한 변경은 필요하지 않다.
--
-- create or replace view는 기존 컬럼 순서를 바꿀 수 없으므로(42P16) 새 컬럼은
-- 반드시 목록 끝에 붙인다. 이렇게 하면 컬럼 순서에 의존하는 모바일 앱 쪽
-- 소비자도 영향을 받지 않는다.
begin;

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
  coalesce(ppp.pet_policy, 'unknown'::text) as pet_policy,
  coalesce(ppp.pet_note_short, ppp.pet_note_raw) as pet_note,
  coalesce(ppp.data_status, 'unknown'::text) as pet_data_status,
  ppp.source_updated_at as pet_source_updated_at,
  crowd.forecast_date as crowd_forecast_date,
  crowd.forecast_score as crowd_forecast_rate,
  crowd.crowd_level as crowd_forecast_level,
  case
    when crowd.id is null then 'unknown'::text
    when crowd.source_updated_at < (now() - '48:00:00'::interval) then 'stale'::text
    else 'fresh'::text
  end as crowd_data_status,
  pc.night_highlight,
  pc.photo_tip,
  pc.short_story
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
    from core.current_place_forecast(p.id) f(id, forecast_date, forecast_score, crowd_level, source_updated_at)
  ) crowd on true
where p.is_active = true and is_published_place(p.id);

commit;
