-- Approved public-data inventory and private ingestion stores.
-- Source payloads remain private; reviewed app contracts are added separately.

create schema if not exists ops;

create table if not exists ops.api_registry (
  api_key text primary key,
  provider text not null check (provider in ('kto', 'kma', 'gyeonggi')),
  display_name text not null,
  approval_status text not null check (approval_status in ('approved', 'expired', 'suspended')),
  account_stage text not null check (account_stage in ('development', 'production_submitted', 'production')),
  approved_at date not null,
  expires_at date not null,
  implementation_status text not null check (implementation_status in ('not_implemented', 'implemented', 'active', 'hold')),
  sync_job text,
  schedule_label text,
  freshness_sla_hours numeric check (freshness_sla_hours is null or freshness_sla_hours > 0),
  review_policy text not null check (review_policy in ('automatic', 'review_before_publish', 'internal_analysis', 'raw_only')),
  last_reviewed_at timestamptz,
  review_note text
);

insert into ops.api_registry (
  api_key, provider, display_name, approval_status, account_stage, approved_at,
  expires_at, implementation_status, sync_job, schedule_label,
  freshness_sla_hours, review_policy
) values
  ('kto_photo', 'kto', '한국관광공사 관광사진 정보', 'approved', 'production_submitted', '2026-09-19', '2028-09-19', 'active', 'photo', '주 1회', 192, 'review_before_publish'),
  ('kto_wellness', 'kto', '한국관광공사 웰니스관광정보', 'approved', 'production_submitted', '2026-09-19', '2028-09-19', 'active', 'wellness', '주 1회', 192, 'review_before_publish'),
  ('kto_local_hub', 'kto', '한국관광공사 기초지자체 중심 관광지 정보', 'approved', 'production_submitted', '2026-09-19', '2028-09-19', 'active', 'local_hub', '월 1회', 1080, 'review_before_publish'),
  ('kto_accessibility', 'kto', '한국관광공사 무장애 여행 정보', 'approved', 'production_submitted', '2026-09-19', '2028-09-19', 'active', 'access', '주 1회', 960, 'automatic'),
  ('kto_audio', 'kto', '한국관광공사 관광지 오디오 가이드정보', 'approved', 'production_submitted', '2026-09-19', '2028-09-19', 'active', 'audio', '주 1회', 960, 'automatic'),
  ('gg_bus_arrival', 'gyeonggi', '경기도 버스도착정보 조회', 'approved', 'production_submitted', '2026-09-18', '2028-09-18', 'active', 'bus_arrival', '요청 시 2분 캐시', 0.083333, 'automatic'),
  ('kto_crowd', 'kto', '한국관광공사 관광지 집중률 방문자 추이 예측 정보', 'approved', 'production_submitted', '2026-09-18', '2028-09-18', 'active', 'crowd', '매일', 36, 'automatic'),
  ('kma_short', 'kma', '기상청 단기예보 조회서비스', 'approved', 'production_submitted', '2026-05-29', '2028-05-29', 'active', 'weather_short', '3시간마다', 6, 'automatic'),
  ('kma_mid', 'kma', '기상청 중기예보 조회서비스', 'approved', 'production_submitted', '2026-05-29', '2028-05-29', 'active', 'weather_mid', '하루 2회', 18, 'automatic'),
  ('durunubi', 'kto', '한국관광공사 두루누비 정보 서비스', 'approved', 'production_submitted', '2026-05-25', '2028-05-25', 'active', 'durunubi', '주 1회', 192, 'review_before_publish'),
  ('kto_related', 'kto', '한국관광공사 관광지별 연관 관광지 정보', 'approved', 'production_submitted', '2026-05-25', '2028-05-25', 'active', 'related', '월 1회', 1080, 'review_before_publish'),
  ('kto_visitors', 'kto', '한국관광공사 빅데이터 지역별 방문자수', 'approved', 'production_submitted', '2026-05-25', '2028-05-25', 'active', 'visitors', '월 1회', 1080, 'internal_analysis'),
  ('kto_korean', 'kto', '한국관광공사 국문 관광정보 서비스', 'approved', 'production_submitted', '2026-05-25', '2028-05-25', 'active', 'content', '주 1회', 960, 'review_before_publish'),
  ('kto_pet', 'kto', '한국관광공사 반려동물 동반여행 서비스', 'approved', 'production_submitted', '2026-05-25', '2028-05-25', 'active', 'pet', '매일', 192, 'automatic')
on conflict (api_key) do update set
  provider = excluded.provider,
  display_name = excluded.display_name,
  approval_status = excluded.approval_status,
  account_stage = excluded.account_stage,
  approved_at = excluded.approved_at,
  expires_at = excluded.expires_at,
  implementation_status = excluded.implementation_status,
  sync_job = excluded.sync_job,
  schedule_label = excluded.schedule_label,
  freshness_sla_hours = excluded.freshness_sla_hours,
  review_policy = excluded.review_policy;

create table if not exists raw.public_api_items (
  id uuid primary key default gen_random_uuid(),
  api_key text not null references ops.api_registry(api_key),
  source_item_key text not null,
  scope_key text not null default '',
  payload jsonb not null,
  payload_hash text not null,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  last_sync_run_id uuid references raw.sync_runs(id) on delete set null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'hold', 'excluded')),
  reviewed_at timestamptz,
  review_note text,
  unique(api_key, source_item_key, scope_key)
);

create index if not exists idx_public_api_items_run on raw.public_api_items(last_sync_run_id);
create index if not exists idx_public_api_items_review on raw.public_api_items(api_key, review_status);

create table if not exists core.place_photo_candidates (
  id uuid primary key default gen_random_uuid(),
  source_item_key text not null unique,
  place_id uuid references core.places(id) on delete set null,
  title text not null,
  address_full text,
  lat numeric,
  lng numeric,
  image_url text not null,
  thumbnail_url text,
  copyright_code text,
  photographer text,
  source_url text,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'hold', 'excluded')),
  reviewed_at timestamptz,
  review_note text,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now()
);

create table if not exists core.place_wellness (
  source_item_key text primary key,
  place_id uuid references core.places(id) on delete set null,
  name text not null,
  address_full text,
  lat numeric,
  lng numeric,
  tags jsonb not null default '[]'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'hold', 'excluded')),
  reviewed_at timestamptz,
  review_note text,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now()
);

create table if not exists core.local_hub_candidates (
  source_item_key text not null,
  base_month text not null,
  district_code text not null,
  place_id uuid references core.places(id) on delete set null,
  title text not null,
  source_payload jsonb not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'hold', 'excluded')),
  reviewed_at timestamptz,
  review_note text,
  fetched_at timestamptz not null default now(),
  primary key(source_item_key, base_month, district_code)
);

create table if not exists core.place_relations (
  origin_source_key text not null,
  related_source_key text not null,
  base_month text not null,
  district_code text not null,
  origin_place_id uuid references core.places(id) on delete cascade,
  related_place_id uuid references core.places(id) on delete cascade,
  relation_score numeric,
  source_payload jsonb not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'hold', 'excluded')),
  reviewed_at timestamptz,
  review_note text,
  fetched_at timestamptz not null default now(),
  primary key(origin_source_key, related_source_key, base_month, district_code)
);

create table if not exists core.durunubi_courses (
  source_item_key text primary key,
  title text not null,
  address_full text,
  lat numeric,
  lng numeric,
  course_path jsonb not null default '[]'::jsonb,
  intersects_suwon boolean not null default false,
  source_payload jsonb not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'hold', 'excluded')),
  reviewed_at timestamptz,
  review_note text,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now()
);

create table if not exists core.regional_visitor_stats (
  stat_date date not null,
  district_code text not null,
  visitor_type text not null,
  visitor_count numeric not null check (visitor_count >= 0),
  source_payload jsonb not null,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  primary key(stat_date, district_code, visitor_type)
);

create table if not exists core.weather_forecasts (
  forecast_kind text not null check (forecast_kind in ('short', 'mid')),
  scope_key text not null,
  issued_at timestamptz not null,
  forecast_at timestamptz not null,
  category text not null,
  value_text text,
  value_number numeric,
  unit text,
  source_payload jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key(forecast_kind, scope_key, issued_at, forecast_at, category)
);

create table if not exists core.place_bus_stops (
  place_id uuid not null references core.places(id) on delete cascade,
  station_id text not null,
  station_name text not null,
  mapping_source text not null,
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'hold', 'excluded')),
  reviewed_at timestamptz,
  review_note text,
  primary key(place_id, station_id)
);

create table if not exists core.bus_arrival_snapshots (
  station_id text not null,
  route_id text not null,
  route_name text,
  arrival_order smallint not null check (arrival_order in (1, 2)),
  arrival_seconds integer check (arrival_seconds is null or arrival_seconds >= 0),
  remaining_stops integer check (remaining_stops is null or remaining_stops >= 0),
  fetched_at timestamptz not null,
  source_payload jsonb not null,
  primary key(station_id, route_id, arrival_order)
);

create index if not exists idx_place_photo_candidates_place_review
  on core.place_photo_candidates(place_id, review_status);
create index if not exists idx_place_wellness_place_review
  on core.place_wellness(place_id, review_status);
create index if not exists idx_local_hub_candidates_place_review
  on core.local_hub_candidates(place_id, review_status);
create index if not exists idx_place_relations_origin_review
  on core.place_relations(origin_place_id, review_status);
create index if not exists idx_place_relations_related
  on core.place_relations(related_place_id);

alter table ops.api_registry enable row level security;
alter table raw.public_api_items enable row level security;
alter table core.place_photo_candidates enable row level security;
alter table core.place_wellness enable row level security;
alter table core.local_hub_candidates enable row level security;
alter table core.place_relations enable row level security;
alter table core.durunubi_courses enable row level security;
alter table core.regional_visitor_stats enable row level security;
alter table core.weather_forecasts enable row level security;
alter table core.place_bus_stops enable row level security;
alter table core.bus_arrival_snapshots enable row level security;

revoke all on schema ops from public, anon, authenticated;
revoke all on all tables in schema ops from public, anon, authenticated;
revoke all on raw.public_api_items from public, anon, authenticated;
revoke all on core.place_photo_candidates, core.place_wellness,
  core.local_hub_candidates, core.place_relations, core.durunubi_courses,
  core.regional_visitor_stats, core.weather_forecasts, core.place_bus_stops,
  core.bus_arrival_snapshots from public, anon, authenticated;

grant usage on schema ops to service_role;
grant select, insert, update, delete on ops.api_registry to service_role;
grant select, insert, update, delete on raw.public_api_items to service_role;
grant select, insert, update, delete on core.place_photo_candidates,
  core.place_wellness, core.local_hub_candidates, core.place_relations,
  core.durunubi_courses, core.regional_visitor_stats, core.weather_forecasts,
  core.place_bus_stops, core.bus_arrival_snapshots to service_role;

create or replace function public.sync_public_api_item(
  p_run_id uuid,
  p_api_key text,
  p_source_item_key text,
  p_scope_key text,
  p_payload jsonb,
  p_payload_hash text,
  p_source_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, raw, ops
as $$
declare
  v_id uuid;
  v_changed boolean;
begin
  if p_source_item_key is null or btrim(p_source_item_key) = '' then
    raise exception 'source_item_key is required';
  end if;

  select id, payload_hash is distinct from p_payload_hash
    into v_id, v_changed
  from raw.public_api_items
  where api_key = p_api_key
    and source_item_key = p_source_item_key
    and scope_key = coalesce(p_scope_key, '');

  insert into raw.public_api_items (
    api_key, source_item_key, scope_key, payload, payload_hash,
    source_updated_at, fetched_at, last_sync_run_id
  ) values (
    p_api_key, p_source_item_key, coalesce(p_scope_key, ''), p_payload,
    p_payload_hash, p_source_updated_at, now(), p_run_id
  )
  on conflict (api_key, source_item_key, scope_key) do update set
    payload = excluded.payload,
    payload_hash = excluded.payload_hash,
    source_updated_at = excluded.source_updated_at,
    fetched_at = excluded.fetched_at,
    last_sync_run_id = excluded.last_sync_run_id
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'changed', coalesce(v_changed, true));
end;
$$;

create or replace function public.sync_public_api_review(
  p_api_key text,
  p_source_item_key text,
  p_scope_key text,
  p_review_status text,
  p_review_note text default null
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, raw, core
as $$
declare
  v_reviewed_at timestamptz;
  v_review_note text;
begin
  if p_review_status not in ('pending', 'approved', 'hold', 'excluded') then
    raise exception 'invalid review status';
  end if;

  v_reviewed_at := case when p_review_status = 'pending' then null else now() end;
  v_review_note := nullif(btrim(coalesce(p_review_note, '')), '');

  update raw.public_api_items
  set review_status = p_review_status,
      reviewed_at = v_reviewed_at,
      review_note = v_review_note
  where api_key = p_api_key
    and source_item_key = p_source_item_key
    and scope_key = coalesce(p_scope_key, '');

  if not found then raise exception 'public API item not found'; end if;

  case p_api_key
    when 'kto_photo' then
      update core.place_photo_candidates
      set review_status = p_review_status,
          reviewed_at = v_reviewed_at,
          review_note = v_review_note
      where source_item_key = p_source_item_key;
    when 'kto_wellness' then
      update core.place_wellness
      set review_status = p_review_status,
          reviewed_at = v_reviewed_at,
          review_note = v_review_note
      where source_item_key = p_source_item_key;
    when 'kto_local_hub' then
      update core.local_hub_candidates
      set review_status = p_review_status,
          reviewed_at = v_reviewed_at,
          review_note = v_review_note
      where source_item_key = p_source_item_key
        and base_month = split_part(coalesce(p_scope_key, ''), ':', 1)
        and district_code = split_part(coalesce(p_scope_key, ''), ':', 2);
    when 'kto_related' then
      update core.place_relations
      set review_status = p_review_status,
          reviewed_at = v_reviewed_at,
          review_note = v_review_note
      where origin_source_key = split_part(p_source_item_key, ':', 1)
        and related_source_key = split_part(p_source_item_key, ':', 2)
        and base_month = split_part(coalesce(p_scope_key, ''), ':', 1)
        and district_code = split_part(coalesce(p_scope_key, ''), ':', 2);
    when 'durunubi' then
      update core.durunubi_courses
      set review_status = p_review_status,
          reviewed_at = v_reviewed_at,
          review_note = v_review_note
      where source_item_key = p_source_item_key;
    else
      null;
  end case;
end;
$$;

-- Normalized payloads are intentionally routed through one service-only RPC.
-- It keeps browser roles away from private tables while each dataset retains a
-- typed table and constraint boundary.
create or replace function public.sync_public_api_core(
  p_dataset text,
  p_payload jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public, core
as $$
begin
  case p_dataset
    when 'photo' then
      insert into core.place_photo_candidates (
        source_item_key, place_id, title, address_full, lat, lng, image_url,
        thumbnail_url, copyright_code, photographer, source_url,
        source_updated_at, fetched_at
      ) values (
        p_payload->>'source_item_key', nullif(p_payload->>'place_id', '')::uuid,
        p_payload->>'title', p_payload->>'address_full',
        nullif(p_payload->>'lat', '')::numeric, nullif(p_payload->>'lng', '')::numeric,
        p_payload->>'image_url', p_payload->>'thumbnail_url',
        p_payload->>'copyright_code', p_payload->>'photographer',
        p_payload->>'source_url', nullif(p_payload->>'source_updated_at', '')::timestamptz,
        now()
      ) on conflict (source_item_key) do update set
        place_id = excluded.place_id, title = excluded.title,
        address_full = excluded.address_full, lat = excluded.lat, lng = excluded.lng,
        image_url = excluded.image_url, thumbnail_url = excluded.thumbnail_url,
        copyright_code = excluded.copyright_code, photographer = excluded.photographer,
        source_url = excluded.source_url, source_updated_at = excluded.source_updated_at,
        fetched_at = excluded.fetched_at;
    when 'wellness' then
      insert into core.place_wellness (
        source_item_key, place_id, name, address_full, lat, lng, tags,
        source_payload, source_updated_at, fetched_at
      ) values (
        p_payload->>'source_item_key', nullif(p_payload->>'place_id', '')::uuid,
        p_payload->>'name', p_payload->>'address_full',
        nullif(p_payload->>'lat', '')::numeric, nullif(p_payload->>'lng', '')::numeric,
        coalesce(p_payload->'tags', '[]'::jsonb), coalesce(p_payload->'source_payload', '{}'::jsonb),
        nullif(p_payload->>'source_updated_at', '')::timestamptz, now()
      ) on conflict (source_item_key) do update set
        place_id = excluded.place_id, name = excluded.name,
        address_full = excluded.address_full, lat = excluded.lat, lng = excluded.lng,
        tags = excluded.tags, source_payload = excluded.source_payload,
        source_updated_at = excluded.source_updated_at, fetched_at = excluded.fetched_at;
    when 'local_hub' then
      insert into core.local_hub_candidates (
        source_item_key, base_month, district_code, place_id, title,
        source_payload, fetched_at
      ) values (
        p_payload->>'source_item_key', p_payload->>'base_month', p_payload->>'district_code',
        nullif(p_payload->>'place_id', '')::uuid, p_payload->>'title',
        coalesce(p_payload->'source_payload', '{}'::jsonb), now()
      ) on conflict (source_item_key, base_month, district_code) do update set
        place_id = excluded.place_id, title = excluded.title,
        source_payload = excluded.source_payload, fetched_at = excluded.fetched_at;
    when 'related' then
      insert into core.place_relations (
        origin_source_key, related_source_key, base_month, district_code,
        origin_place_id, related_place_id, relation_score, source_payload, fetched_at
      ) values (
        p_payload->>'origin_source_key', p_payload->>'related_source_key',
        p_payload->>'base_month', p_payload->>'district_code',
        nullif(p_payload->>'origin_place_id', '')::uuid,
        nullif(p_payload->>'related_place_id', '')::uuid,
        nullif(p_payload->>'relation_score', '')::numeric,
        coalesce(p_payload->'source_payload', '{}'::jsonb), now()
      ) on conflict (origin_source_key, related_source_key, base_month, district_code) do update set
        origin_place_id = excluded.origin_place_id,
        related_place_id = excluded.related_place_id,
        relation_score = excluded.relation_score,
        source_payload = excluded.source_payload, fetched_at = excluded.fetched_at;
    when 'durunubi' then
      insert into core.durunubi_courses (
        source_item_key, title, address_full, lat, lng, course_path,
        intersects_suwon, source_payload, source_updated_at, fetched_at
      ) values (
        p_payload->>'source_item_key', p_payload->>'title', p_payload->>'address_full',
        nullif(p_payload->>'lat', '')::numeric, nullif(p_payload->>'lng', '')::numeric,
        coalesce(p_payload->'course_path', '[]'::jsonb),
        coalesce((p_payload->>'intersects_suwon')::boolean, false),
        coalesce(p_payload->'source_payload', '{}'::jsonb),
        nullif(p_payload->>'source_updated_at', '')::timestamptz, now()
      ) on conflict (source_item_key) do update set
        title = excluded.title, address_full = excluded.address_full,
        lat = excluded.lat, lng = excluded.lng, course_path = excluded.course_path,
        intersects_suwon = excluded.intersects_suwon,
        source_payload = excluded.source_payload,
        source_updated_at = excluded.source_updated_at, fetched_at = excluded.fetched_at;
    when 'visitors' then
      insert into core.regional_visitor_stats (
        stat_date, district_code, visitor_type, visitor_count,
        source_payload, source_updated_at, fetched_at
      ) values (
        (p_payload->>'stat_date')::date, p_payload->>'district_code',
        p_payload->>'visitor_type', (p_payload->>'visitor_count')::numeric,
        coalesce(p_payload->'source_payload', '{}'::jsonb),
        nullif(p_payload->>'source_updated_at', '')::timestamptz, now()
      ) on conflict (stat_date, district_code, visitor_type) do update set
        visitor_count = excluded.visitor_count,
        source_payload = excluded.source_payload,
        source_updated_at = excluded.source_updated_at, fetched_at = excluded.fetched_at;
    when 'weather' then
      insert into core.weather_forecasts (
        forecast_kind, scope_key, issued_at, forecast_at, category,
        value_text, value_number, unit, source_payload, fetched_at
      ) values (
        p_payload->>'forecast_kind', p_payload->>'scope_key',
        (p_payload->>'issued_at')::timestamptz, (p_payload->>'forecast_at')::timestamptz,
        p_payload->>'category', p_payload->>'value_text',
        nullif(p_payload->>'value_number', '')::numeric, p_payload->>'unit',
        coalesce(p_payload->'source_payload', '{}'::jsonb), now()
      ) on conflict (forecast_kind, scope_key, issued_at, forecast_at, category) do update set
        value_text = excluded.value_text, value_number = excluded.value_number,
        unit = excluded.unit, source_payload = excluded.source_payload,
        fetched_at = excluded.fetched_at;
    when 'bus_stop' then
      insert into core.place_bus_stops (
        place_id, station_id, station_name, mapping_source,
        review_status, reviewed_at, review_note
      ) values (
        (p_payload->>'place_id')::uuid, p_payload->>'station_id',
        p_payload->>'station_name', p_payload->>'mapping_source',
        coalesce(p_payload->>'review_status', 'pending'),
        nullif(p_payload->>'reviewed_at', '')::timestamptz,
        p_payload->>'review_note'
      ) on conflict (place_id, station_id) do update set
        station_name = excluded.station_name, mapping_source = excluded.mapping_source,
        review_status = excluded.review_status, reviewed_at = excluded.reviewed_at,
        review_note = excluded.review_note;
    when 'bus_arrival' then
      insert into core.bus_arrival_snapshots (
        station_id, route_id, route_name, arrival_order, arrival_seconds,
        remaining_stops, fetched_at, source_payload
      ) values (
        p_payload->>'station_id', p_payload->>'route_id', p_payload->>'route_name',
        (p_payload->>'arrival_order')::smallint,
        nullif(p_payload->>'arrival_seconds', '')::integer,
        nullif(p_payload->>'remaining_stops', '')::integer,
        (p_payload->>'fetched_at')::timestamptz,
        coalesce(p_payload->'source_payload', '{}'::jsonb)
      ) on conflict (station_id, route_id, arrival_order) do update set
        route_name = excluded.route_name, arrival_seconds = excluded.arrival_seconds,
        remaining_stops = excluded.remaining_stops, fetched_at = excluded.fetched_at,
        source_payload = excluded.source_payload;
    else
      raise exception 'unsupported public dataset: %', p_dataset;
  end case;
end;
$$;

create or replace function public.sync_list_api_registry()
returns table (
  api_key text,
  provider text,
  display_name text,
  approval_status text,
  account_stage text,
  approved_at date,
  expires_at date,
  implementation_status text,
  sync_job text,
  schedule_label text,
  freshness_sla_hours numeric,
  review_policy text,
  last_reviewed_at timestamptz,
  review_note text
)
language sql
stable
security invoker
set search_path = pg_catalog, ops
as $$
  select
    r.api_key, r.provider, r.display_name, r.approval_status,
    r.account_stage, r.approved_at, r.expires_at,
    r.implementation_status, r.sync_job, r.schedule_label,
    r.freshness_sla_hours, r.review_policy,
    r.last_reviewed_at, r.review_note
  from ops.api_registry r
  order by r.provider, r.display_name;
$$;

revoke all on function public.sync_public_api_item(uuid, text, text, text, jsonb, text, timestamptz) from public, anon, authenticated;
revoke all on function public.sync_public_api_review(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.sync_public_api_core(text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_list_api_registry() from public, anon, authenticated;
grant execute on function public.sync_public_api_item(uuid, text, text, text, jsonb, text, timestamptz) to service_role;
grant execute on function public.sync_public_api_review(text, text, text, text, text) to service_role;
grant execute on function public.sync_public_api_core(text, jsonb) to service_role;
grant execute on function public.sync_list_api_registry() to service_role;
