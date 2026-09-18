begin;

create index if not exists idx_admin_events_actor_id on audit.admin_events(actor_id, created_at desc);

commit;
