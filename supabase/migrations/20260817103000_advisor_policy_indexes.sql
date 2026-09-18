CREATE INDEX IF NOT EXISTS idx_sync_errors_sync_run_id
  ON raw.sync_errors (sync_run_id);

DROP POLICY IF EXISTS place_crowd_forecasts_admin_all
  ON core.place_crowd_forecasts;

DROP POLICY IF EXISTS events_admin_all
  ON core.events;
