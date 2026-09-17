-- Keep event records reproducible for new environments and expose only the
-- fields needed by the public promotion site. The source table remains
-- service-role-only; the curated view is the public read boundary.
create table if not exists core.events (
  id uuid primary key default gen_random_uuid(),
  event_content_id text not null unique,
  event_name text not null,
  start_date date not null,
  end_date date not null,
  venue_address text,
  lat numeric(10,7),
  lng numeric(10,7),
  hero_image_url text,
  contact_phone text,
  event_place text,
  play_time text,
  usage_fee text,
  program_raw text,
  source_modified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table core.events add column if not exists event_content_id text;
alter table core.events add column if not exists event_name text;
alter table core.events add column if not exists start_date date;
alter table core.events add column if not exists end_date date;
alter table core.events add column if not exists venue_address text;
alter table core.events add column if not exists lat numeric(10,7);
alter table core.events add column if not exists lng numeric(10,7);
alter table core.events add column if not exists hero_image_url text;
alter table core.events add column if not exists contact_phone text;
alter table core.events add column if not exists event_place text;
alter table core.events add column if not exists play_time text;
alter table core.events add column if not exists usage_fee text;
alter table core.events add column if not exists program_raw text;
alter table core.events add column if not exists source_modified_at timestamptz;
alter table core.events add column if not exists created_at timestamptz default now();
alter table core.events add column if not exists updated_at timestamptz default now();

create index if not exists idx_events_public_dates on core.events(start_date, end_date);

alter table core.events enable row level security;
revoke all on table core.events from anon, authenticated;
grant usage on schema core to service_role;
grant select, insert, update, delete on table core.events to service_role;

create or replace view public.v_upcoming_events as
select
  id,
  event_content_id,
  event_name,
  start_date,
  end_date,
  venue_address,
  event_place,
  play_time,
  usage_fee,
  hero_image_url
from core.events
where end_date >= current_date
order by start_date asc, event_name asc;

grant select on public.v_upcoming_events to anon, authenticated;
