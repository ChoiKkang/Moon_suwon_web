-- ================================================================
-- 008_rls_policies.sql
-- Row Level Security 정책 + 스키마 접근 권한 부여
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 스키마 및 테이블 접근 권한 부여
-- ────────────────────────────────────────────────────────────────

-- core 스키마: anon/authenticated 읽기 + authenticated 활동 데이터 쓰기
GRANT USAGE ON SCHEMA core TO anon, authenticated;

GRANT SELECT ON
  core.places,
  core.place_sources,
  core.place_images,
  core.place_pet_policies,
  core.courses,
  core.course_places,
  core.local_spots,
  core.local_spot_links,
  core.place_local_spots
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  core.user_course_progress,
  core.user_place_checkins,
  core.user_favorites
TO authenticated;

-- editorial 스키마: 직접 접근 금지 (service_role/admin 서버 전용)
-- anon, authenticated에 GRANT 없음 → 접근 불가

-- ────────────────────────────────────────────────────────────────
-- 관리자 판별 헬퍼 함수
-- profiles.role = 'ADMIN'인 경우 true 반환
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'ADMIN'
  );
$$;

-- ────────────────────────────────────────────────────────────────
-- RLS 활성화
-- ────────────────────────────────────────────────────────────────
ALTER TABLE core.places                ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.place_sources         ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.place_images          ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.place_pet_policies    ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.courses               ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.course_places         ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.local_spots           ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.local_spot_links      ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.place_local_spots     ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.user_course_progress  ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.user_place_checkins   ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.user_favorites        ENABLE ROW LEVEL SECURITY;

ALTER TABLE editorial.place_copy            ENABLE ROW LEVEL SECURITY;

ALTER TABLE editorial.course_copy           ENABLE ROW LEVEL SECURITY;

ALTER TABLE editorial.place_publish_state   ENABLE ROW LEVEL SECURITY;

ALTER TABLE editorial.course_publish_state  ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- core.places / place_sources / place_images / place_pet_policies
-- anon + authenticated: SELECT 허용 / admin: ALL
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "places_select"    ON core.places FOR SELECT USING (true);

CREATE POLICY "places_admin_all" ON core.places FOR ALL   USING (public.is_admin());

CREATE POLICY "place_sources_select"    ON core.place_sources FOR SELECT USING (true);

CREATE POLICY "place_sources_admin_all" ON core.place_sources FOR ALL   USING (public.is_admin());

CREATE POLICY "place_images_select"    ON core.place_images FOR SELECT USING (true);

CREATE POLICY "place_images_admin_all" ON core.place_images FOR ALL   USING (public.is_admin());

CREATE POLICY "place_pet_policies_select"    ON core.place_pet_policies FOR SELECT USING (true);

CREATE POLICY "place_pet_policies_admin_all" ON core.place_pet_policies FOR ALL   USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────
-- core.courses / course_places
-- anon + authenticated: SELECT 허용 / admin: ALL
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "courses_select"    ON core.courses FOR SELECT USING (true);

CREATE POLICY "courses_admin_all" ON core.courses FOR ALL   USING (public.is_admin());

CREATE POLICY "course_places_select"    ON core.course_places FOR SELECT USING (true);

CREATE POLICY "course_places_admin_all" ON core.course_places FOR ALL   USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────
-- core.local_spots / local_spot_links / place_local_spots
-- anon + authenticated: SELECT 허용 / admin: ALL
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "local_spots_select"    ON core.local_spots FOR SELECT USING (true);

CREATE POLICY "local_spots_admin_all" ON core.local_spots FOR ALL   USING (public.is_admin());

CREATE POLICY "local_spot_links_select"    ON core.local_spot_links FOR SELECT USING (true);

CREATE POLICY "local_spot_links_admin_all" ON core.local_spot_links FOR ALL   USING (public.is_admin());

CREATE POLICY "place_local_spots_select"    ON core.place_local_spots FOR SELECT USING (true);

CREATE POLICY "place_local_spots_admin_all" ON core.place_local_spots FOR ALL   USING (public.is_admin());

-- ────────────────────────────────────────────────────────────────
-- core.user_course_progress
-- authenticated: 본인 row만 / admin: ALL / anon: 금지
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "progress_own_or_admin" ON core.user_course_progress
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ────────────────────────────────────────────────────────────────
-- core.user_place_checkins
-- authenticated: 본인 progress 소유 row만 / admin: ALL / anon: 금지
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "checkins_own_or_admin" ON core.user_place_checkins
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM core.user_course_progress ucp
      WHERE ucp.id = progress_id AND ucp.user_id = auth.uid()
    )
    OR public.is_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM core.user_course_progress ucp
      WHERE ucp.id = progress_id AND ucp.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- ────────────────────────────────────────────────────────────────
-- core.user_favorites
-- authenticated: 본인 row만 / admin: ALL / anon: 금지
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "favorites_own_or_admin" ON core.user_favorites
  FOR ALL
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- ────────────────────────────────────────────────────────────────
-- editorial.* — admin만 접근 가능
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "place_copy_admin_all"           ON editorial.place_copy           FOR ALL USING (public.is_admin());

CREATE POLICY "course_copy_admin_all"          ON editorial.course_copy          FOR ALL USING (public.is_admin());

CREATE POLICY "place_publish_state_admin_all"  ON editorial.place_publish_state  FOR ALL USING (public.is_admin());

CREATE POLICY "course_publish_state_admin_all" ON editorial.course_publish_state FOR ALL USING (public.is_admin());
