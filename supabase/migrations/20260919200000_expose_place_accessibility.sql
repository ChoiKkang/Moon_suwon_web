-- 무장애 정보를 서빙 계층과 공개 계약에 노출한다.
--
-- 컬럼은 기존 순서를 유지한 채 끝에만 추가한다(42P16 회피). 모바일 앱이 읽는
-- 컬럼 순서가 바뀌지 않으므로 기존 클라이언트는 영향을 받지 않는다.
--
-- security_invoker 뷰라서 anon에게 컬럼 grant가 없으면 permission denied가 난다.
-- 새 컬럼을 명시적으로 grant한다.

create or replace view serving.v_imported_places
with (security_invoker = true)
as
SELECT p.id,
    p.slug,
    p.official_name,
    COALESCE(pc.display_name, p.official_name) AS display_name,
    p.address_full,
    p.lat,
    p.lng,
    p.contact_phone,
    p.source_overview_raw,
    COALESCE(pc.short_description, p.short_description) AS short_description,
    p.category,
    ps.kto_content_id,
    ps.kto_content_type_id,
    hero.image_url AS hero_image_url,
    hero.thumbnail_url AS hero_thumbnail_url,
    p.source_modified_at,
    p.is_active,
    COALESCE(ppp.pet_policy, 'unknown'::text) AS pet_policy,
    COALESCE(ppp.pet_note_short, ppp.pet_note_raw) AS pet_note,
    COALESCE(ppp.data_status, 'unknown'::text) AS pet_data_status,
    ppp.source_updated_at AS pet_source_updated_at,
    crowd.forecast_date AS crowd_forecast_date,
    crowd.forecast_score AS crowd_forecast_rate,
    crowd.crowd_level AS crowd_forecast_level,
        CASE
            WHEN crowd.id IS NULL THEN 'unknown'::text
            WHEN crowd.source_updated_at < (now() - '48:00:00'::interval) THEN 'stale'::text
            ELSE 'fresh'::text
        END AS crowd_data_status,
    pc.night_highlight,
    pc.photo_tip,
    pc.short_story,
    pa.route_note AS access_route,
    pa.exit_note AS access_exit,
    pa.elevator_note AS access_elevator,
    pa.parking_note AS access_parking,
    pa.public_transport_note AS access_public_transport,
    pa.wheelchair_note AS access_wheelchair,
    pa.braille_block_note AS access_braille_block,
    pa.braille_promotion_note AS access_braille_promotion,
    pa.audio_guide_note AS access_audio_guide,
    pa.big_print_note AS access_big_print,
    pa.help_dog_note AS access_help_dog,
    pa.restroom_note AS access_restroom,
    pa.lactation_room_note AS access_lactation_room,
    pa.stroller_note AS access_stroller,
    pa.infants_family_note AS access_infants_family,
    pa.etc_note AS access_etc,
    pa.source_updated_at AS access_source_updated_at
   FROM core.places p
     LEFT JOIN core.place_sources ps ON ps.place_id = p.id
     LEFT JOIN editorial.place_copy pc ON pc.place_id = p.id
     LEFT JOIN core.place_pet_policies ppp ON ppp.place_id = p.id
     LEFT JOIN core.place_accessibility pa ON pa.place_id = p.id
     LEFT JOIN LATERAL ( SELECT pi.image_url,
            pi.thumbnail_url
           FROM core.place_images pi
          WHERE pi.place_id = p.id AND pi.is_hero = true
          ORDER BY pi.display_order, pi.created_at
         LIMIT 1) hero ON true
     LEFT JOIN LATERAL ( SELECT f.id,
            f.forecast_date,
            f.forecast_score,
            f.crowd_level,
            f.source_updated_at
           FROM core.current_place_forecast(p.id) f(id, forecast_date, forecast_score, crowd_level, source_updated_at)) crowd ON true
  WHERE p.is_active = true AND is_published_place(p.id);

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
  imported.short_story,
  imported.access_route,
  imported.access_exit,
  imported.access_elevator,
  imported.access_parking,
  imported.access_public_transport,
  imported.access_wheelchair,
  imported.access_braille_block,
  imported.access_braille_promotion,
  imported.access_audio_guide,
  imported.access_big_print,
  imported.access_help_dog,
  imported.access_restroom,
  imported.access_lactation_room,
  imported.access_stroller,
  imported.access_infants_family,
  imported.access_etc,
  imported.access_source_updated_at
from serving.v_imported_places imported
join serving.v_published_places published on published.id = imported.id;

grant select on public.v_published_places to anon, authenticated;
grant select on serving.v_imported_places to anon, authenticated;
