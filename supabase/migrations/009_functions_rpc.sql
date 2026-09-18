-- ================================================================
-- 009_functions_rpc.sql
-- RPC 함수 (PostgREST 노출을 위해 public 스키마에 정의)
-- ================================================================

-- PostGIS 활성화 (get_nearby_places, checkin_place 거리 계산에 필요)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ────────────────────────────────────────────────────────────────
-- get_course_detail | 코스 상세 단건 조합 (앱: course_id 기반)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_course_detail(p_course_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'id',                     c.id,
    'slug',                   c.slug,
    'theme_tags',             c.theme_tags,
    'estimated_duration_min', c.estimated_duration_min,
    'walking_distance_km',    c.walking_distance_km,
    'recommended_start_time', c.recommended_start_time,
    'pet_ready_flag',         c.pet_ready_flag,
    'hero_title',             cc.hero_title,
    'subtitle',               cc.subtitle,
    'route_summary',          cc.route_summary,
    'places', (
      SELECT json_agg(
        json_build_object(
          'order_index',        cp.order_index,
          'place_id',           p.id,
          'slug',               p.slug,
          'official_name',      p.official_name,
          'display_name',       COALESCE(pc.display_name, p.official_name),
          'lat',                p.lat,
          'lng',                p.lng,
          'category',           p.category,
          'recommended_stay_min', p.recommended_stay_min,
          'mission_type',       pc.mission_type,
          'mission_prompt',     pc.mission_prompt,
          'mission_radius_m',   COALESCE(pc.mission_radius_m, 80),
          'couple_question',    pc.couple_question,
          'night_highlight',    pc.night_highlight,
          'photo_tip',          pc.photo_tip,
          'short_story',        pc.short_story,
          'hero_image_url', (
            SELECT pi.image_url
            FROM core.place_images pi
            WHERE pi.place_id = p.id AND pi.is_hero = true
            LIMIT 1
          )
        ) ORDER BY cp.order_index
      )
      FROM core.course_places cp
      JOIN core.places p             ON p.id = cp.place_id
      LEFT JOIN editorial.place_copy pc ON pc.place_id = p.id
      WHERE cp.course_id = c.id
    )
  )
  INTO v_result
  FROM core.courses c
  JOIN editorial.course_copy cc ON cc.course_id = c.id
  WHERE c.id = p_course_id;

  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- get_course_by_slug | 코스 상세 단건 조합 (웹: slug 기반, SSR용)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_course_by_slug(p_slug text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_course_id uuid;
BEGIN
  SELECT id INTO v_course_id FROM core.courses WHERE slug = p_slug;
  RETURN public.get_course_detail(v_course_id);
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- get_place_by_slug | 스팟 상세 단건 조합 (웹: slug 기반, SSR용)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_place_by_slug(p_slug text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'id',                   p.id,
    'slug',                 p.slug,
    'official_name',        p.official_name,
    'address_full',         p.address_full,
    'lat',                  p.lat,
    'lng',                  p.lng,
    'contact_phone',        p.contact_phone,
    'short_description',    p.short_description,
    'recommended_stay_min', p.recommended_stay_min,
    'category',             p.category,
    'display_name',         COALESCE(pc.display_name, p.official_name),
    'mission_radius_m',     COALESCE(pc.mission_radius_m, 80),
    'night_highlight',      pc.night_highlight,
    'photo_tip',            pc.photo_tip,
    'mission_type',         pc.mission_type,
    'mission_prompt',       pc.mission_prompt,
    'couple_question',      pc.couple_question,
    'short_story',          pc.short_story,
    'og_title',             COALESCE(pc.og_title, pc.display_name, p.official_name),
    'og_description',       pc.og_description,
    'og_image_url',         pc.og_image_url,
    'images', (
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
    )
  )
  INTO v_result
  FROM core.places p
  LEFT JOIN editorial.place_copy pc ON pc.place_id = p.id
  WHERE p.slug = p_slug AND p.is_active = true;

  RETURN v_result;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- get_nearby_places | 현재 위치 기준 인근 스팟 (앱 전용)
-- PostGIS ST_DWithin 사용. 거리순 정렬.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_nearby_places(
  p_lat      numeric,
  p_lng      numeric,
  p_radius_m int DEFAULT 500
)
RETURNS TABLE (
  id              uuid,
  slug            text,
  official_name   text,
  lat             numeric,
  lng             numeric,
  category        text,
  display_name    text,
  night_highlight text,
  hero_image_url  text,
  distance_m      numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.slug,
    p.official_name,
    p.lat,
    p.lng,
    p.category,
    COALESCE(pc.display_name, p.official_name)  AS display_name,
    pc.night_highlight,
    (
      SELECT pi.image_url
      FROM core.place_images pi
      WHERE pi.place_id = p.id AND pi.is_hero = true
      LIMIT 1
    )                                           AS hero_image_url,
    ROUND(
      ST_Distance(
        ST_SetSRID(ST_MakePoint(p.lng::float8, p.lat::float8), 4326)::geography,
        ST_SetSRID(ST_MakePoint(p_lng::float8, p_lat::float8), 4326)::geography
      )::numeric,
      1
    )                                           AS distance_m
  FROM core.places p
  JOIN editorial.place_publish_state pps ON pps.place_id = p.id
  LEFT JOIN editorial.place_copy     pc  ON pc.place_id  = p.id
  WHERE
    pps.is_published = true
    AND p.is_active  = true
    AND ST_DWithin(
      ST_SetSRID(ST_MakePoint(p.lng::float8, p.lat::float8), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng::float8, p_lat::float8), 4326)::geography,
      p_radius_m
    )
  ORDER BY distance_m;
END;
$$;

-- ────────────────────────────────────────────────────────────────
-- checkin_place | 체크인 판정 및 진행 상태 갱신 (앱 전용)
-- SECURITY DEFINER로 RLS 우회 → 내부 검증 후 직접 INSERT
-- 반환값: 'success' | 'out_of_range' | 'already_checked'
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.checkin_place(
  p_progress_id uuid,
  p_place_id    uuid,
  p_lat         numeric,
  p_lng         numeric,
  p_mode        text   -- 'auto' | 'manual'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid;
  v_place_lat  numeric;
  v_place_lng  numeric;
  v_radius_m   int;
  v_distance_m float8;
BEGIN
  -- 진행 기록이 호출 사용자 소유인지 확인
  SELECT ucp.user_id
  INTO v_user_id
  FROM core.user_course_progress ucp
  WHERE ucp.id = p_progress_id;

  IF v_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: progress record does not belong to current user';
  END IF;

  -- 중복 체크인 확인
  IF EXISTS (
    SELECT 1 FROM core.user_place_checkins
    WHERE progress_id = p_progress_id AND place_id = p_place_id
  ) THEN
    RETURN 'already_checked';
  END IF;

  -- 스팟 위치 및 체크인 반경 조회
  SELECT p.lat, p.lng, COALESCE(pc.mission_radius_m, 80)
  INTO v_place_lat, v_place_lng, v_radius_m
  FROM core.places p
  LEFT JOIN editorial.place_copy pc ON pc.place_id = p.id
  WHERE p.id = p_place_id;

  -- auto 모드: GPS 거리 판정
  IF p_mode = 'auto' THEN
    v_distance_m := ST_Distance(
      ST_SetSRID(ST_MakePoint(v_place_lng::float8, v_place_lat::float8), 4326)::geography,
      ST_SetSRID(ST_MakePoint(p_lng::float8, p_lat::float8), 4326)::geography
    );

    IF v_distance_m > v_radius_m THEN
      RETURN 'out_of_range';
    END IF;
  END IF;

  -- 체크인 기록 저장
  INSERT INTO core.user_place_checkins (progress_id, place_id, check_mode, lat_at_check, lng_at_check)
  VALUES (p_progress_id, p_place_id, p_mode, p_lat, p_lng);

  RETURN 'success';
END;
$$;
