begin;

grant select (
  place_id,
  forecast_date,
  forecast_score,
  crowd_level,
  source_updated_at
) on table core.place_crowd_forecasts to anon, authenticated;

drop policy if exists place_crowd_forecasts_public_published on core.place_crowd_forecasts;
create policy place_crowd_forecasts_public_published
on core.place_crowd_forecasts
for select
to anon, authenticated
using (public.is_published_place(place_id));

commit;
