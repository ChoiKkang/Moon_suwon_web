-- ================================================================
-- 005_core_user_activity.sql
-- 사용자 진행 기록, 체크인, 찜 테이블
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- core.user_course_progress | 코스 진행 기록
-- UNIQUE(user_id, course_id) 없음 → 코스 완료 후 재시작 허용
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.user_course_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  course_id    uuid NOT NULL REFERENCES core.courses (id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'in_progress',  -- 'in_progress' | 'completed' | 'abandoned'
  started_at   timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_ucp_user_id   ON core.user_course_progress (user_id);

CREATE INDEX idx_ucp_course_id ON core.user_course_progress (course_id);

CREATE INDEX idx_ucp_status    ON core.user_course_progress (user_id, status);

-- ────────────────────────────────────────────────────────────────
-- core.user_place_checkins | 스팟 체크인 기록
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.user_place_checkins (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_id  uuid NOT NULL REFERENCES core.user_course_progress (id) ON DELETE CASCADE,
  place_id     uuid NOT NULL REFERENCES core.places (id) ON DELETE CASCADE,
  check_mode   text NOT NULL,  -- 'auto' | 'manual'
  lat_at_check numeric(10,7),
  lng_at_check numeric(10,7),
  checked_at   timestamptz DEFAULT now(),
  UNIQUE (progress_id, place_id)
);

CREATE INDEX idx_checkins_progress_id ON core.user_place_checkins (progress_id);

-- ────────────────────────────────────────────────────────────────
-- core.user_favorites | 찜 목록
-- MVP: 비회원은 앱 로컬 저장 → 로그인 시 이 테이블로 업서트
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.user_favorites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('course', 'spot')),
  course_id   uuid REFERENCES core.courses (id) ON DELETE CASCADE,
  place_id    uuid REFERENCES core.places (id) ON DELETE CASCADE,
  created_at  timestamptz DEFAULT now(),
  CHECK (
    (target_type = 'course' AND course_id IS NOT NULL AND place_id IS NULL) OR
    (target_type = 'spot'   AND place_id  IS NOT NULL AND course_id IS NULL)
  ),
  UNIQUE (user_id, course_id),
  UNIQUE (user_id, place_id)
);

CREATE INDEX idx_favorites_user_id ON core.user_favorites (user_id);
