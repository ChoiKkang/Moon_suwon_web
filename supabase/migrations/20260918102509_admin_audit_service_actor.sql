begin;

create or replace function public.admin_record_audit(
  p_actor_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
volatile
set search_path = pg_catalog, public, audit
as $$
declare
  v_id uuid;
begin
  if p_actor_id is null or not exists (
    select 1 from public.profiles
    where id = p_actor_id and upper(role) = 'ADMIN'
  ) then
    raise exception 'authenticated admin actor is required';
  end if;

  insert into audit.admin_events(actor_id, entity_type, entity_id, action, metadata)
  values (
    p_actor_id,
    left(pg_catalog.btrim(coalesce(p_entity_type, '')), 80),
    p_entity_id,
    left(pg_catalog.btrim(coalesce(p_action, '')), 120),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.admin_record_audit(uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_record_audit(uuid, text, uuid, text, jsonb) to service_role;

commit;
