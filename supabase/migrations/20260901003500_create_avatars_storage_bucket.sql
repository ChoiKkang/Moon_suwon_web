-- ================================================================
-- 20260901003500_create_avatars_storage_bucket.sql
-- 프로필 아바타 이미지를 저장할 Supabase Storage 버킷과 RLS 정책.
-- ================================================================
--
-- 배경
--   마이페이지의 프로필 편집 화면에서 사용자가 갤러리/카메라로 선택한 사진을
--   `profiles.avatar_url`로 저장하려면 Supabase Storage에 실제 파일 저장소가 필요하다.
--   파일 경로 규칙: `${auth.uid()}/avatar.jpg` (upsert로 덮어쓴다).
--
-- 정책
--   - 아바타는 앱 화면과 공유 링크에서 즉시 노출되어야 하므로 read는 public 허용.
--   - 쓰기(insert/update/delete)는 로그인 사용자가 자기 폴더에만 가능.
--   - 폴더 첫 세그먼트가 auth.uid()::text와 일치해야 통과.
--   - `service_role`은 정책과 무관하게 통과하므로 운영 백오피스는 그대로 동작한다.
--
-- 주의
--   - bucket_id는 문자열이며 `avatars`로 고정한다.
--   - 재실행 시 중복 오류를 피하려고 IF NOT EXISTS/DROP-CREATE 패턴을 사용.

-- ────────────────────────────────────────────────────────────────
-- 1) avatars 버킷 생성 (public read)
-- ────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,                                -- public bucket (SELECT는 정책 없이도 CDN 노출)
  5 * 1024 * 1024,                     -- 5MB 상한 (앱은 이미 리사이즈해서 업로드)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ────────────────────────────────────────────────────────────────
-- 2) storage.objects RLS 정책
--   Supabase Storage는 storage.objects 테이블에 RLS가 켜져 있다.
--   버킷별로 정책을 새로 추가한다.
-- ────────────────────────────────────────────────────────────────

-- 공개 read: 앱/웹에서 avatar URL을 그대로 <img>로 로드하기 위해 SELECT 허용.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;

CREATE POLICY "avatars_public_read"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

-- 본인 폴더 쓰기: `${auth.uid()}/...` 경로에만 insert/update/delete 허용.
-- storage.foldername(name)은 '/' 기준으로 분해된 배열을 돌려주며,
-- 첫 세그먼트가 사용자 id와 일치해야 자기 폴더로 인정한다.
DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;

CREATE POLICY "avatars_owner_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;

CREATE POLICY "avatars_owner_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;

CREATE POLICY "avatars_owner_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
