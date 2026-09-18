-- public.v_published_places는 생성 시점에 serving 뷰의 컬럼 목록을 그대로 펼쳐
-- 두었기 때문에, serving 쪽에 컬럼을 추가해도 공개 뷰에는 나타나지 않는다.
-- 공개 뷰에도 야간 문구 세 컬럼을 명시적으로 노출한다.
--
-- 컬럼은 기존 순서를 유지한 채 끝에만 추가한다(42P16 회피). 공개 범위는
-- serving.v_published_places 조인이 그대로 통제한다.
begin;

create or replace view public.v_published_places
with (security_invoker = true)
as
select
  imported.id,
  imported.slug,
  imported.official_name,
  imported.display_name,
  imported.address_full,
  imported.lat,
  imported.lng,
  imported.contact_phone,
  imported.source_overview_raw,
  imported.short_description,
  imported.category,
  imported.kto_content_id,
  imported.kto_content_type_id,
  imported.hero_image_url,
  imported.hero_thumbnail_url,
  imported.source_modified_at,
  imported.is_active,
  imported.pet_policy,
  imported.pet_note,
  imported.pet_data_status,
  imported.pet_source_updated_at,
  imported.crowd_forecast_date,
  imported.crowd_forecast_rate,
  imported.crowd_forecast_level,
  imported.crowd_data_status,
  imported.night_highlight,
  imported.photo_tip,
  imported.short_story
from serving.v_imported_places imported
join serving.v_published_places published on published.id = imported.id;

grant select on public.v_published_places to anon, authenticated;

commit;
