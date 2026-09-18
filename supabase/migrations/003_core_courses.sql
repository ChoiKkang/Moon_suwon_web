-- ================================================================
-- 003_core_courses.sql
-- 코스 및 코스-스팟 연결 테이블
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- core.courses | 야간 데이트 코스 정의
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.courses (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    text NOT NULL UNIQUE,
  theme_tags              text[] DEFAULT '{}',
  estimated_duration_min  int NOT NULL,
  walking_distance_km     numeric(5,2),
  recommended_start_time  text,
  pet_ready_flag          bool DEFAULT false,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- core.course_places | 코스 내 스팟 순서 (N:M)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.course_places (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   uuid NOT NULL REFERENCES core.courses (id) ON DELETE CASCADE,
  place_id    uuid NOT NULL REFERENCES core.places (id) ON DELETE CASCADE,
  order_index int NOT NULL,
  UNIQUE (course_id, order_index),
  UNIQUE (course_id, place_id)
);

CREATE INDEX idx_course_places_course_id ON core.course_places (course_id);

CREATE INDEX idx_course_places_place_id  ON core.course_places (place_id);
