-- The admin server uses Supabase's service-role REST client for the internal
-- core/editorial/raw schemas.  PostgREST still rejects an unexposed schema
-- before it evaluates service-role privileges, so keep these schemas in the
-- API schema cache while limiting table access below.
alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, serving, core, editorial, raw';
notify pgrst, 'reload config';

grant usage on schema core, editorial, raw to service_role;
grant select, insert, update, delete on all tables in schema core to service_role;
grant select, insert, update, delete on all tables in schema editorial to service_role;
grant select, insert, update, delete on all tables in schema raw to service_role;
grant usage, select on all sequences in schema core to service_role;
grant usage, select on all sequences in schema editorial to service_role;
grant usage, select on all sequences in schema raw to service_role;

alter default privileges for role postgres in schema core
  grant all on tables to service_role;
alter default privileges for role postgres in schema editorial
  grant all on tables to service_role;
alter default privileges for role postgres in schema raw
  grant all on tables to service_role;
alter default privileges for role postgres in schema core
  grant all on sequences to service_role;
alter default privileges for role postgres in schema editorial
  grant all on sequences to service_role;
alter default privileges for role postgres in schema raw
  grant all on sequences to service_role;

-- These tables are consumed through the curated serving views, not directly
-- by the browser.  Keep only the active-place policies needed by
-- serving.v_imported_places and remove broad direct-read access before the
-- internal schemas become reachable through PostgREST.
revoke all on table
  core.courses,
  core.course_places,
  core.events,
  core.local_spot_links,
  core.local_spots,
  core.place_local_spots,
  core.place_pet_policies,
  core.place_crowd_forecasts,
  core.user_course_progress,
  core.user_favorites,
  core.user_place_checkins
from anon, authenticated;

revoke all on table
  editorial.course_copy,
  editorial.course_publish_state,
  editorial.place_publish_state
from anon, authenticated;

revoke all on all tables in schema raw from anon, authenticated;

drop policy if exists "places_select" on core.places;
drop policy if exists "place_sources_select" on core.place_sources;
drop policy if exists "place_images_select" on core.place_images;
drop policy if exists "place_copy_select" on editorial.place_copy;
