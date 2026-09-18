-- Collected places must enter the review queue instead of arriving approved.
--
-- core.place_sources.ingestion_status defaults to 'approved' and
-- sync_kto_content_item never set it, so anything the sync collected counted as
-- reviewed. That was survivable while collection covered only the 39 관광지 rows
-- an operator had already vetted by hand, but the content sync now walks
-- 문화시설, 레포츠, 숙박 and the 야간 영업 음식점 as well, and those must not reach
-- the publish switch without someone looking at them.
--
-- Insert new rows as 'candidate' and keep the existing status on conflict so a
-- re-sync never reopens or overrides a decision an operator already made.

create or replace function public.sync_kto_content_item(p_run_id uuid, p_content_id text, p_content_type_id text, p_list_payload jsonb, p_detail_payload jsonb, p_normalized_place jsonb, p_images jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $$
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

  -- A newly collected item has not been reviewed yet. The column default is
  -- 'approved', so leaving it unset let every new place skip the review queue
  -- entirely: one collection run could put an unvetted place one publish toggle
  -- away from going live. Insert it as a candidate and leave an existing row's
  -- status alone so a re-sync never undoes an operator's decision.
  insert into core.place_sources (place_id, kto_content_id, kto_content_type_id, sync_enabled, ingestion_status)
  values (v_place_id, p_content_id, p_content_type_id, true, 'candidate')
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
