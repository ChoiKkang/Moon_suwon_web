-- ================================================================
-- 20260831130500_add_favorites_rpc.sql
-- 사용자 찜(즐겨찾기) 조회/변경 RPC 추가
--
-- 앱은 core.user_favorites에 직접 접근하지 않고 아래 RPC만 호출한다.
--   • public.list_favorite_spots()     — 로그인 사용자의 찜 스팟 목록
--   • public.list_favorite_courses()   — 로그인 사용자의 찜 코스 목록
--   • public.upsert_favorite(type, id) — 찜 추가 (idempotent)
--   • public.remove_favorite(type, id) — 찜 삭제
--
-- 모든 RPC는 SECURITY INVOKER + auth.uid()로 본인 데이터에만 접근한다.
-- RLS(core.user_favorites의 "favorites_own_or_admin")로 이중 방어된다.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- public.list_favorite_spots | 현재 로그인 사용자의 찜 스팟 목록
--   serving.v_published_places와 조인해 카드 표시에 필요한 필드 반환
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_favorite_spots()
RETURNS TABLE (
  place_id        uuid,
  place_slug      text,
  display_name    text,
  category        text,
  hero_image_url  text,
  night_highlight text,
  favorited_at    timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    vp.id                 AS place_id,
    vp.slug               AS place_slug,
    vp.display_name       AS display_name,
    vp.category           AS category,
    vp.hero_image_url     AS hero_image_url,
    vp.night_highlight    AS night_highlight,
    uf.created_at         AS favorited_at
  FROM core.user_favorites uf
  JOIN serving.v_published_places vp ON vp.id = uf.place_id
  WHERE uf.user_id = (SELECT auth.uid())
    AND uf.target_type = 'spot'
  ORDER BY uf.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.list_favorite_spots() TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- public.list_favorite_courses | 현재 로그인 사용자의 찜 코스 목록
--   serving.v_home_courses와 조인해 카드 표시에 필요한 필드 반환
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_favorite_courses()
RETURNS TABLE (
  course_id               uuid,
  course_slug             text,
  hero_title              text,
  subtitle                text,
  route_summary           text,
  estimated_duration_min  int,
  walking_distance_km     numeric,
  recommended_start_time  text,
  spot_count              bigint,
  hero_image_url          text,
  theme_tags              text[],
  favorited_at            timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    vhc.id                       AS course_id,
    vhc.slug                     AS course_slug,
    vhc.hero_title               AS hero_title,
    vhc.subtitle                 AS subtitle,
    vhc.route_summary            AS route_summary,
    vhc.estimated_duration_min   AS estimated_duration_min,
    vhc.walking_distance_km      AS walking_distance_km,
    vhc.recommended_start_time   AS recommended_start_time,
    vhc.spot_count               AS spot_count,
    vhc.hero_image_url           AS hero_image_url,
    vhc.theme_tags               AS theme_tags,
    uf.created_at                AS favorited_at
  FROM core.user_favorites uf
  JOIN serving.v_home_courses vhc ON vhc.id = uf.course_id
  WHERE uf.user_id = (SELECT auth.uid())
    AND uf.target_type = 'course'
  ORDER BY uf.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.list_favorite_courses() TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- public.upsert_favorite | 찜 추가 (idempotent)
--   p_target_type : 'course' | 'spot'
--   p_target_id   : core.courses.id (course) 또는 core.places.id (spot)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_favorite(
  p_target_type text,
  p_target_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_target_type = 'course' THEN
    INSERT INTO core.user_favorites (user_id, target_type, course_id)
    VALUES (v_user_id, 'course', p_target_id)
    ON CONFLICT (user_id, course_id) DO NOTHING;
  ELSIF p_target_type = 'spot' THEN
    INSERT INTO core.user_favorites (user_id, target_type, place_id)
    VALUES (v_user_id, 'spot', p_target_id)
    ON CONFLICT (user_id, place_id) DO NOTHING;
  ELSE
    RAISE EXCEPTION 'invalid target_type: %', p_target_type
      USING HINT = 'target_type must be either ''course'' or ''spot''';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.upsert_favorite(text, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────
-- public.remove_favorite | 찜 삭제
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_favorite(
  p_target_type text,
  p_target_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF p_target_type = 'course' THEN
    DELETE FROM core.user_favorites
    WHERE user_id = v_user_id
      AND target_type = 'course'
      AND course_id = p_target_id;
  ELSIF p_target_type = 'spot' THEN
    DELETE FROM core.user_favorites
    WHERE user_id = v_user_id
      AND target_type = 'spot'
      AND place_id = p_target_id;
  ELSE
    RAISE EXCEPTION 'invalid target_type: %', p_target_type
      USING HINT = 'target_type must be either ''course'' or ''spot''';
  END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.remove_favorite(text, uuid) TO authenticated;
