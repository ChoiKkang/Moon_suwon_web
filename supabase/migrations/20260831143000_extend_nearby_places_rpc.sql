-- ================================================================
-- 20260831143000_extend_nearby_places_rpc.sql
-- '내 주변' 필터 확장: 반경, 정렬 3종, 혼잡도 다중 선택 지원.
--
-- 반환 컬럼 확장:
--   - crowd_level            (오늘 KST 기준 예측이 있으면 '여유'/'보통'/'혼잡', 없으면 NULL)
--   - recommendation_score   (0~100, 혼잡·야간·거리 가중 + recommendation_boost)
--   - night_suitability_score(0~100, editorial 관리)
--   - forecast_status        ('forecast_available' | 'forecast_unavailable')
--
-- 신규 파라미터:
--   - p_sort_by      text     'distance' | 'recommendation' | 'night_suitability'
--   - p_crowd_levels text[]   NULL 또는 빈 배열이면 필터링 없음.
--                              배열이 지정되면 forecast_status='forecast_available' 이면서
--                              crowd_level ∈ p_crowd_levels 인 장소만 반환.
--
-- 기존 3-파라미터 시그니처는 사라진다. 앱 클라이언트가 항상 5-파라미터를
-- 넘기도록 함께 업데이트한다.
-- ================================================================

DROP FUNCTION IF EXISTS public.get_nearby_places(numeric, numeric, integer);

CREATE OR REPLACE FUNCTION public.get_nearby_places(
  p_lat          numeric,
  p_lng          numeric,
  p_radius_m     integer  DEFAULT 3000,
  p_sort_by      text     DEFAULT 'distance',
  p_crowd_levels text[]   DEFAULT NULL
)
RETURNS TABLE (
  id                      uuid,
  slug                    text,
  official_name           text,
  lat                     numeric,
  lng                     numeric,
  category                text,
  display_name            text,
  night_highlight         text,
  hero_image_url          text,
  distance_m              numeric,
  crowd_level             text,
  recommendation_score    numeric,
  night_suitability_score numeric,
  forecast_status         text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
WITH base AS (
  SELECT
    p.id,
    p.slug,
    p.official_name,
    p.lat,
    p.lng,
    p.category,
    COALESCE(pc.display_name, p.official_name)          AS display_name,
    pc.night_highlight,
    hero.image_url                                       AS hero_image_url,
    pps.night_suitability_score,
    pps.recommendation_boost,
    forecast.forecast_score,
    forecast.crowd_level,
    forecast.crowd_level IS NOT NULL                     AS forecast_available,
    ROUND(
      public.ST_Distance(
        public.ST_SetSRID(
          public.ST_MakePoint(p.lng::float8, p.lat::float8), 4326
        )::public.geography,
        public.ST_SetSRID(
          public.ST_MakePoint(p_lng::float8, p_lat::float8), 4326
        )::public.geography
      )::numeric,
      1
    )                                                    AS distance_m
  FROM core.places AS p
  JOIN editorial.place_publish_state AS pps ON pps.place_id = p.id
  LEFT JOIN editorial.place_copy     AS pc  ON pc.place_id  = p.id
  LEFT JOIN LATERAL (
    SELECT pi.image_url
    FROM core.place_images AS pi
    WHERE pi.place_id = p.id AND pi.is_hero = true
    ORDER BY pi.display_order ASC, pi.created_at ASC, pi.id ASC
    LIMIT 1
  ) AS hero ON true
  LEFT JOIN LATERAL (
    SELECT f.forecast_score, f.crowd_level
    FROM core.place_crowd_forecasts AS f
    WHERE f.place_id = p.id
      AND f.forecast_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
    ORDER BY f.source_updated_at DESC, f.id DESC
    LIMIT 1
  ) AS forecast ON true
  WHERE
    pps.is_published = true
    AND p.is_active   = true
    AND public.ST_DWithin(
      public.ST_SetSRID(
        public.ST_MakePoint(p.lng::float8, p.lat::float8), 4326
      )::public.geography,
      public.ST_SetSRID(
        public.ST_MakePoint(p_lng::float8, p_lat::float8), 4326
      )::public.geography,
      p_radius_m
    )
),
scored AS (
  SELECT
    b.*,
    CASE
      WHEN b.forecast_available THEN
        GREATEST(0::numeric, LEAST(100::numeric, 100 - b.forecast_score))
      ELSE NULL::numeric
    END                                                      AS crowd_score,
    GREATEST(0::numeric, LEAST(100::numeric, b.night_suitability_score)) AS night_score,
    GREATEST(0::numeric, 100 - b.distance_m / 30)            AS distance_score
  FROM base AS b
),
weighted AS (
  SELECT
    s.*,
    CASE
      WHEN s.forecast_available THEN
        s.crowd_score    * 0.45
        + s.night_score    * 0.35
        + s.distance_score * 0.20
        + s.recommendation_boost
      ELSE
        s.night_score    * (35.0 / 55.0)
        + s.distance_score * (20.0 / 55.0)
        + s.recommendation_boost
    END AS raw_score
  FROM scored AS s
),
final_scores AS (
  SELECT
    w.*,
    GREATEST(0::numeric, LEAST(100::numeric, w.raw_score)) AS clamped_score
  FROM weighted AS w
)
SELECT
  f.id,
  f.slug,
  f.official_name,
  f.lat,
  f.lng,
  f.category,
  f.display_name,
  f.night_highlight,
  f.hero_image_url,
  f.distance_m,
  CASE WHEN f.forecast_available THEN f.crowd_level ELSE NULL::text END AS crowd_level,
  ROUND(f.clamped_score, 2)                                              AS recommendation_score,
  ROUND(f.night_score, 2)                                                AS night_suitability_score,
  CASE WHEN f.forecast_available THEN 'forecast_available' ELSE 'forecast_unavailable' END AS forecast_status
FROM final_scores AS f
WHERE
  p_crowd_levels IS NULL
  OR array_length(p_crowd_levels, 1) IS NULL
  OR (f.forecast_available AND f.crowd_level = ANY(p_crowd_levels))
ORDER BY
  CASE WHEN COALESCE(p_sort_by, 'distance') = 'distance'          THEN f.distance_m    END ASC  NULLS LAST,
  CASE WHEN COALESCE(p_sort_by, 'distance') = 'recommendation'    THEN f.clamped_score END DESC NULLS LAST,
  CASE WHEN COALESCE(p_sort_by, 'distance') = 'night_suitability' THEN f.night_score   END DESC NULLS LAST,
  f.display_name ASC;
$function$;

REVOKE ALL ON FUNCTION public.get_nearby_places(numeric, numeric, integer, text, text[]) FROM public;

GRANT EXECUTE ON FUNCTION public.get_nearby_places(numeric, numeric, integer, text, text[]) TO anon, authenticated;
