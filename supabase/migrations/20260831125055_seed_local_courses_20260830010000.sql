-- ================================================================
-- 20260830010000_seed_local_courses.sql
-- MVP 추천 코스 3종 시드 + 홈 코스 목록 RPC
--
-- 원칙:
-- - core.places에 실제 존재하는 slug만 course_places에 연결한다.
-- - TourAPI 독립 contentId가 없는 용연은 별도 core place로 만들지 않는다.
-- - 행리단길은 현재 core place가 아니므로 코스 종료 후 자유 마무리 안내로만 표현한다.
-- - 재적용해도 course/editorial 행이 중복되지 않도록 slug/course_id 기준 upsert한다.
-- ================================================================

DO $migration$
DECLARE
  v_course_id uuid;
  v_missing_slugs text[];
BEGIN
  -- 모든 참조 장소가 존재하고 활성 상태인지 먼저 확인한다.
  -- 하나라도 없으면 데이터 변경 전에 migration 전체를 실패시킨다.
  SELECT array_agg(required.slug ORDER BY required.slug)
  INTO v_missing_slugs
  FROM (
    SELECT DISTINCT slug
    FROM (
      VALUES
        ('paldalmun'),
        ('hwaseong-haenggung'),
        ('janganmun'),
        ('banghwasuryujeong'),
        ('hwahongmun'),
        ('yeonmudae'),
        ('changnyongmun'),
        ('seojangdae')
    ) AS slugs(slug)
  ) AS required
  LEFT JOIN core.places AS p
    ON p.slug = required.slug
   AND p.is_active = true
  WHERE p.id IS NULL;

  IF v_missing_slugs IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot seed courses. Missing or inactive core.places slugs: %',
      array_to_string(v_missing_slugs, ', ');
  END IF;

  -- 1) 처음 가는 수원화성 데이트 코스
  INSERT INTO core.courses (
    slug,
    theme_tags,
    estimated_duration_min,
    walking_distance_km,
    recommended_start_time,
    pet_ready_flag,
    updated_at
  ) VALUES (
    'course-date-01',
    ARRAY['date', 'night', 'beginner']::text[],
    90,
    2.10,
    '18:30',
    false,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (slug) DO UPDATE SET
    theme_tags = EXCLUDED.theme_tags,
    estimated_duration_min = EXCLUDED.estimated_duration_min,
    walking_distance_km = EXCLUDED.walking_distance_km,
    recommended_start_time = EXCLUDED.recommended_start_time,
    pet_ready_flag = EXCLUDED.pet_ready_flag,
    updated_at = CURRENT_TIMESTAMP
  RETURNING id INTO v_course_id;

  DELETE FROM core.course_places
  WHERE course_id = v_course_id;

  INSERT INTO core.course_places (course_id, place_id, order_index)
  SELECT v_course_id, p.id, route.order_index
  FROM (
    VALUES
      ('paldalmun', 1),
      ('hwaseong-haenggung', 2),
      ('janganmun', 3),
      ('banghwasuryujeong', 4)
  ) AS route(slug, order_index)
  JOIN core.places AS p ON p.slug = route.slug
  ORDER BY route.order_index;

  INSERT INTO editorial.course_copy (
    course_id,
    hero_title,
    subtitle,
    route_summary,
    og_title,
    og_description,
    updated_at
  ) VALUES (
    v_course_id,
    E'처음 가는 수원화성\n데이트 코스',
    '첫 방문자를 위한 야경 입문 코스',
    '팔달문 → 화성행궁 → 장안문 → 방화수류정',
    '처음 가는 수원화성 데이트 코스',
    '수원화성 대표 야경 명소를 무리 없는 동선으로 만나는 첫 방문자용 데이트 코스',
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (course_id) DO UPDATE SET
    hero_title = EXCLUDED.hero_title,
    subtitle = EXCLUDED.subtitle,
    route_summary = EXCLUDED.route_summary,
    og_title = EXCLUDED.og_title,
    og_description = EXCLUDED.og_description,
    updated_at = CURRENT_TIMESTAMP;

  INSERT INTO editorial.course_publish_state (
    course_id,
    is_published,
    display_priority,
    ops_memo,
    published_at,
    updated_at
  ) VALUES (
    v_course_id,
    true,
    1,
    'MVP 추천 코스 로컬 시드 동기화',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (course_id) DO UPDATE SET
    is_published = true,
    display_priority = EXCLUDED.display_priority,
    ops_memo = EXCLUDED.ops_memo,
    published_at = COALESCE(
      editorial.course_publish_state.published_at,
      CURRENT_TIMESTAMP
    ),
    updated_at = CURRENT_TIMESTAMP;

  -- 2) 야경 사진 집중 코스
  -- 용연은 방화수류정 인접 경관 구간이지만 독립 core place가 아니므로
  -- route_summary와 문구에 포함하고 구조화된 장소 연결은 3개만 둔다.
  INSERT INTO core.courses (
    slug,
    theme_tags,
    estimated_duration_min,
    walking_distance_km,
    recommended_start_time,
    pet_ready_flag,
    updated_at
  ) VALUES (
    'course-photo-01',
    ARRAY['date', 'photo', 'night']::text[],
    120,
    2.80,
    '19:00',
    false,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (slug) DO UPDATE SET
    theme_tags = EXCLUDED.theme_tags,
    estimated_duration_min = EXCLUDED.estimated_duration_min,
    walking_distance_km = EXCLUDED.walking_distance_km,
    recommended_start_time = EXCLUDED.recommended_start_time,
    pet_ready_flag = EXCLUDED.pet_ready_flag,
    updated_at = CURRENT_TIMESTAMP
  RETURNING id INTO v_course_id;

  DELETE FROM core.course_places
  WHERE course_id = v_course_id;

  INSERT INTO core.course_places (course_id, place_id, order_index)
  SELECT v_course_id, p.id, route.order_index
  FROM (
    VALUES
      ('janganmun', 1),
      ('hwahongmun', 2),
      ('banghwasuryujeong', 3)
  ) AS route(slug, order_index)
  JOIN core.places AS p ON p.slug = route.slug
  ORDER BY route.order_index;

  INSERT INTO editorial.course_copy (
    course_id,
    hero_title,
    subtitle,
    route_summary,
    og_title,
    og_description,
    updated_at
  ) VALUES (
    v_course_id,
    '야경 사진 집중 코스',
    '방화수류정과 용연 경관 중심의 포토 데이트',
    '장안문 → 화홍문 → 방화수류정·용연 경관 구간',
    '수원화성 야경 사진 집중 코스',
    '장안문과 화홍문을 지나 방화수류정·용연의 수면 반사를 담는 포토 데이트 코스',
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (course_id) DO UPDATE SET
    hero_title = EXCLUDED.hero_title,
    subtitle = EXCLUDED.subtitle,
    route_summary = EXCLUDED.route_summary,
    og_title = EXCLUDED.og_title,
    og_description = EXCLUDED.og_description,
    updated_at = CURRENT_TIMESTAMP;

  INSERT INTO editorial.course_publish_state (
    course_id,
    is_published,
    display_priority,
    ops_memo,
    published_at,
    updated_at
  ) VALUES (
    v_course_id,
    true,
    2,
    '용연은 독립 core place 없이 방화수류정 인접 경관 구간으로 안내',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (course_id) DO UPDATE SET
    is_published = true,
    display_priority = EXCLUDED.display_priority,
    ops_memo = EXCLUDED.ops_memo,
    published_at = COALESCE(
      editorial.course_publish_state.published_at,
      CURRENT_TIMESTAMP
    ),
    updated_at = CURRENT_TIMESTAMP;

  -- 3) 산책 후 행리단길 마무리 코스
  -- 행리단길은 별도 core place를 만들지 않고 화성행궁까지의 구조화된 코스 종료 후
  -- 사용자가 인근 행리단길에서 자유롭게 마무리하도록 문구로 안내한다.
  INSERT INTO core.courses (
    slug,
    theme_tags,
    estimated_duration_min,
    walking_distance_km,
    recommended_start_time,
    pet_ready_flag,
    updated_at
  ) VALUES (
    'course-walk-01',
    ARRAY['date', 'walk', 'cafe']::text[],
    150,
    3.50,
    '17:30',
    false,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (slug) DO UPDATE SET
    theme_tags = EXCLUDED.theme_tags,
    estimated_duration_min = EXCLUDED.estimated_duration_min,
    walking_distance_km = EXCLUDED.walking_distance_km,
    recommended_start_time = EXCLUDED.recommended_start_time,
    pet_ready_flag = EXCLUDED.pet_ready_flag,
    updated_at = CURRENT_TIMESTAMP
  RETURNING id INTO v_course_id;

  DELETE FROM core.course_places
  WHERE course_id = v_course_id;

  INSERT INTO core.course_places (course_id, place_id, order_index)
  SELECT v_course_id, p.id, route.order_index
  FROM (
    VALUES
      ('yeonmudae', 1),
      ('changnyongmun', 2),
      ('seojangdae', 3),
      ('banghwasuryujeong', 4),
      ('hwaseong-haenggung', 5)
  ) AS route(slug, order_index)
  JOIN core.places AS p ON p.slug = route.slug
  ORDER BY route.order_index;

  INSERT INTO editorial.course_copy (
    course_id,
    hero_title,
    subtitle,
    route_summary,
    og_title,
    og_description,
    updated_at
  ) VALUES (
    v_course_id,
    E'산책 후 행리단길\n마무리 코스',
    '성곽 산책부터 카페까지 완성형 데이트',
    '연무대 → 창룡문 → 서장대 → 방화수류정 → 화성행궁, 이후 행리단길 자유 마무리',
    '수원화성 산책 후 행리단길 마무리 코스',
    '수원화성 성곽을 따라 야경을 걷고 행리단길 카페에서 마무리하는 데이트 코스',
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (course_id) DO UPDATE SET
    hero_title = EXCLUDED.hero_title,
    subtitle = EXCLUDED.subtitle,
    route_summary = EXCLUDED.route_summary,
    og_title = EXCLUDED.og_title,
    og_description = EXCLUDED.og_description,
    updated_at = CURRENT_TIMESTAMP;

  INSERT INTO editorial.course_publish_state (
    course_id,
    is_published,
    display_priority,
    ops_memo,
    published_at,
    updated_at
  ) VALUES (
    v_course_id,
    true,
    3,
    '구조화된 코스는 화성행궁에서 종료, 인근 행리단길은 자유 마무리 안내',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT (course_id) DO UPDATE SET
    is_published = true,
    display_priority = EXCLUDED.display_priority,
    ops_memo = EXCLUDED.ops_memo,
    published_at = COALESCE(
      editorial.course_publish_state.published_at,
      CURRENT_TIMESTAMP
    ),
    updated_at = CURRENT_TIMESTAMP;

  -- 과거 추천 코스 2건은 데이터와 사용자 참조를 보존하되 홈 중복 노출만 해제한다.
  UPDATE editorial.course_publish_state AS legacy_state
  SET
    is_published = false,
    ops_memo = '로컬 추천 코스 3종으로 대체되어 비공개 처리',
    updated_at = CURRENT_TIMESTAMP
  FROM core.courses AS legacy_course
  WHERE legacy_state.course_id = legacy_course.id
    AND legacy_course.slug IN (
      'course-night-photo',
      'course-fortress-walk'
    );
END;
$migration$;

-- 앱은 public 스키마만 노출된 PostgREST를 사용하므로 serving view를 얇은 RPC로 감싼다.
CREATE OR REPLACE FUNCTION public.get_home_courses(p_limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  slug text,
  theme_tags text[],
  estimated_duration_min integer,
  walking_distance_km numeric,
  recommended_start_time text,
  pet_ready_flag boolean,
  hero_title text,
  subtitle text,
  route_summary text,
  spot_count bigint,
  hero_image_url text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT
    home.id,
    home.slug,
    home.theme_tags,
    home.estimated_duration_min,
    home.walking_distance_km,
    home.recommended_start_time,
    home.pet_ready_flag,
    home.hero_title,
    home.subtitle,
    home.route_summary,
    home.spot_count,
    home.hero_image_url
  FROM serving.v_home_courses AS home
  ORDER BY home.display_priority ASC
  LIMIT LEAST(50, GREATEST(1, COALESCE(p_limit, 10)));
$function$;

REVOKE ALL ON FUNCTION public.get_home_courses(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_home_courses(integer) TO anon, authenticated;
