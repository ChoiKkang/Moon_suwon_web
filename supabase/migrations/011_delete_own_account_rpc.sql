-- ================================================================
-- 011_delete_own_account_rpc.sql
-- 회원탈퇴: 현재 로그인한 사용자의 계정을 삭제하는 RPC
-- SECURITY DEFINER로 auth.users 삭제 권한을 위임한다.
-- (앱에는 service_role 키를 넣지 않으므로, 클라이언트는 이 RPC만 호출한다.)
-- ================================================================

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no active session';
  END IF;

  -- core.user_course_progress / core.user_favorites는
  -- auth.users FK에 ON DELETE CASCADE가 걸려 있어 자동 삭제된다.
  DELETE FROM public.profiles WHERE id = v_user_id;
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
