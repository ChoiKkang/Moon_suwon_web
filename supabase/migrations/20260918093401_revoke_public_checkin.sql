begin;

revoke execute on function public.checkin_place(uuid, uuid, numeric, numeric, text) from public, anon;
grant execute on function public.checkin_place(uuid, uuid, numeric, numeric, text) to authenticated, service_role;

commit;
