-- 반려동물 실행이 콘텐츠 후보를 stale로 넘기지 않게 범위를 바로잡는다.
--
-- 앞선 수정은 last_pet_checked_at으로 범위를 좁혔지만 그것으로는 부족했다.
-- 반려동물 보강 단계가 공개 후보 여부와 무관하게 모든 장소의 정책을 확인하며
-- last_pet_checked_at을 채우기 때문에, 콘텐츠 수집이 넣은 후보도 첫 반려동물
-- 실행 직후 이 조건을 통과한다. 실제로 미검수 후보 77건이 stale로 넘어갔다.
--
-- stale의 의도는 "이전에 반려동물 목록에 있었는데 이번 실행에서 사라진 후보"다.
-- 그 판단은 이번 실행에서 다시 목록에 잡혔는지로만 해야 하고, 콘텐츠 수집이
-- 넣은 후보는 반려동물 목록에 애초에 들어온 적이 없으므로 대상이 아니다.
-- raw.kto_pet_candidates에 이력이 있는 content_id로 범위를 제한한다.
--
-- 잘못 표시된 기존 행은 candidate로 되돌린다.

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

  update core.place_sources ps
  set ingestion_status = 'stale'
  where ps.ingestion_status = 'candidate'
    and ps.last_seen_at < v_started_at
    -- 반려동물 목록으로 발견된 이력이 있는 후보만 대상이다. 콘텐츠 수집이 넣은
    -- 후보는 여기에 없으므로 검수 대기 상태를 유지한다.
    and exists (
      select 1
      from raw.kto_pet_candidates pc
      where pc.content_id = ps.kto_content_id
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

update core.place_sources ps
set ingestion_status = 'candidate'
where ps.ingestion_status = 'stale'
  and not exists (
    select 1
    from raw.kto_pet_candidates pc
    where pc.content_id = ps.kto_content_id
  );
