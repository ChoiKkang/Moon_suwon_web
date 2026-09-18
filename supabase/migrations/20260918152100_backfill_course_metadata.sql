begin;

update core.courses
set automation_metadata = jsonb_build_object(
  'schema_version', 1,
  'automation_source', automation_source,
  'automation_key', automation_key,
  'provider', 'legacy-deterministic',
  'model', null,
  'prompt_version', null,
  'input_checksum', null,
  'distance_kind', 'straight_line_estimate',
  'evidence', '[]'::jsonb,
  'constraint_violations', '[]'::jsonb
)
where automation_source is not null
  and (automation_metadata = '{}'::jsonb or automation_metadata is null);

commit;

