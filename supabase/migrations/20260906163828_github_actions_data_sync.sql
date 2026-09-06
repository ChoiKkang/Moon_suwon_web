-- GitHub Actions writes through these RPCs instead of exposing internal
-- schemas to the public Data API. The functions are executable by the
-- service_role only; anon/authenticated clients cannot call them.

create schema if not exists raw;
create schema if not exists core;
create extension if not exists pgcrypto;

create table if not exists raw.sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null,
  items_fetched integer not null default 0,
  items_upserted integer not null default 0,
  error_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists raw.sync_errors (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid not null references raw.sync_runs(id) on delete cascade,
  endpoint text not null,
  content_id text,
  error_code text,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists raw.kto_kor_content (
  id uuid primary key default gen_random_uuid(),
  source_endpoint text not null,
  content_id text not null,
  content_type_id text,
  payload_json jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (source_endpoint, content_id)
);

create table if not exists raw.kto_kor_images (
  id uuid primary key default gen_random_uuid(),
  source_endpoint text not null,
  content_id text not null,
  image_url text not null,
  payload_json jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (source_endpoint, content_id, image_url)
);

create table if not exists raw.kto_pet_tour (
  id uuid primary key default gen_random_uuid(),
  source_endpoint text not null,
  content_id text not null,
  payload_json jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (source_endpoint, content_id)
);

create table if not exists raw.kto_crowd_forecast (
  id uuid primary key default gen_random_uuid(),
  area_code text not null,
  sigungu_code text not null,
  tourist_attraction_name text not null,
  forecast_date date not null,
  concentration_rate numeric not null,
  payload_json jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (area_code, sigungu_code, tourist_attraction_name, forecast_date)
);

create table if not exists core.place_pet_policies (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null unique references core.places(id) on delete cascade,
  pet_policy text not null,
  pet_note_raw text,
  pet_note_short text,
  updated_at timestamptz default now()
);

alter table core.place_pet_policies add column if not exists is_manual_override boolean not null default false;
alter table core.place_pet_policies add column if not exists source_provider text not null default 'KTO';
alter table core.place_pet_policies add column if not exists source_updated_at timestamptz;

create table if not exists core.place_crowd_forecasts (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references core.places(id) on delete cascade,
  forecast_date date not null,
  forecast_score numeric not null,
  crowd_level text not null,
  source_updated_at timestamptz not null default now(),
  unique (place_id, forecast_date)
);

create index if not exists idx_sync_errors_sync_run_id on raw.sync_errors(sync_run_id);
create index if not exists idx_place_crowd_forecasts_place_date on core.place_crowd_forecasts(place_id, forecast_date);

grant usage on schema raw, core to service_role;
grant select, insert, update on raw.sync_runs, raw.sync_errors, raw.kto_kor_content, raw.kto_kor_images, raw.kto_pet_tour, raw.kto_crowd_forecast to service_role;
grant select, insert, update on core.places, core.place_sources, core.place_images, core.place_pet_policies, core.place_crowd_forecasts to service_role;

create or replace function public.sync_run_start(
  p_source text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_run_id uuid;
begin
  if nullif(btrim(p_source), '') is null then
    raise exception 'sync source is required';
  end if;

  insert into raw.sync_runs (source, status, metadata)
  values (btrim(p_source), 'running', coalesce(p_metadata, '{}'::jsonb))
  returning id into v_run_id;

  return v_run_id;
end;
$$;

create or replace function public.sync_run_finish(
  p_run_id uuid,
  p_status text,
  p_items_fetched integer,
  p_items_upserted integer,
  p_error_count integer,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  update raw.sync_runs
  set status = coalesce(nullif(btrim(p_status), ''), 'completed'),
      items_fetched = greatest(coalesce(p_items_fetched, 0), 0),
      items_upserted = greatest(coalesce(p_items_upserted, 0), 0),
      error_count = greatest(coalesce(p_error_count, 0), 0),
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      completed_at = now()
  where id = p_run_id;

  if not found then
    raise exception 'sync run % not found', p_run_id;
  end if;
end;
$$;

create or replace function public.sync_run_error(
  p_run_id uuid,
  p_endpoint text,
  p_content_id text default null,
  p_error_code text default null,
  p_message text default 'unknown sync error'
)
returns void
language plpgsql
volatile
set search_path = pg_catalog
as $$
begin
  insert into raw.sync_errors (sync_run_id, endpoint, content_id, error_code, message)
  values (
    p_run_id,
    coalesce(nullif(btrim(p_endpoint), ''), 'unknown'),
    nullif(btrim(p_content_id), ''),
    nullif(btrim(p_error_code), ''),
    left(coalesce(nullif(btrim(p_message), ''), 'unknown sync error'), 4000)
  );
end;
$$;

create or replace function public.sync_list_places()
returns table (
  place_id uuid,
  kto_content_id text,
  official_name text
)
language sql
stable
set search_path = pg_catalog
as $$
  select p.id, ps.kto_content_id, p.official_name
  from core.places p
  join core.place_sources ps on ps.place_id = p.id
  where p.is_active = true
    and coalesce(ps.sync_enabled, true) = true
  order by p.official_name;
$$;

create or replace function public.sync_kto_content_item(
  p_run_id uuid,
  p_content_id text,
  p_content_type_id text,
  p_list_payload jsonb,
  p_detail_payload jsonb,
  p_normalized_place jsonb,
  p_images jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_place_id uuid;
  v_existing_sync_enabled boolean;
  v_image jsonb;
  v_image_url text;
  v_source_image_id text;
  v_image_index integer := 0;
  v_has_hero boolean := false;
  v_slug text := nullif(btrim(p_normalized_place ->> 'slug'), '');
  v_name text := nullif(btrim(p_normalized_place ->> 'official_name'), '');
  v_address text := nullif(btrim(p_normalized_place ->> 'address_full'), '');
  v_lat numeric := nullif(p_normalized_place ->> 'lat', '')::numeric;
  v_lng numeric := nullif(p_normalized_place ->> 'lng', '')::numeric;
  v_phone text := nullif(btrim(p_normalized_place ->> 'contact_phone'), '');
  v_overview text := nullif(p_normalized_place ->> 'source_overview_raw', '');
  v_modified_at timestamptz;
begin
  if v_slug is null or v_name is null or v_lat is null or v_lng is null then
    raise exception 'normalized place is missing slug, name, or coordinates';
  end if;

  begin
    v_modified_at := nullif(p_normalized_place ->> 'source_modified_at', '')::timestamptz;
  exception when others then
    v_modified_at := null;
  end;

  insert into raw.kto_kor_content (source_endpoint, content_id, content_type_id, payload_json)
  values ('areaBasedList2', p_content_id, p_content_type_id, coalesce(p_list_payload, '{}'::jsonb))
  on conflict (source_endpoint, content_id) do update
    set content_type_id = excluded.content_type_id,
        payload_json = excluded.payload_json,
        fetched_at = now();

  insert into raw.kto_kor_content (source_endpoint, content_id, content_type_id, payload_json)
  values ('detailCommon2', p_content_id, p_content_type_id, coalesce(p_detail_payload, '{}'::jsonb))
  on conflict (source_endpoint, content_id) do update
    set content_type_id = excluded.content_type_id,
        payload_json = excluded.payload_json,
        fetched_at = now();

  select ps.place_id, coalesce(ps.sync_enabled, true)
  into v_place_id, v_existing_sync_enabled
  from core.place_sources ps
  where ps.kto_content_id = p_content_id
  limit 1;

  if v_place_id is not null and v_existing_sync_enabled = false then
    return v_place_id;
  end if;

  if v_place_id is null then
    insert into core.places (
      slug, official_name, address_full, lat, lng, contact_phone,
      source_overview_raw, source_modified_at, is_active, updated_at
    )
    values (
      v_slug, v_name, v_address, v_lat, v_lng, v_phone,
      v_overview, v_modified_at, true, now()
    )
    on conflict (slug) do update
      set official_name = excluded.official_name,
          address_full = excluded.address_full,
          lat = excluded.lat,
          lng = excluded.lng,
          contact_phone = excluded.contact_phone,
          source_overview_raw = coalesce(excluded.source_overview_raw, core.places.source_overview_raw),
          source_modified_at = coalesce(excluded.source_modified_at, core.places.source_modified_at),
          updated_at = now()
    returning id into v_place_id;
  else
    update core.places
    set official_name = v_name,
        address_full = v_address,
        lat = v_lat,
        lng = v_lng,
        contact_phone = v_phone,
        source_overview_raw = coalesce(v_overview, source_overview_raw),
        source_modified_at = coalesce(v_modified_at, source_modified_at),
        updated_at = now()
    where id = v_place_id;
  end if;

  insert into core.place_sources (place_id, kto_content_id, kto_content_type_id, sync_enabled)
  values (v_place_id, p_content_id, p_content_type_id, true)
  on conflict (kto_content_id) do update
    set place_id = excluded.place_id,
        kto_content_type_id = excluded.kto_content_type_id;

  if jsonb_typeof(coalesce(p_images, '[]'::jsonb)) = 'array' then
    select exists (
      select 1
      from jsonb_array_elements(coalesce(p_images, '[]'::jsonb)) as item
      where coalesce((item ->> 'is_hero')::boolean, false) = true
    ) into v_has_hero;

    if v_has_hero then
      update core.place_images
      set is_hero = false
      where place_id = v_place_id
        and source_provider = 'KTO'
        and is_hero = true;
    end if;

    for v_image in select value from jsonb_array_elements(coalesce(p_images, '[]'::jsonb))
    loop
      v_image_index := v_image_index + 1;
      v_image_url := nullif(btrim(v_image ->> 'image_url'), '');
      if v_image_url is null then
        continue;
      end if;

      v_source_image_id := coalesce(
        nullif(btrim(v_image ->> 'source_image_id'), ''),
        p_content_id || ':image:' || v_image_index::text
      );

      insert into raw.kto_kor_images (source_endpoint, content_id, image_url, payload_json)
      values ('detailImage2', p_content_id, v_image_url, coalesce(v_image -> 'payload_json', v_image))
      on conflict (source_endpoint, content_id, image_url) do update
        set payload_json = excluded.payload_json,
            fetched_at = now();

      insert into core.place_images (
        place_id, image_url, thumbnail_url, alt_text, copyright_type,
        source_provider, source_image_id, is_hero, display_order
      )
      values (
        v_place_id,
        v_image_url,
        nullif(btrim(v_image ->> 'thumbnail_url'), ''),
        nullif(btrim(v_image ->> 'alt_text'), ''),
        nullif(btrim(v_image ->> 'copyright_type'), ''),
        'KTO',
        v_source_image_id,
        coalesce((v_image ->> 'is_hero')::boolean, false),
        coalesce(nullif(v_image ->> 'display_order', '')::integer, v_image_index)
      )
      on conflict do nothing;

      update core.place_images
      set image_url = v_image_url,
          thumbnail_url = nullif(btrim(v_image ->> 'thumbnail_url'), ''),
          alt_text = nullif(btrim(v_image ->> 'alt_text'), ''),
          copyright_type = nullif(btrim(v_image ->> 'copyright_type'), ''),
          is_hero = coalesce((v_image ->> 'is_hero')::boolean, false),
          display_order = coalesce(nullif(v_image ->> 'display_order', '')::integer, v_image_index)
      where place_id = v_place_id
        and source_provider = 'KTO'
        and source_image_id = v_source_image_id
        and not exists (
          select 1
          from core.place_images duplicate
          where duplicate.place_id = v_place_id
            and duplicate.image_url = v_image_url
            and duplicate.source_provider = 'KTO'
            and duplicate.source_image_id <> v_source_image_id
        );
    end loop;
  end if;

  return v_place_id;
end;
$$;

create or replace function public.sync_kto_pet_item(
  p_run_id uuid,
  p_content_id text,
  p_payload jsonb
)
returns boolean
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_place_id uuid;
  v_policy text;
  v_type text := lower(coalesce(p_payload ->> 'acmpyTypeCd', ''));
  v_possible text := lower(coalesce(p_payload ->> 'acmpyPsblCpam', ''));
  v_need text := nullif(btrim(p_payload ->> 'acmpyNeedMtr'), '');
  v_other text := nullif(btrim(p_payload ->> 'etcAcmpyInfo'), '');
  v_raw_note text;
begin
  insert into raw.kto_pet_tour (source_endpoint, content_id, payload_json)
  values ('detailPetTour2', p_content_id, coalesce(p_payload, '{}'::jsonb))
  on conflict (source_endpoint, content_id) do update
    set payload_json = excluded.payload_json,
        fetched_at = now();

  select ps.place_id into v_place_id
  from core.place_sources ps
  where ps.kto_content_id = p_content_id
  limit 1;

  if v_place_id is null then
    return false;
  end if;

  if v_type = '' and v_possible = '' and v_need is null and v_other is null then
    return false;
  end if;

  if v_type like '%불가%' or v_possible like '%불가%' then
    v_policy := 'not_allowed';
  elsif v_type like '%일부%' or v_type like '%제한%' then
    v_policy := 'partial';
  elsif v_type like '%가능%' or v_possible like '%가능%' then
    v_policy := 'allowed';
  else
    v_policy := 'unknown';
  end if;

  v_raw_note := nullif(concat_ws(E'\n',
    nullif(btrim(p_payload ->> 'acmpyPsblCpam'), ''),
    nullif(btrim(p_payload ->> 'acmpyNeedMtr'), ''),
    nullif(btrim(p_payload ->> 'etcAcmpyInfo'), '')
  ), '');

  insert into core.place_pet_policies (
    place_id, pet_policy, pet_note_raw, pet_note_short,
    is_manual_override, source_provider, source_updated_at, updated_at
  )
  values (
    v_place_id,
    v_policy,
    v_raw_note,
    left(regexp_replace(coalesce(v_raw_note, ''), '\\s+', ' ', 'g'), 240),
    false,
    'KTO',
    now(),
    now()
  )
  on conflict (place_id) do update
    set pet_policy = excluded.pet_policy,
        pet_note_raw = excluded.pet_note_raw,
        pet_note_short = excluded.pet_note_short,
        source_provider = excluded.source_provider,
        source_updated_at = excluded.source_updated_at,
        updated_at = now()
    where coalesce(core.place_pet_policies.is_manual_override, false) = false;

  return true;
end;
$$;

create or replace function public.sync_kto_crowd_batch(
  p_run_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_row jsonb;
  v_place_id uuid;
  v_area_code text;
  v_sigungu_code text;
  v_name text;
  v_forecast_date date;
  v_rate numeric;
  v_level text;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'crowd rows must be a JSON array';
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_area_code := nullif(btrim(v_row ->> 'area_code'), '');
    v_sigungu_code := nullif(btrim(v_row ->> 'sigungu_code'), '');
    v_name := nullif(btrim(v_row ->> 'tourist_attraction_name'), '');
    v_forecast_date := nullif(v_row ->> 'forecast_date', '')::date;
    v_rate := nullif(v_row ->> 'concentration_rate', '')::numeric;

    if v_area_code is null or v_sigungu_code is null or v_name is null or v_forecast_date is null or v_rate is null then
      continue;
    end if;

    insert into raw.kto_crowd_forecast (
      area_code, sigungu_code, tourist_attraction_name,
      forecast_date, concentration_rate, payload_json, fetched_at
    )
    values (
      v_area_code,
      v_sigungu_code,
      v_name,
      v_forecast_date,
      v_rate,
      coalesce(v_row -> 'payload_json', v_row),
      now()
    )
    on conflict (area_code, sigungu_code, tourist_attraction_name, forecast_date) do update
      set concentration_rate = excluded.concentration_rate,
          payload_json = excluded.payload_json,
          fetched_at = now();

    select p.id into v_place_id
    from core.places p
    join core.place_sources ps on ps.place_id = p.id
    where p.is_active = true
      and coalesce(ps.sync_enabled, true) = true
      and regexp_replace(lower(btrim(p.official_name)), '\\s+', '', 'g') = regexp_replace(lower(v_name), '\\s+', '', 'g')
    order by p.id
    limit 1;

    if v_place_id is null then
      continue;
    end if;

    v_level := case
      when v_rate < 40 then '여유'
      when v_rate < 70 then '보통'
      else '혼잡'
    end;

    insert into core.place_crowd_forecasts (
      place_id, forecast_date, forecast_score, crowd_level, source_updated_at
    )
    values (v_place_id, v_forecast_date, v_rate, v_level, now())
    on conflict (place_id, forecast_date) do update
      set forecast_score = excluded.forecast_score,
          crowd_level = excluded.crowd_level,
          source_updated_at = excluded.source_updated_at;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.sync_run_start(text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_run_finish(uuid, text, integer, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.sync_run_error(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.sync_list_places() from public, anon, authenticated;
revoke all on function public.sync_kto_content_item(uuid, text, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.sync_kto_pet_item(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.sync_kto_crowd_batch(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.sync_run_start(text, jsonb) to service_role;
grant execute on function public.sync_run_finish(uuid, text, integer, integer, integer, jsonb) to service_role;
grant execute on function public.sync_run_error(uuid, text, text, text, text) to service_role;
grant execute on function public.sync_list_places() to service_role;
grant execute on function public.sync_kto_content_item(uuid, text, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.sync_kto_pet_item(uuid, text, jsonb) to service_role;
grant execute on function public.sync_kto_crowd_batch(uuid, jsonb) to service_role;
