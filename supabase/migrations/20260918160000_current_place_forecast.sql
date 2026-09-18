-- Place-facing views and RPCs previously selected the crowd forecast with
-- "order by forecast_date desc limit 1", which returns the furthest future
-- forecast rather than today's. core.place_crowd_forecasts holds roughly two
-- months of daily rows, so published spots advertised a forecast up to a month
-- ahead while public.v_now_good_spot_candidates filtered on today's date. The
-- two surfaces disagreed for the same place.
--
-- core.current_place_forecast(place_id) centralizes the selection: prefer the
-- Seoul-local current date, otherwise fall back to the nearest upcoming date so
-- a late sync still serves a sensible value instead of a stale past one.

create or replace function core.current_place_forecast(p_place_id uuid)
returns table (
  id uuid,
  forecast_date date,
  forecast_score numeric,
  crowd_level text,
  source_updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select f.id, f.forecast_date, f.forecast_score, f.crowd_level, f.source_updated_at
  from core.place_crowd_forecasts f
  where f.place_id = p_place_id
  order by
    (f.forecast_date = ((current_timestamp at time zone 'Asia/Seoul')::date)) desc,
    (f.forecast_date >= ((current_timestamp at time zone 'Asia/Seoul')::date)) desc,
    case
      when f.forecast_date >= ((current_timestamp at time zone 'Asia/Seoul')::date)
        then f.forecast_date
    end asc nulls last,
    f.forecast_date desc,
    f.source_updated_at desc nulls last
  limit 1;
$$;

revoke all on function core.current_place_forecast(uuid) from public;
grant execute on function core.current_place_forecast(uuid) to anon, authenticated, service_role;
