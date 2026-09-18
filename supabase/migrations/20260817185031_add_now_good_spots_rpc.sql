ALTER TABLE editorial.place_publish_state
  ADD COLUMN IF NOT EXISTS is_now_good_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS night_suitability_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommended_from time,
  ADD COLUMN IF NOT EXISTS recommended_until time,
  ADD COLUMN IF NOT EXISTS recommendation_boost numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'editorial.place_publish_state'::regclass
      AND conname = 'place_publish_state_night_suitability_score_check'
  ) THEN
    ALTER TABLE editorial.place_publish_state
      ADD CONSTRAINT place_publish_state_night_suitability_score_check
      CHECK (night_suitability_score BETWEEN 0 AND 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'editorial.place_publish_state'::regclass
      AND conname = 'place_publish_state_recommendation_boost_check'
  ) THEN
    ALTER TABLE editorial.place_publish_state
      ADD CONSTRAINT place_publish_state_recommendation_boost_check
      CHECK (recommendation_boost BETWEEN -100 AND 100);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_place_publish_state_now_good_candidates
  ON editorial.place_publish_state (place_id, display_priority)
  WHERE is_published = true AND is_now_good_enabled = true;

CREATE OR REPLACE VIEW serving.v_now_good_spot_candidates AS
SELECT
  p.id                                       AS place_id,
  p.slug,
  COALESCE(pc.display_name, p.official_name) AS display_name,
  hero.image_url                             AS hero_image_url,
  p.lat,
  p.lng,
  pps.display_priority,
  pps.night_suitability_score,
  pps.recommended_from,
  pps.recommended_until,
  pps.recommendation_boost,
  forecast.forecast_score,
  forecast.crowd_level,
  forecast.forecast_score IS NOT NULL         AS forecast_available
FROM core.places AS p
JOIN editorial.place_publish_state AS pps
  ON pps.place_id = p.id
LEFT JOIN editorial.place_copy AS pc
  ON pc.place_id = p.id
JOIN LATERAL (
  SELECT pi.image_url
  FROM core.place_images AS pi
  WHERE pi.place_id = p.id
    AND pi.is_hero = true
  ORDER BY pi.display_order ASC, pi.created_at ASC, pi.id ASC
  LIMIT 1
) AS hero ON true
LEFT JOIN LATERAL (
  SELECT
    f.forecast_score,
    f.crowd_level
  FROM core.place_crowd_forecasts AS f
  WHERE f.place_id = p.id
    AND f.forecast_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::date
  ORDER BY f.source_updated_at DESC, f.id DESC
  LIMIT 1
) AS forecast ON true
WHERE p.is_active = true
  AND pps.is_published = true
  AND pps.is_now_good_enabled = true;

CREATE OR REPLACE FUNCTION public.get_now_good_spots(
  p_lat   numeric DEFAULT NULL,
  p_lng   numeric DEFAULT NULL,
  p_limit integer DEFAULT 2
)
RETURNS TABLE (
  place_id             uuid,
  slug                 text,
  display_name         text,
  hero_image_url       text,
  crowd_level          text,
  distance_m           numeric,
  reason_label         text,
  recommendation_score numeric,
  forecast_status      text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
WITH location AS (
  SELECT
    (
      p_lat IS NOT NULL
      AND p_lng IS NOT NULL
      AND public.ST_DWithin(
        public.ST_SetSRID(
          public.ST_MakePoint(p_lng::float8, p_lat::float8),
          4326
        )::public.geography,
        public.ST_SetSRID(
          public.ST_MakePoint(127.0093, 37.2836),
          4326
        )::public.geography,
        10000
      )
    ) AS is_valid_location,
    CASE
      WHEN p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
        public.ST_SetSRID(
          public.ST_MakePoint(p_lng::float8, p_lat::float8),
          4326
        )::public.geography
      ELSE NULL::public.geography
    END AS user_point,
    (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Seoul')::time AS local_time
),
eligible AS (
  SELECT
    c.*,
    location.is_valid_location,
    CASE
      WHEN location.is_valid_location THEN
        public.ST_Distance(
          public.ST_SetSRID(
            public.ST_MakePoint(c.lng::float8, c.lat::float8),
            4326
          )::public.geography,
          location.user_point
        )::numeric
      ELSE NULL::numeric
    END AS distance_m
  FROM serving.v_now_good_spot_candidates AS c
  CROSS JOIN location
  WHERE
    (
      (c.recommended_from IS NULL AND c.recommended_until IS NULL)
      OR (
        c.recommended_from IS NOT NULL
        AND c.recommended_until IS NOT NULL
        AND c.recommended_from <= c.recommended_until
        AND location.local_time >= c.recommended_from
        AND location.local_time <= c.recommended_until
      )
      OR (
        c.recommended_from IS NOT NULL
        AND c.recommended_until IS NOT NULL
        AND c.recommended_from > c.recommended_until
        AND (
          location.local_time >= c.recommended_from
          OR location.local_time <= c.recommended_until
        )
      )
    )
),
component_scores AS (
  SELECT
    eligible.*,
    CASE
      WHEN eligible.forecast_available THEN
        GREATEST(0::numeric, LEAST(100::numeric, 100 - eligible.forecast_score))
      ELSE NULL::numeric
    END AS crowd_score,
    GREATEST(
      0::numeric,
      LEAST(100::numeric, eligible.night_suitability_score)
    ) AS night_score,
    CASE
      WHEN eligible.distance_m IS NOT NULL THEN
        GREATEST(0::numeric, 100 - eligible.distance_m / 30)
      ELSE NULL::numeric
    END AS distance_score
  FROM eligible
),
weighted_scores AS (
  SELECT
    component_scores.*,
    (
      CASE
        WHEN forecast_available AND distance_m IS NOT NULL THEN
          crowd_score * 0.45
          + night_score * 0.35
          + distance_score * 0.20
        WHEN forecast_available THEN
          crowd_score * (45.0 / 80.0)
          + night_score * (35.0 / 80.0)
        WHEN distance_m IS NOT NULL THEN
          night_score * (35.0 / 55.0)
          + distance_score * (20.0 / 55.0)
        ELSE night_score
      END
      + recommendation_boost
    ) AS raw_score
  FROM component_scores
),
final_scores AS (
  SELECT
    weighted_scores.*,
    GREATEST(0::numeric, LEAST(100::numeric, raw_score)) AS clamped_score
  FROM weighted_scores
)
SELECT
  final_scores.place_id,
  final_scores.slug,
  final_scores.display_name,
  final_scores.hero_image_url,
  CASE
    WHEN final_scores.forecast_available THEN final_scores.crowd_level
    ELSE NULL::text
  END AS crowd_level,
  CASE
    WHEN final_scores.distance_m IS NOT NULL
      THEN ROUND(final_scores.distance_m, 1)
    ELSE NULL::numeric
  END AS distance_m,
  CASE
    WHEN NOT final_scores.forecast_available THEN
      '야간 적합도 기준으로 추천해요'
    WHEN final_scores.crowd_level = '여유' THEN
      '지금 비교적 여유로워요'
    WHEN final_scores.crowd_level = '보통' THEN
      '지금 무난한 편이에요'
    ELSE
      '지금은 조금 붐빌 수 있어요'
  END AS reason_label,
  ROUND(final_scores.clamped_score, 2) AS recommendation_score,
  CASE
    WHEN final_scores.forecast_available THEN 'forecast_available'
    ELSE 'forecast_unavailable'
  END AS forecast_status
FROM final_scores
ORDER BY
  final_scores.clamped_score DESC,
  final_scores.display_priority DESC,
  final_scores.display_name ASC
LIMIT LEAST(20, GREATEST(1, COALESCE(p_limit, 2)));
$function$;

GRANT USAGE ON SCHEMA serving TO anon, authenticated;

GRANT SELECT ON serving.v_now_good_spot_candidates TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_now_good_spots(numeric, numeric, integer) FROM public;

GRANT EXECUTE ON FUNCTION public.get_now_good_spots(numeric, numeric, integer) TO anon, authenticated;

UPDATE editorial.place_publish_state AS pps
SET
  is_published = true,
  is_now_good_enabled = true,
  night_suitability_score = seed.night_suitability_score,
  recommended_from = NULL,
  recommended_until = NULL,
  recommendation_boost = 0,
  published_at = COALESCE(pps.published_at, CURRENT_TIMESTAMP),
  updated_at = CURRENT_TIMESTAMP
FROM core.places AS p
JOIN (
  VALUES
    ('banghwasuryujeong', 95::numeric),
    ('yeonmudae', 94::numeric),
    ('janganmun', 92::numeric),
    ('changnyongmun', 90::numeric),
    ('hwaseong-haenggung', 88::numeric),
    ('hwahongmun', 86::numeric),
    ('seojangdae', 84::numeric)
) AS seed(slug, night_suitability_score)
  ON seed.slug = p.slug
WHERE pps.place_id = p.id;
