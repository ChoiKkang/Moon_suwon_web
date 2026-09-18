begin;

grant select (id) on table core.place_crowd_forecasts to anon, authenticated;

commit;
