-- 오디오 해설(한국관광공사 오디(Odii) 관광지 오디오 가이드)을 수집·저장한다.
--
-- 다른 KTO 서비스와 달리 오디오 가이드는 contentId로 조회할 수 없다. 자체
-- 테마/스토리 식별자(tid/stid)와 좌표만 주므로 좌표로 공개 장소에 잇는다.
-- 반경 120m는 시행착오로 정했다: 80m면 성곽 시설물 상당수를 놓치고 250m면
-- 갈빗집에 성곽 해설이 붙는다.
--
-- 오디오 파일이 없는 항목도 저장한다. 수원화성 성곽 해설 66건은 오디(Odii) 앱
-- 전용이라 audioUrl이 비어 있지만, 해설 본문 자체가 야간 산책 중 읽을 자료로
-- 쓸 만하다. 재생 가능한 항목과 읽을거리를 화면에서 구분해 보여준다.

create table if not exists raw.kto_audio_story (
  id uuid primary key default gen_random_uuid(),
  story_lang_id text not null unique,
  payload_json jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists core.place_audio_stories (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references core.places(id) on delete cascade,
  -- 오디(Odii) 식별자. stlid가 언어별 스토리 단위라 고유키로 쓴다.
  story_lang_id text not null,
  theme_id text,
  story_id text,
  spot_title text,
  audio_title text not null,
  script text,
  play_seconds integer,
  audio_url text,
  image_url text,
  lat double precision,
  lng double precision,
  distance_m integer,
  source_provider text not null default 'KTO_ODII',
  source_updated_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, story_lang_id)
);

create index if not exists idx_place_audio_stories_place
  on core.place_audio_stories(place_id, distance_m);

alter table raw.kto_audio_story enable row level security;
alter table core.place_audio_stories enable row level security;

grant select, insert, update, delete on raw.kto_audio_story to service_role;
grant select, insert, update, delete on core.place_audio_stories to service_role;
revoke all on table raw.kto_audio_story from public, anon, authenticated;
revoke all on table core.place_audio_stories from public, anon, authenticated;

-- 수집 RPC. 좌표 매칭은 수집 스크립트가 하고, 여기서는 place_id를 받아 저장한다.
-- 거리 계산을 SQL로 옮기면 PostGIS 의존이 생기고, 매칭 반경을 조정할 때마다
-- 마이그레이션을 새로 써야 한다.
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

  if not pg_catalog.pg_has_role(pg_catalog.current_user, 'service_role', 'member')
     and pg_catalog.current_user <> 'postgres' then
    raise exception 'insufficient privilege';
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

revoke all on function public.sync_kto_audio_story_item(uuid, uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.sync_kto_audio_story_item(uuid, uuid, jsonb, integer) to service_role;

-- 반경 밖으로 밀려난 오래된 연결을 정리한다. 매칭 반경을 조정하거나 상류에서
-- 좌표가 수정되면 과거 연결이 남아 엉뚱한 해설이 붙은 채로 공개된다.
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
  if not pg_catalog.pg_has_role(pg_catalog.current_user, 'service_role', 'member')
     and pg_catalog.current_user <> 'postgres' then
    raise exception 'insufficient privilege';
  end if;

  delete from core.place_audio_stories pas
  where pas.place_id = p_place_id
    and not (pas.story_lang_id = any(coalesce(p_keep_story_lang_ids, array[]::text[])));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.sync_kto_audio_prune(uuid, text[]) from public, anon, authenticated;
grant execute on function public.sync_kto_audio_prune(uuid, text[]) to service_role;

