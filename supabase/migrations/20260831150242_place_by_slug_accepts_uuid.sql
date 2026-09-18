-- ================================================================
-- 20260831150209_place_by_slug_accepts_uuid.sql
-- get_place_by_slug RPC가 slug와 UUID 둘 다 받도록 확장.
--
-- 배경: 앱 코스 진행 화면의 "포토미션 확인하기"가 /spot/{spot.id}로 이동하는데
-- spot.id는 core.places.id UUID다. 그런데 SpotRepositorySupabase는 이 값을
-- slug 인자로 get_place_by_slug에 전달해서 NULL 반환 → Dart 캐스트 예외
-- ("Null is not Map<dynamic, dynamic>")가 발생했다.
--
-- 해결: WHERE 절에 (p.slug = p_slug OR p.id::text = p_slug) 를 두어
-- 파라미터가 slug이든 UUID 문자열이든 동일한 스팟 상세를 반환.
--   • 파라미터 이름은 하위 호환을 위해 p_slug 유지.
--   • 반환 shape 변화 없음. 기존 웹/SSR 호출도 그대로 동작.
--   • is_active 조건과 SECURITY DEFINER 정책도 그대로 유지.
-- ================================================================

CREATE OR REPLACE FUNCTION public.get_place_by_slug(p_slug text)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
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
  WHERE
    (p.slug = p_slug OR p.id::text = p_slug)
    AND p.is_active = true
  LIMIT 1;

  RETURN v_result;
END;
$function$;

-- 기존 GRANT 유지 확인용 (변경 없음). SECURITY DEFINER function은 기본적으로
-- postgres/anon/authenticated/service_role에 EXECUTE가 있다.
REVOKE ALL ON FUNCTION public.get_place_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_place_by_slug(text) TO anon, authenticated;
