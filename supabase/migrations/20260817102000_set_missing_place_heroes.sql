WITH ranked_images AS (
  SELECT
    id,
    place_id,
    row_number() OVER (
      PARTITION BY place_id
      ORDER BY display_order ASC NULLS LAST, created_at ASC NULLS LAST, id
    ) AS row_number,
    bool_or(is_hero IS TRUE) OVER (PARTITION BY place_id) AS has_hero
  FROM core.place_images
)
UPDATE core.place_images AS image
SET is_hero = true
FROM ranked_images AS ranked
WHERE image.id = ranked.id
  AND ranked.row_number = 1
  AND ranked.has_hero IS NOT TRUE;
