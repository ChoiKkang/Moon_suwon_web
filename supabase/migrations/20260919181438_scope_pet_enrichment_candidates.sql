-- KorPetTourService2/detailPetTour2 only has rows for IDs discovered by
-- KorPetTourService2/petTourSyncList2. General KorService2 content IDs return
-- a valid empty response, so exclude them from the recurring detail queue.

create or replace function public.sync_list_pet_enrichment(p_limit integer default 250)
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
         coalesce(pp.data_status, 'unknown'),
         coalesce(pps.is_published, false)
  from core.places p
  join core.place_sources ps on ps.place_id = p.id
  left join core.place_pet_policies pp on pp.place_id = p.id
  left join editorial.place_publish_state pps on pps.place_id = p.id
  where p.is_active = true
    and coalesce(ps.sync_enabled, true) = true
    and ps.ingestion_status in ('candidate', 'approved', 'stale')
    and exists (
      select 1
      from raw.kto_pet_candidates pc
      where pc.content_id = ps.kto_content_id
    )
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
  limit greatest(0, least(coalesce(p_limit, 250), 1000));
$$;

revoke all on function public.sync_list_pet_enrichment(integer) from public, anon, authenticated;
grant execute on function public.sync_list_pet_enrichment(integer) to service_role;
