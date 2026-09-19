-- 무장애 여행 정보를 수집·저장한다.
--
-- KorWithService2/detailWithTour2가 장소별 접근성 정보를 준다. 공개 50곳 중
-- 24곳에 데이터가 있어 반려동물(2곳)보다 훨씬 넓다. 야간 성곽 보행은 낮보다
-- 어렵고, 유아차를 끄는 가족이나 고령자에게는 경사로와 화장실 정보가 방문
-- 가능 여부를 결정한다.
--
-- 원본 필드를 그대로 보존한다. KTO 표기가 "출입구까지 완만한 경사로가 설치되어
-- 있음"처럼 자유 문장이라 등급으로 환산하면 사실이 왜곡된다. 값이 있는 항목만
-- 화면에 보여주고 없는 항목은 표시하지 않는다.

create table if not exists raw.kto_with_tour (
  id uuid primary key default gen_random_uuid(),
  content_id text not null unique,
  payload_json jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists core.place_accessibility (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null unique references core.places(id) on delete cascade,
  -- 이동 접근성
  route_note text,
  exit_note text,
  elevator_note text,
  parking_note text,
  public_transport_note text,
  wheelchair_note text,
  -- 시각·청각 안내
  braille_block_note text,
  braille_promotion_note text,
  audio_guide_note text,
  big_print_note text,
  help_dog_note text,
  -- 위생·가족 편의
  restroom_note text,
  lactation_room_note text,
  stroller_note text,
  infants_family_note text,
  -- 기타 원문
  etc_note text,
  source_provider text not null default 'KTO',
  source_updated_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_place_accessibility_place on core.place_accessibility(place_id);

alter table raw.kto_with_tour enable row level security;
alter table core.place_accessibility enable row level security;

grant select, insert, update on raw.kto_with_tour to service_role;
grant select, insert, update on core.place_accessibility to service_role;
revoke all on table raw.kto_with_tour from public, anon, authenticated;
revoke all on table core.place_accessibility from public, anon, authenticated;

-- 수집 RPC. 원본을 보관하고 정규화한 값을 upsert한다.
create or replace function public.sync_kto_with_tour_item(
  p_run_id uuid,
  p_content_id text,
  p_payload jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_place_id uuid;
  v_has_any boolean;
begin
  select ps.place_id into v_place_id
  from core.place_sources ps
  where ps.kto_content_id = p_content_id;

  if v_place_id is null then
    return false;
  end if;

  insert into raw.kto_with_tour (content_id, payload_json)
  values (p_content_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (content_id) do update
    set payload_json = excluded.payload_json,
        fetched_at = pg_catalog.now();

  -- 값이 하나도 없으면 빈 행을 만들지 않는다. 화면에서 "정보 없음"을 띄우는 대신
  -- 카드를 감추는 쪽이 정책에 맞다.
  select exists (
    select 1
    from pg_catalog.jsonb_each_text(coalesce(p_payload, '{}'::jsonb)) as kv(key, value)
    where kv.key <> 'contentid'
      and pg_catalog.btrim(coalesce(kv.value, '')) <> ''
  ) into v_has_any;

  if not v_has_any then
    return false;
  end if;

  insert into core.place_accessibility (
    place_id, route_note, exit_note, elevator_note, parking_note, public_transport_note,
    wheelchair_note, braille_block_note, braille_promotion_note, audio_guide_note,
    big_print_note, help_dog_note, restroom_note, lactation_room_note, stroller_note,
    infants_family_note, etc_note, source_updated_at, last_checked_at
  )
  values (
    v_place_id,
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'route', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'exit', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'elevator', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'parking', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'publictransport', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'wheelchair', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'braileblock', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'brailepromotion', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'audioguide', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'bigprint', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'helpdog', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'restroom', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'lactationroom', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'stroller', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'infantsfamilyetc', '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_payload ->> 'handicapetc', '')), ''),
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (place_id) do update
    set route_note = excluded.route_note,
        exit_note = excluded.exit_note,
        elevator_note = excluded.elevator_note,
        parking_note = excluded.parking_note,
        public_transport_note = excluded.public_transport_note,
        wheelchair_note = excluded.wheelchair_note,
        braille_block_note = excluded.braille_block_note,
        braille_promotion_note = excluded.braille_promotion_note,
        audio_guide_note = excluded.audio_guide_note,
        big_print_note = excluded.big_print_note,
        help_dog_note = excluded.help_dog_note,
        restroom_note = excluded.restroom_note,
        lactation_room_note = excluded.lactation_room_note,
        stroller_note = excluded.stroller_note,
        infants_family_note = excluded.infants_family_note,
        etc_note = excluded.etc_note,
        source_updated_at = excluded.source_updated_at,
        last_checked_at = excluded.last_checked_at,
        updated_at = pg_catalog.now();

  return true;
end;
$$;

revoke all on function public.sync_kto_with_tour_item(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kto_with_tour_item(uuid, text, jsonb) to service_role;
