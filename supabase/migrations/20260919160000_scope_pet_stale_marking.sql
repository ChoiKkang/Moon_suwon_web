-- 반려동물 수집이 콘텐츠 후보까지 stale로 바꾸지 않게 한다.
--
-- sync_finalize_pet_discovery는 "이번 실행에서 다시 보이지 않은 후보"를 stale로
-- 표시하려는 함수인데, 조건이 ingestion_status='candidate'뿐이라 반려동물 탐색과
-- 무관한 후보까지 전부 잡았다. 콘텐츠 수집이 방금 넣은 미검수 후보 77건이
-- 반려동물 실행 한 번에 stale로 넘어가면서 검수 대기 목록에서 사라졌다.
--
-- 반려동물 경로로 들어온 행만 last_pet_checked_at을 갖는다. 그 행으로 범위를
-- 좁히면 콘텐츠 후보는 검수 대기에 그대로 남는다.
--
-- 잘못 표시된 기존 행도 candidate로 되돌린다. 반려동물 확인 이력이 없는데
-- stale인 행은 이 버그로 넘어간 것뿐이다.

create or replace function public.sync_finalize_pet_discovery(p_run_id uuid)
returns integer
language plpgsql
set search_path to 'pg_catalog'
as $$
declare
  v_started_at timestamptz;
  v_count integer;
begin
  select started_at into v_started_at from raw.sync_runs where id = p_run_id;
  if v_started_at is null then
    raise exception 'sync run % not found', p_run_id;
  end if;

  update core.place_sources
  set ingestion_status = 'stale'
  where ingestion_status = 'candidate'
    and last_seen_at < v_started_at
    -- 반려동물 탐색이 한 번이라도 확인한 행만 대상으로 한다. 콘텐츠 수집이
    -- 넣은 후보는 이 값이 비어 있어 검수 대기 상태를 유지한다.
    and last_pet_checked_at is not null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

update core.place_sources
set ingestion_status = 'candidate'
where ingestion_status = 'stale'
  and last_pet_checked_at is null;
