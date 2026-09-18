begin;

create schema if not exists audit;

create table if not exists audit.admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (length(btrim(entity_type)) between 1 and 80),
  check (length(btrim(action)) between 1 and 120)
);

alter table audit.admin_events enable row level security;
create index if not exists idx_admin_events_entity on audit.admin_events(entity_type, entity_id, created_at desc);
create index if not exists idx_admin_events_created_at on audit.admin_events(created_at desc);

grant usage on schema audit to service_role;
grant select, insert on audit.admin_events to service_role;
revoke all on schema audit from public, anon, authenticated;
revoke all on table audit.admin_events from public, anon, authenticated;

create or replace function public.admin_record_audit(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
set search_path = pg_catalog
as $$
declare
  v_id uuid;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authenticated admin actor is required';
  end if;

  insert into audit.admin_events(actor_id, entity_type, entity_id, action, metadata)
  values (
    v_actor,
    left(pg_catalog.btrim(coalesce(p_entity_type, '')), 80),
    p_entity_id,
    left(pg_catalog.btrim(coalesce(p_action, '')), 120),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_record_audit(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_record_audit(text, uuid, text, jsonb) to service_role;

commit;
