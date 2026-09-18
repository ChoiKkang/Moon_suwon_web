-- Pin application function search paths.  The PostGIS-owned
-- spatial_ref_sys table cannot be altered by the project owner, so its
-- extension-managed advisor notice is intentionally left unchanged.

begin;

alter function editorial.fn_create_place_publish_state() set search_path = pg_catalog, editorial;
alter function editorial.fn_create_course_publish_state() set search_path = pg_catalog, editorial;
alter function public.is_admin() set search_path = pg_catalog, public;
alter function public.checkin_place(uuid, uuid, numeric, numeric, text) set search_path = pg_catalog, public;

revoke execute on function public.abandon_course_progress(uuid) from anon;
revoke execute on function public.checkin_place(uuid, uuid, numeric, numeric, text) from anon;
revoke execute on function public.complete_course_progress(uuid) from anon;
revoke execute on function public.delete_own_account() from anon;
revoke execute on function public.get_active_course_progress(uuid) from anon;
revoke execute on function public.list_user_course_history(integer) from anon;
revoke execute on function public.start_course_progress(uuid) from anon;

commit;
