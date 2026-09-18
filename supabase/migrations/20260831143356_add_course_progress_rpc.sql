-- ================================================================
-- 20260831141532_add_course_progress_rpc.sql
-- 코스 진행/체크인/완료를 실제 Supabase에 반영하기 위한 RPC 모음
--
-- 앱은 core.user_course_progress에 직접 접근하지 않고 아래 RPC만 호출한다.
--   • public.start_course_progress(course_id)
--       코스 시작 → 신규 진행 row 생성, 기존 in_progress는 abandoned 처리
--   • public.complete_course_progress(progress_id)
--       마지막 스팟 완료 → status=completed, completed_at=now()
--   • public.abandon_course_progress(progress_id)
--       중도 포기 → status=abandoned
--   • public.get_active_course_progress(course_id)
--       같은 코스의 in_progress row가 있는지 조회 (재진입/이어하기)
--   • public.list_user_course_history(limit)
--       "내 기록 확인하기" 목록 (완료/포기/진행 모두 포함)
--
-- 기존 public.checkin_place(...) RPC는 그대로 재사용한다.
--
-- 보안 모델(009_functions_rpc.sql의 checkin_place와 동일):
--   • 모든 RPC는 SECURITY DEFINER로 core/editorial의 RLS를 우회하되,
--   • 반드시 v_user_id := auth.uid() 로 호출자를 식별하고,
--   • user_id / owner 명시적 체크로 본인 데이터에만 쓰기/읽기 허용.
--   • authenticated 역할에만 EXECUTE 권한 부여, PUBLIC 권한은 REVOKE.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- public.start_course_progress
--   코스 시작 시 신규 user_course_progress row 생성.
--   같은 코스의 기존 in_progress row가 있으면 abandoned로 마감한 뒤 새로 만든다.
--   반환: { progress_id, course_id, status, started_at }
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_course_progress(
  p_course_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_progress_id uuid;
  v_started_at  timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM core.courses WHERE id = p_course_id) THEN
    RAISE EXCEPTION 'course not found: %', p_course_id;
  END IF;

  -- 이 사용자가 같은 코스에서 아직 마감되지 않은 in_progress row를 가지고 있다면
  -- 자연스러운 재시작 흐름을 위해 abandoned 상태로 정리한다.
  UPDATE core.user_course_progress
  SET
    status     = 'abandoned',
    updated_at = now()
  WHERE user_id   = v_user_id
    AND course_id = p_course_id
    AND status    = 'in_progress';

  v_started_at := now();

  INSERT INTO core.user_course_progress (user_id, course_id, status, started_at)
  VALUES (v_user_id, p_course_id, 'in_progress', v_started_at)
  RETURNING id INTO v_progress_id;

  RETURN json_build_object(
    'progress_id', v_progress_id,
    'course_id',   p_course_id,
    'status',      'in_progress',
    'started_at',  v_started_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.start_course_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_course_progress(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- public.complete_course_progress
--   코스의 모든 스팟 체크인이 완료됐을 때 호출.
--   status가 이미 completed면 그대로 완료 시각을 반환(멱등).
--   반환: {
--     progress_id, course_id, status, started_at, completed_at,
--     checkin_count, spot_count, is_perfect
--   }
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_course_progress(
  p_progress_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id       uuid := auth.uid();
  v_owner         uuid;
  v_course_id     uuid;
  v_current_stat  text;
  v_started_at    timestamptz;
  v_completed_at  timestamptz;
  v_checkin_cnt   int;
  v_spot_cnt      int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT ucp.user_id, ucp.course_id, ucp.status, ucp.started_at, ucp.completed_at
    INTO v_owner, v_course_id, v_current_stat, v_started_at, v_completed_at
  FROM core.user_course_progress ucp
  WHERE ucp.id = p_progress_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'progress not found: %', p_progress_id;
  END IF;

  IF v_owner <> v_user_id THEN
    RAISE EXCEPTION 'unauthorized: progress does not belong to current user';
  END IF;

  -- 이미 완료 처리된 세션이라면 그대로 반환 (멱등)
  IF v_current_stat <> 'completed' THEN
    v_completed_at := now();
    UPDATE core.user_course_progress
    SET
      status       = 'completed',
      completed_at = v_completed_at,
      updated_at   = now()
    WHERE id = p_progress_id;
  END IF;

  SELECT count(*)::int
    INTO v_checkin_cnt
  FROM core.user_place_checkins
  WHERE progress_id = p_progress_id;

  SELECT count(*)::int
    INTO v_spot_cnt
  FROM core.course_places
  WHERE course_id = v_course_id;

  RETURN json_build_object(
    'progress_id',    p_progress_id,
    'course_id',      v_course_id,
    'status',         'completed',
    'started_at',     v_started_at,
    'completed_at',   v_completed_at,
    'checkin_count',  v_checkin_cnt,
    'spot_count',     v_spot_cnt,
    'is_perfect',     (v_spot_cnt > 0 AND v_checkin_cnt >= v_spot_cnt)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_course_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_course_progress(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- public.abandon_course_progress
--   진행 중 세션을 명시적으로 포기 처리. 이미 completed/abandoned면 no-op.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.abandon_course_progress(
  p_progress_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_owner   uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT user_id INTO v_owner
  FROM core.user_course_progress
  WHERE id = p_progress_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'progress not found: %', p_progress_id;
  END IF;

  IF v_owner <> v_user_id THEN
    RAISE EXCEPTION 'unauthorized: progress does not belong to current user';
  END IF;

  UPDATE core.user_course_progress
  SET
    status     = 'abandoned',
    updated_at = now()
  WHERE id     = p_progress_id
    AND status = 'in_progress';
END;
$function$;

REVOKE ALL ON FUNCTION public.abandon_course_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.abandon_course_progress(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- public.get_active_course_progress
--   같은 코스의 가장 최근 in_progress row(있으면)를 반환. 없으면 NULL.
--   앱에서 "이어서 진행하기" UX나 재진입 처리에 사용.
--   반환: { progress_id, course_id, status, started_at, checkin_count, spot_count } | null
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_active_course_progress(
  p_course_id uuid
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_progress_id uuid;
  v_started_at  timestamptz;
  v_checkin_cnt int;
  v_spot_cnt    int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, started_at
    INTO v_progress_id, v_started_at
  FROM core.user_course_progress
  WHERE user_id   = v_user_id
    AND course_id = p_course_id
    AND status    = 'in_progress'
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_progress_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::int
    INTO v_checkin_cnt
  FROM core.user_place_checkins
  WHERE progress_id = v_progress_id;

  SELECT count(*)::int
    INTO v_spot_cnt
  FROM core.course_places
  WHERE course_id = p_course_id;

  RETURN json_build_object(
    'progress_id',   v_progress_id,
    'course_id',     p_course_id,
    'status',        'in_progress',
    'started_at',    v_started_at,
    'checkin_count', v_checkin_cnt,
    'spot_count',    v_spot_cnt
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_active_course_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_course_progress(uuid) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- public.list_user_course_history
--   현재 로그인 사용자의 코스 진행 기록 목록 (최신순).
--   completed/abandoned/in_progress 모두 포함.
--   반환 컬럼:
--     progress_id, course_id, course_slug, hero_title, subtitle, route_summary,
--     hero_image_url, status, started_at, completed_at,
--     checkin_count, spot_count, walking_distance_km, estimated_duration_min
--
--   SECURITY DEFINER 이지만 반드시 v_user_id := auth.uid() 로 본인 데이터만
--   반환한다. anon(auth.uid() IS NULL)은 빈 결과.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_user_course_history(
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  progress_id            uuid,
  course_id              uuid,
  course_slug            text,
  hero_title             text,
  subtitle               text,
  route_summary          text,
  hero_image_url         text,
  status                 text,
  started_at             timestamptz,
  completed_at           timestamptz,
  checkin_count          bigint,
  spot_count             bigint,
  walking_distance_km    numeric,
  estimated_duration_min int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_limit   int  := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ucp.id                                                       AS progress_id,
    ucp.course_id                                                AS course_id,
    c.slug                                                       AS course_slug,
    cc.hero_title                                                AS hero_title,
    cc.subtitle                                                  AS subtitle,
    cc.route_summary                                             AS route_summary,
    (
      SELECT pi.image_url
      FROM core.course_places cp
      JOIN core.places p ON p.id = cp.place_id
      LEFT JOIN core.place_images pi
             ON pi.place_id = p.id AND pi.is_hero = true
      WHERE cp.course_id = c.id
        AND pi.image_url IS NOT NULL
      ORDER BY cp.order_index
      LIMIT 1
    )                                                            AS hero_image_url,
    ucp.status                                                   AS status,
    ucp.started_at                                               AS started_at,
    ucp.completed_at                                             AS completed_at,
    (
      SELECT count(*)
      FROM core.user_place_checkins upc
      WHERE upc.progress_id = ucp.id
    )                                                            AS checkin_count,
    (
      SELECT count(*)
      FROM core.course_places cp2
      WHERE cp2.course_id = ucp.course_id
    )                                                            AS spot_count,
    c.walking_distance_km                                        AS walking_distance_km,
    c.estimated_duration_min                                     AS estimated_duration_min
  FROM core.user_course_progress ucp
  JOIN core.courses c                    ON c.id  = ucp.course_id
  LEFT JOIN editorial.course_copy cc     ON cc.course_id = c.id
  WHERE ucp.user_id = v_user_id
  ORDER BY COALESCE(ucp.completed_at, ucp.started_at) DESC
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_user_course_history(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_user_course_history(int) TO authenticated;
