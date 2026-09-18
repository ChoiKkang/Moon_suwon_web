-- ================================================================
-- 007_serving_views.sql
-- 앱/웹이 읽는 serving 스키마 View (쓰기 불가)
-- 모든 뷰는 postgres 소유 → RLS 우회로 editorial 데이터 읽기 가능
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- v_home_courses | 홈 코스 카드 목록 (published 코스만)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW serving.v_home_courses AS
SELECT
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
  (
    SELECT COUNT(*)
    FROM core.course_places cp
    WHERE cp.course_id = c.id
  ) AS spot_count,
  (
    SELECT pi.image_url
    FROM core.course_places cp2
    JOIN core.place_images pi
      ON pi.place_id = cp2.place_id AND pi.is_hero = true
    WHERE cp2.course_id = c.id
    ORDER BY cp2.order_index
    LIMIT 1
  ) AS hero_image_url
FROM core.courses c
JOIN editorial.course_copy cc           ON cc.course_id  = c.id
JOIN editorial.course_publish_state cps ON cps.course_id = c.id
WHERE cps.is_published = true
ORDER BY cps.display_priority ASC;

-- ────────────────────────────────────────────────────────────────
-- v_course_detail | 코스 상세 (스팟 목록 포함, 앱 UUID 기반)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW serving.v_course_detail AS
SELECT
  c.id                                              AS course_id,
  c.slug                                            AS course_slug,
  c.theme_tags,
  c.estimated_duration_min,
  c.walking_distance_km,
  c.recommended_start_time,
  c.pet_ready_flag,
  cc.hero_title,
  cc.subtitle,
  cc.route_summary,
  cp.order_index,
  p.id                                              AS place_id,
  p.slug                                            AS place_slug,
  p.official_name,
  p.lat,
  p.lng,
  p.category,
  p.recommended_stay_min,
  COALESCE(pc.display_name, p.official_name)        AS display_name,
  COALESCE(pc.mission_radius_m, 80)                 AS mission_radius_m,
  pc.mission_type,
  pc.mission_prompt,
  pc.couple_question,
  pc.night_highlight,
  pc.photo_tip,
  pc.short_story,
  (
    SELECT pi.image_url
    FROM core.place_images pi
    WHERE pi.place_id = p.id AND pi.is_hero = true
    LIMIT 1
  )                                                 AS hero_image_url
FROM core.courses c
JOIN editorial.course_copy cc  ON cc.course_id = c.id
JOIN core.course_places cp     ON cp.course_id = c.id
JOIN core.places p             ON p.id         = cp.place_id
LEFT JOIN editorial.place_copy pc ON pc.place_id = p.id
ORDER BY c.id, cp.order_index;

-- ────────────────────────────────────────────────────────────────
-- v_place_detail | 스팟 상세
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW serving.v_place_detail AS
SELECT
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
  COALESCE(pc.display_name, p.official_name)  AS display_name,
  COALESCE(pc.mission_radius_m, 80)           AS mission_radius_m,
  pc.night_highlight,
  pc.photo_tip,
  pc.mission_type,
  pc.mission_prompt,
  pc.couple_question,
  pc.short_story,
  ppp.pet_policy,
  ppp.pet_note_short,
  (
    SELECT json_agg(
      json_build_object(
        'id',            pi.id,
        'image_url',     pi.image_url,
        'is_hero',       pi.is_hero,
        'display_order', pi.display_order
      ) ORDER BY pi.display_order
    )
    FROM core.place_images pi
    WHERE pi.place_id = p.id
  )                                           AS images
FROM core.places p
LEFT JOIN editorial.place_copy        pc  ON pc.place_id  = p.id
LEFT JOIN core.place_pet_policies     ppp ON ppp.place_id = p.id
WHERE p.is_active = true;

-- ────────────────────────────────────────────────────────────────
-- v_published_places | 공개된 스팟 목록 (내 주변 등)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW serving.v_published_places AS
SELECT
  p.id,
  p.slug,
  p.official_name,
  p.lat,
  p.lng,
  p.category,
  COALESCE(pc.display_name, p.official_name)  AS display_name,
  pc.night_highlight,
  pps.display_priority,
  (
    SELECT pi.image_url
    FROM core.place_images pi
    WHERE pi.place_id = p.id AND pi.is_hero = true
    LIMIT 1
  )                                           AS hero_image_url
FROM core.places p
JOIN editorial.place_publish_state pps ON pps.place_id = p.id
LEFT JOIN editorial.place_copy     pc  ON pc.place_id  = p.id
WHERE pps.is_published = true AND p.is_active = true
ORDER BY pps.display_priority DESC;

-- ────────────────────────────────────────────────────────────────
-- v_local_recommendations | 특정 place 기준 로컬 추천
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW serving.v_local_recommendations AS
SELECT
  pls.place_id,
  ls.id             AS local_spot_id,
  ls.name,
  ls.spot_type,
  ls.summary,
  ls.lat,
  ls.lng,
  ls.walking_minutes,
  ls.pet_friendly,
  (
    SELECT json_agg(
      json_build_object(
        'label',         lsl.link_label,
        'url',           lsl.link_url,
        'display_order', lsl.display_order
      ) ORDER BY lsl.display_order
    )
    FROM core.local_spot_links lsl
    WHERE lsl.local_spot_id = ls.id
  )                 AS links
FROM core.place_local_spots pls
JOIN core.local_spots ls ON ls.id = pls.local_spot_id
WHERE ls.is_active = true;

-- ────────────────────────────────────────────────────────────────
-- v_web_course_page | [웹 전용] 코스 SEO 페이지용 (/courses/{slug})
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW serving.v_web_course_page AS
SELECT
  c.id,
  c.slug,
  c.theme_tags,
  c.estimated_duration_min,
  c.walking_distance_km,
  c.recommended_start_time,
  cc.hero_title,
  cc.subtitle,
  cc.route_summary,
  COALESCE(cc.og_title, cc.hero_title)  AS og_title,
  cc.og_description,
  cc.og_image_url,
  (
    SELECT json_agg(
      json_build_object(
        'order_index',   cp.order_index,
        'place_id',      p.id,
        'slug',          p.slug,
        'display_name',  COALESCE(pc.display_name, p.official_name),
        'hero_image_url', (
          SELECT pi.image_url
          FROM core.place_images pi
          WHERE pi.place_id = p.id AND pi.is_hero = true
          LIMIT 1
        )
      ) ORDER BY cp.order_index
    )
    FROM core.course_places cp
    JOIN core.places p           ON p.id          = cp.place_id
    LEFT JOIN editorial.place_copy pc ON pc.place_id = p.id
    WHERE cp.course_id = c.id AND cp.order_index <= 3
  )                               AS preview_spots
FROM core.courses c
JOIN editorial.course_copy cc           ON cc.course_id  = c.id
JOIN editorial.course_publish_state cps ON cps.course_id = c.id
WHERE cps.is_published = true;

-- ────────────────────────────────────────────────────────────────
-- v_web_place_page | [웹 전용] 스팟 SEO 페이지용 (/places/{slug})
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW serving.v_web_place_page AS
SELECT
  p.id,
  p.slug,
  p.official_name,
  p.address_full,
  p.lat,
  p.lng,
  p.short_description,
  p.category,
  COALESCE(pc.display_name, p.official_name)                        AS display_name,
  pc.night_highlight,
  pc.photo_tip,
  COALESCE(pc.og_title, pc.display_name, p.official_name)           AS og_title,
  pc.og_description,
  pc.og_image_url,
  (
    SELECT json_agg(
      json_build_object(
        'id',            pi.id,
        'image_url',     pi.image_url,
        'is_hero',       pi.is_hero,
        'display_order', pi.display_order
      ) ORDER BY pi.display_order
    )
    FROM core.place_images pi
    WHERE pi.place_id = p.id
  )                                                                  AS images
FROM core.places p
JOIN editorial.place_publish_state pps ON pps.place_id = p.id
LEFT JOIN editorial.place_copy     pc  ON pc.place_id  = p.id
WHERE pps.is_published = true AND p.is_active = true;

-- ────────────────────────────────────────────────────────────────
-- 앱/웹에 serving 스키마 SELECT 권한 부여
-- ────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA serving TO anon, authenticated;

GRANT SELECT ON ALL TABLES IN SCHEMA serving TO anon, authenticated;
