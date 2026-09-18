ALTER TABLE editorial.place_copy
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS mission_title text,
  ADD COLUMN IF NOT EXISTS mission_body text;

DO $$
DECLARE
  canonical_place_id uuid;
  duplicate_place_id uuid;
BEGIN
  SELECT p.id
    INTO canonical_place_id
  FROM core.places AS p
  JOIN core.place_sources AS ps ON ps.place_id = p.id
  WHERE p.slug = 'yeonmudae'
    AND ps.kto_content_id = '1064469'
  LIMIT 1;

  SELECT p.id
    INTO duplicate_place_id
  FROM core.places AS p
  LEFT JOIN core.place_sources AS ps ON ps.place_id = p.id
  WHERE p.official_name = '연무대(동장대)'
    AND p.id IS DISTINCT FROM canonical_place_id
    AND ps.id IS NULL
  ORDER BY p.created_at NULLS LAST, p.id
  LIMIT 1;

  IF canonical_place_id IS NOT NULL
     AND duplicate_place_id IS NOT NULL THEN
    DELETE FROM core.place_images AS canonical_image
    USING core.place_images AS duplicate_image
    WHERE canonical_image.place_id = canonical_place_id
      AND duplicate_image.place_id = duplicate_place_id
      AND canonical_image.image_url = duplicate_image.image_url;

    UPDATE core.place_images AS duplicate_image
    SET is_hero = false
    WHERE duplicate_image.place_id = duplicate_place_id
      AND duplicate_image.is_hero IS TRUE
      AND EXISTS (
        SELECT 1
        FROM core.place_images AS canonical_image
        WHERE canonical_image.place_id = canonical_place_id
          AND canonical_image.is_hero IS TRUE
      );

    UPDATE core.place_images
    SET place_id = canonical_place_id
    WHERE place_id = duplicate_place_id;

    INSERT INTO editorial.place_copy AS target (
      place_id,
      display_name,
      short_description,
      mission_title,
      mission_body,
      mission_radius_m,
      night_highlight,
      photo_tip,
      mission_type,
      mission_prompt,
      couple_question,
      short_story,
      og_title,
      og_description,
      og_image_url,
      updated_at,
      updated_by
    )
    SELECT
      canonical_place_id,
      source.display_name,
      source.short_description,
      source.mission_title,
      source.mission_body,
      source.mission_radius_m,
      source.night_highlight,
      source.photo_tip,
      source.mission_type,
      source.mission_prompt,
      source.couple_question,
      source.short_story,
      source.og_title,
      source.og_description,
      source.og_image_url,
      source.updated_at,
      source.updated_by
    FROM editorial.place_copy AS source
    WHERE source.place_id = duplicate_place_id
    ON CONFLICT (place_id) DO UPDATE
    SET display_name = COALESCE(target.display_name, EXCLUDED.display_name),
        short_description = COALESCE(target.short_description, EXCLUDED.short_description),
        mission_title = COALESCE(target.mission_title, EXCLUDED.mission_title),
        mission_body = COALESCE(target.mission_body, EXCLUDED.mission_body),
        mission_radius_m = COALESCE(target.mission_radius_m, EXCLUDED.mission_radius_m),
        night_highlight = COALESCE(target.night_highlight, EXCLUDED.night_highlight),
        photo_tip = COALESCE(target.photo_tip, EXCLUDED.photo_tip),
        mission_type = COALESCE(target.mission_type, EXCLUDED.mission_type),
        mission_prompt = COALESCE(target.mission_prompt, EXCLUDED.mission_prompt),
        couple_question = COALESCE(target.couple_question, EXCLUDED.couple_question),
        short_story = COALESCE(target.short_story, EXCLUDED.short_story),
        og_title = COALESCE(target.og_title, EXCLUDED.og_title),
        og_description = COALESCE(target.og_description, EXCLUDED.og_description),
        og_image_url = COALESCE(target.og_image_url, EXCLUDED.og_image_url),
        updated_at = GREATEST(target.updated_at, EXCLUDED.updated_at),
        updated_by = COALESCE(target.updated_by, EXCLUDED.updated_by);

    DELETE FROM core.places
    WHERE id = duplicate_place_id;
  END IF;
END
$$;

WITH ranked_images AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY place_id, image_url
      ORDER BY is_hero DESC NULLS LAST, created_at ASC NULLS LAST, id
    ) AS row_number
  FROM core.place_images
)
DELETE FROM core.place_images AS image
USING ranked_images AS ranked
WHERE image.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_place_images_place_url
  ON core.place_images (place_id, image_url);

CREATE UNIQUE INDEX IF NOT EXISTS uq_place_images_one_hero
  ON core.place_images (place_id)
  WHERE is_hero IS TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_places_normalized_name_lat_lng
  ON core.places (
    lower(regexp_replace(btrim(official_name), '\s+', '', 'g')),
    lat,
    lng
  );
