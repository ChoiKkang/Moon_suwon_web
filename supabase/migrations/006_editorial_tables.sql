-- ================================================================
-- 006_editorial_tables.sql
-- 운영자 편집 문구 및 노출 상태 테이블 + 자동 생성 트리거
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- editorial.place_copy | 스팟 기획 문구
-- ────────────────────────────────────────────────────────────────
CREATE TABLE editorial.place_copy (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id         uuid NOT NULL UNIQUE REFERENCES core.places (id) ON DELETE CASCADE,
  display_name     text,           -- NULL이면 core.places.official_name 사용
  mission_radius_m int DEFAULT 80, -- 체크인 인정 반경(m)
  night_highlight  text,
  photo_tip        text,
  mission_type     text,           -- 'check' | 'photo' | 'story' | 'couple_question'
  mission_prompt   text,
  couple_question  text,
  short_story      text,
  og_title         text,
  og_description   text,
  og_image_url     text,
  updated_at       timestamptz DEFAULT now(),
  updated_by       uuid REFERENCES auth.users (id)
);

-- ────────────────────────────────────────────────────────────────
-- editorial.course_copy | 코스 기획 문구
-- ────────────────────────────────────────────────────────────────
CREATE TABLE editorial.course_copy (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      uuid NOT NULL UNIQUE REFERENCES core.courses (id) ON DELETE CASCADE,
  hero_title     text NOT NULL,
  subtitle       text,
  route_summary  text,
  og_title       text,
  og_description text,
  og_image_url   text,
  updated_at     timestamptz DEFAULT now(),
  updated_by     uuid REFERENCES auth.users (id)
);

-- ────────────────────────────────────────────────────────────────
-- editorial.place_publish_state | 스팟 노출 상태
-- core.places INSERT 시 트리거로 자동 생성 (is_published=false)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE editorial.place_publish_state (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id         uuid NOT NULL UNIQUE REFERENCES core.places (id) ON DELETE CASCADE,
  is_published     bool DEFAULT false,
  display_priority int DEFAULT 0,
  ops_memo         text,           -- 운영자 내부 메모. 사용자 미노출
  published_at     timestamptz,
  updated_at       timestamptz DEFAULT now(),
  updated_by       uuid REFERENCES auth.users (id)
);

-- ────────────────────────────────────────────────────────────────
-- editorial.course_publish_state | 코스 노출 상태
-- core.courses INSERT 시 트리거로 자동 생성 (is_published=false)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE editorial.course_publish_state (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        uuid NOT NULL UNIQUE REFERENCES core.courses (id) ON DELETE CASCADE,
  is_published     bool DEFAULT false,
  display_priority int DEFAULT 0,
  ops_memo         text,
  published_at     timestamptz,
  updated_at       timestamptz DEFAULT now(),
  updated_by       uuid REFERENCES auth.users (id)
);

-- ────────────────────────────────────────────────────────────────
-- Trigger: core.places INSERT → editorial.place_publish_state 자동 생성
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION editorial.fn_create_place_publish_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO editorial.place_publish_state (place_id)
  VALUES (NEW.id)
  ON CONFLICT (place_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_places_create_publish_state
  AFTER INSERT ON core.places
  FOR EACH ROW
  EXECUTE FUNCTION editorial.fn_create_place_publish_state();

-- ────────────────────────────────────────────────────────────────
-- Trigger: core.courses INSERT → editorial.course_publish_state 자동 생성
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION editorial.fn_create_course_publish_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO editorial.course_publish_state (course_id)
  VALUES (NEW.id)
  ON CONFLICT (course_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_courses_create_publish_state
  AFTER INSERT ON core.courses
  FOR EACH ROW
  EXECUTE FUNCTION editorial.fn_create_course_publish_state();
