-- Prioritize app-visible pet gaps and make identical refreshes observable as
-- healthy no-change runs. Crowd matches must be unique before publication.

drop function if exists public.sync_list_pet_enrichment(integer);

create function public.sync_list_pet_enrichment(p_limit integer default 250)
returns table (
  place_id uuid,
  kto_content_id text,
  source_modified_at timestamptz,
  source_updated_at timestamptz,
  last_pet_checked_at timestamptz,
  data_status text,
  is_published boolean
)
language sql
stable
set search_path = pg_catalog
as $$
  select p.id,
         ps.kto_content_id,
         p.source_modified_at,
         pp.source_updated_at,
         ps.last_pet_checked_at,
         pg_catalog.coalesce(pp.data_status, 'unknown'),
         pg_catalog.coalesce(pps.is_published, false)
  from core.places p
  join core.place_sources ps on ps.place_id = p.id
  left join core.place_pet_policies pp on pp.place_id = p.id
  left join editorial.place_publish_state pps on pps.place_id = p.id
  where p.is_active = true
    and pg_catalog.coalesce(ps.sync_enabled, true) = true
    and ps.ingestion_status in ('candidate', 'approved', 'stale')
    and (
      pp.place_id is null
      or pp.last_checked_at is null
      or pp.data_status in ('stale', 'unavailable', 'unknown')
      or (p.source_modified_at is not null and (pp.source_updated_at is null or p.source_modified_at > pp.source_updated_at))
    )
  order by
    case when pps.is_published is true then 0 else 1 end,
    case when pp.place_id is null or pp.last_checked_at is null then 0 else 1 end,
    ps.last_pet_checked_at nulls first,
    p.official_name
  limit pg_catalog.greatest(0, pg_catalog.least(pg_catalog.coalesce(p_limit, 250), 1000));
$$;

revoke all on function public.sync_list_pet_enrichment(integer) from public, anon, authenticated;
grant execute on function public.sync_list_pet_enrichment(integer) to service_role;

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
  v_payload jsonb := pg_catalog.coalesce(p_payload, '{}'::jsonb);
  v_previous_payload jsonb;
  v_changed boolean;
  v_type text := pg_catalog.lower(pg_catalog.coalesce(v_payload ->> 'acmpyTypeCd', ''));
  v_possible text := pg_catalog.lower(pg_catalog.coalesce(v_payload ->> 'acmpyPsblCpam', ''));
  v_policy text;
  v_raw_note text;
  v_short_note text;
begin
  select raw_pet.payload_json into v_previous_payload
  from raw.kto_pet_tour raw_pet
  where raw_pet.source_endpoint = 'detailPetTour2'
    and raw_pet.content_id = pg_catalog.btrim(p_content_id);
  v_changed := v_previous_payload is distinct from v_payload;

  insert into raw.kto_pet_tour (source_endpoint, content_id, payload_json)
  values ('detailPetTour2', pg_catalog.btrim(p_content_id), v_payload)
  on conflict (source_endpoint, content_id) do update
    set payload_json = excluded.payload_json,
        fetched_at = pg_catalog.now();

  select ps.place_id into v_place_id
  from core.place_sources ps
  where ps.kto_content_id = pg_catalog.btrim(p_content_id)
  limit 1;
  if v_place_id is null then return false; end if;

  if v_type like '%불가%' or v_possible like '%불가%' or v_type like '%불허%' or v_possible like '%불허%' then
    v_policy := 'not_allowed';
  elsif v_type like '%일부%' or v_possible like '%일부%'
     or v_type like '%제한%' or v_possible like '%제한%'
     or v_type like '%문의%' or v_possible like '%문의%' then
    v_policy := 'partial';
  elsif v_type like '%가능%' or v_possible like '%가능%'
     or v_type like '%허용%' or v_possible like '%허용%' then
    v_policy := 'allowed';
  else
    v_policy := 'unknown';
  end if;

  v_raw_note := pg_catalog.nullif(pg_catalog.concat_ws(E'\n',
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'acmpyPsblCpam'), ''),
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'acmpyNeedMtr'), ''),
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'etcAcmpyInfo'), ''),
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'acmpyTypeCd'), ''),
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'relaAcdntRiskMtr'), ''),
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'relaPosesFclty'), ''),
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'relaRntlPrdlst'), ''),
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'relaFrnshPrdlst'), ''),
    pg_catalog.nullif(pg_catalog.btrim(v_payload ->> 'relaPurcPrdlst'), '')
  ), '');
  v_short_note := pg_catalog.nullif(pg_catalog.left(pg_catalog.regexp_replace(pg_catalog.coalesce(v_raw_note, ''), '\s+', ' ', 'g'), 240), '');

  insert into core.place_pet_policies (
    place_id, pet_policy, pet_note_raw, pet_note_short,
    is_manual_override, source_provider, source_updated_at,
    data_status, last_checked_at, details_json, updated_at
  ) values (
    v_place_id, v_policy, v_raw_note, v_short_note,
    false, 'KTO', pg_catalog.now(), 'fresh', pg_catalog.now(), v_payload, pg_catalog.now()
  )
  on conflict (place_id) do update
    set pet_policy = excluded.pet_policy,
        pet_note_raw = excluded.pet_note_raw,
        pet_note_short = excluded.pet_note_short,
        source_provider = excluded.source_provider,
        source_updated_at = excluded.source_updated_at,
        data_status = excluded.data_status,
        last_checked_at = excluded.last_checked_at,
        details_json = excluded.details_json,
        updated_at = pg_catalog.now()
    where pg_catalog.coalesce(core.place_pet_policies.is_manual_override, false) = false;

  update core.place_sources
  set last_pet_checked_at = pg_catalog.now()
  where kto_content_id = pg_catalog.btrim(p_content_id);

  return v_changed;
end;
$$;

revoke all on function public.sync_kto_pet_item(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kto_pet_item(uuid, text, jsonb) to service_role;

create or replace function public.sync_kto_crowd_batch(p_run_id uuid, p_rows jsonb)
returns integer
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_row jsonb;
  v_place_id uuid;
  v_match_count integer;
  v_area_code text;
  v_sigungu_code text;
  v_name text;
  v_forecast_date date;
  v_rate numeric;
  v_level text;
  v_count integer := 0;
begin
  if pg_catalog.jsonb_typeof(pg_catalog.coalesce(p_rows, '[]'::jsonb)) <> 'array' then
    raise exception 'crowd rows must be a JSON array';
  end if;

  for v_row in select value from pg_catalog.jsonb_array_elements(pg_catalog.coalesce(p_rows, '[]'::jsonb)) loop
    v_area_code := pg_catalog.nullif(pg_catalog.btrim(v_row ->> 'area_code'), '');
    v_sigungu_code := pg_catalog.nullif(pg_catalog.btrim(v_row ->> 'sigungu_code'), '');
    v_name := pg_catalog.nullif(pg_catalog.btrim(v_row ->> 'tourist_attraction_name'), '');
    v_forecast_date := pg_catalog.nullif(v_row ->> 'forecast_date', '')::date;
    v_rate := pg_catalog.nullif(v_row ->> 'concentration_rate', '')::numeric;
    if v_area_code is null or v_sigungu_code is null or v_name is null or v_forecast_date is null or v_rate is null then continue; end if;

    insert into raw.kto_crowd_forecast (
      area_code, sigungu_code, tourist_attraction_name, forecast_date,
      concentration_rate, payload_json, fetched_at
    ) values (
      v_area_code, v_sigungu_code, v_name, v_forecast_date,
      v_rate, pg_catalog.coalesce(v_row -> 'payload_json', v_row), pg_catalog.now()
    )
    on conflict (area_code, sigungu_code, tourist_attraction_name, forecast_date) do update
      set concentration_rate = excluded.concentration_rate,
          payload_json = excluded.payload_json,
          fetched_at = pg_catalog.now();

    select pg_catalog.count(distinct candidate.id)
      into v_match_count
    from core.places candidate
    join core.place_sources source on source.place_id = candidate.id
    where candidate.is_active = true
      and pg_catalog.coalesce(source.sync_enabled, true) = true
      and pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(candidate.official_name)), '[[:space:][:punct:]]+', '', 'g')
        = pg_catalog.regexp_replace(pg_catalog.lower(v_name), '[[:space:][:punct:]]+', '', 'g');

    if v_match_count <> 1 then continue; end if;
    select candidate.id into v_place_id
    from core.places candidate
    join core.place_sources source on source.place_id = candidate.id
    where candidate.is_active = true
      and pg_catalog.coalesce(source.sync_enabled, true) = true
      and pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.btrim(candidate.official_name)), '[[:space:][:punct:]]+', '', 'g')
        = pg_catalog.regexp_replace(pg_catalog.lower(v_name), '[[:space:][:punct:]]+', '', 'g')
    limit 1;
    v_level := case when v_rate < 40 then '여유' when v_rate < 70 then '보통' else '혼잡' end;

    insert into core.place_crowd_forecasts (
      place_id, forecast_date, forecast_score, crowd_level, source_updated_at
    ) values (v_place_id, v_forecast_date, v_rate, v_level, pg_catalog.now())
    on conflict (place_id, forecast_date) do update
      set forecast_score = excluded.forecast_score,
          crowd_level = excluded.crowd_level,
          source_updated_at = excluded.source_updated_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.sync_kto_crowd_batch(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.sync_kto_crowd_batch(uuid, jsonb) to service_role;
