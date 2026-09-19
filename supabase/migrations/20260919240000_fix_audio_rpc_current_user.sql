-- 수집 RPC 안의 권한 재확인을 제거한다.
--
-- current_user는 SQL 예약 키워드라 pg_catalog로 한정할 수 없다.
-- pg_catalog.current_user로 쓰면 파서가 테이블 별칭으로 읽어
-- "missing FROM-clause entry for table pg_catalog"로 실패한다.
--
-- 함수 본문에서 다시 검사할 필요도 없다. 실행 권한을 public, anon,
-- authenticated에서 회수하고 service_role에만 부여했으므로 호출 경로에서 이미
-- 막힌다. 반려동물·무장애 수집 RPC도 같은 방식이고 별도 검사를 두지 않는다.

create or replace function public.sync_kto_audio_story_item(
  p_run_id uuid,
  p_place_id uuid,
  p_payload jsonb,
  p_distance_m integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_story_lang_id text;
  v_audio_title text;
begin
  v_story_lang_id := pg_catalog.btrim(coalesce(p_payload ->> 'stlid', ''));
  v_audio_title := pg_catalog.btrim(coalesce(p_payload ->> 'audioTitle', ''));

  if v_story_lang_id = '' or v_audio_title = '' then
    return false;
  end if;

  insert into raw.kto_audio_story (story_lang_id, payload_json)
  values (v_story_lang_id, p_payload)
  on conflict (story_lang_id) do update
    set payload_json = excluded.payload_json,
        fetched_at = pg_catalog.now();

  insert into core.place_audio_stories (
    place_id, story_lang_id, theme_id, story_id, spot_title, audio_title, script,
    play_seconds, audio_url, image_url, lat, lng, distance_m,
    source_updated_at, last_checked_at
  )
  values (
    p_place_id,
    v_story_lang_id,
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'tid', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'stid', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'title', '')), ''),
    v_audio_title,
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'script', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'playTime', '')), '')::integer,
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'audioUrl', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'imageUrl', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'mapY', '')), '')::double precision,
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'mapX', '')), '')::double precision,
    p_distance_m,
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (place_id, story_lang_id) do update
    set theme_id = excluded.theme_id,
        story_id = excluded.story_id,
        spot_title = excluded.spot_title,
        audio_title = excluded.audio_title,
        script = excluded.script,
        play_seconds = excluded.play_seconds,
        audio_url = excluded.audio_url,
        image_url = excluded.image_url,
        lat = excluded.lat,
        lng = excluded.lng,
        distance_m = excluded.distance_m,
        source_updated_at = excluded.source_updated_at,
        last_checked_at = excluded.last_checked_at,
        updated_at = pg_catalog.now();

  return true;
end;
$$;

create or replace function public.sync_kto_audio_prune(
  p_place_id uuid,
  p_keep_story_lang_ids text[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_deleted integer;
begin
  delete from core.place_audio_stories pas
  where pas.place_id = p_place_id
    and not (pas.story_lang_id = any(coalesce(p_keep_story_lang_ids, array[]::text[])));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.sync_kto_audio_story_item(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.sync_kto_audio_story_item(uuid, uuid, jsonb, integer) to service_role;
revoke all on function public.sync_kto_audio_prune(uuid, text[]) from public, anon, authenticated;
grant execute on function public.sync_kto_audio_prune(uuid, text[]) to service_role;

