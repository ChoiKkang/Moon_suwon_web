-- The admin console reads audit history to show who last reviewed a candidate.
-- audit.admin_events is deliberately NOT exposed through PostgREST, so a
-- client call to schema('audit') fails with "Invalid schema: audit" and the
-- review detail silently loses its provenance.
--
-- Keep the schema unexposed and read it through a security-definer function in
-- the public schema instead. Only service_role may execute it, matching
-- public.admin_record_audit which already writes the same table.
begin;

create or replace function public.admin_list_audit_events(
  p_entity_id uuid default null,
  p_entity_type text default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  actor_id uuid,
  entity_type text,
  entity_id uuid,
  action text,
  metadata jsonb,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = pg_catalog, public, audit
as $$
  select e.id, e.actor_id, e.entity_type, e.entity_id, e.action, e.metadata, e.created_at
  from audit.admin_events e
  where (p_entity_id is null or e.entity_id = p_entity_id)
    and (p_entity_type is null or e.entity_type = p_entity_type)
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 200);
$$;

revoke all on function public.admin_list_audit_events(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.admin_list_audit_events(uuid, text, integer) to service_role;

commit;
