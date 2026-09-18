-- Store deterministic course provenance separately from public copy.
-- The mobile/public contracts remain unchanged; only service-role admin code
-- can read or write this metadata.

begin;

alter table core.courses
  add column if not exists automation_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_courses_automation_metadata_source
  on core.courses ((automation_metadata ->> 'automation_source'), (automation_metadata ->> 'automation_key'));

create table if not exists raw.course_generation_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null check (status in ('running', 'completed', 'partial', 'failed')),
  model text,
  prompt_version text,
  input_checksum text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table raw.course_generation_runs enable row level security;
create index if not exists idx_course_generation_runs_started_at
  on raw.course_generation_runs(started_at desc);

grant select, insert, update on raw.course_generation_runs to service_role;
revoke all on raw.course_generation_runs from public, anon, authenticated;

-- Keep the metadata shape bounded and redactable. Internal prompts/model output
-- are intentionally not copied into public views or RPC payloads.
alter table core.courses
  drop constraint if exists courses_automation_metadata_object_check;
alter table core.courses
  add constraint courses_automation_metadata_object_check
  check (jsonb_typeof(automation_metadata) = 'object');

grant select, update on core.courses to service_role;

commit;

