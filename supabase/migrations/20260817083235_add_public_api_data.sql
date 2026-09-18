CREATE SCHEMA IF NOT EXISTS raw;

REVOKE ALL ON SCHEMA raw FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA raw TO service_role;

CREATE TABLE raw.kto_kor_content (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_endpoint  text NOT NULL,
  content_id       text NOT NULL,
  content_type_id  text,
  payload_json     jsonb NOT NULL,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_endpoint, content_id)
);

CREATE TABLE raw.kto_kor_images (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_endpoint  text NOT NULL,
  content_id       text NOT NULL,
  image_url         text NOT NULL,
  payload_json     jsonb NOT NULL,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_endpoint, content_id, image_url)
);

CREATE TABLE raw.kto_pet_tour (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_endpoint  text NOT NULL,
  content_id       text NOT NULL,
  payload_json     jsonb NOT NULL,
  fetched_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_endpoint, content_id)
);

CREATE TABLE raw.kto_crowd_forecast (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_code                text NOT NULL,
  sigungu_code             text NOT NULL,
  tourist_attraction_name  text NOT NULL,
  forecast_date            date NOT NULL,
  concentration_rate       numeric NOT NULL,
  payload_json             jsonb NOT NULL,
  fetched_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    area_code,
    sigungu_code,
    tourist_attraction_name,
    forecast_date
  )
);

CREATE TABLE raw.sync_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text NOT NULL,
  status         text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  items_fetched  int NOT NULL DEFAULT 0,
  items_upserted int NOT NULL DEFAULT 0,
  error_count    int NOT NULL DEFAULT 0,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at     timestamptz NOT NULL DEFAULT now(),
  completed_at   timestamptz
);

CREATE TABLE raw.sync_errors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id uuid NOT NULL REFERENCES raw.sync_runs (id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  content_id  text,
  error_code  text,
  message     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE raw.kto_kor_content      ENABLE ROW LEVEL SECURITY;

ALTER TABLE raw.kto_kor_images       ENABLE ROW LEVEL SECURITY;

ALTER TABLE raw.kto_pet_tour         ENABLE ROW LEVEL SECURITY;

ALTER TABLE raw.kto_crowd_forecast   ENABLE ROW LEVEL SECURITY;

ALTER TABLE raw.sync_runs            ENABLE ROW LEVEL SECURITY;

ALTER TABLE raw.sync_errors          ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA raw TO service_role;

CREATE TABLE core.place_crowd_forecasts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id          uuid NOT NULL REFERENCES core.places (id) ON DELETE CASCADE,
  forecast_date     date NOT NULL,
  forecast_score    numeric NOT NULL,
  crowd_level       text NOT NULL CHECK (crowd_level IN ('여유', '보통', '혼잡')),
  source_updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (place_id, forecast_date)
);

CREATE INDEX idx_place_crowd_forecasts_place_date
  ON core.place_crowd_forecasts (place_id, forecast_date);

CREATE TABLE core.events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_content_id   text NOT NULL UNIQUE,
  event_name         text NOT NULL,
  start_date         date NOT NULL,
  end_date           date NOT NULL,
  venue_address      text,
  lat                numeric(10,7),
  lng                numeric(10,7),
  hero_image_url     text,
  contact_phone      text,
  event_place        text,
  play_time          text,
  usage_fee          text,
  program_raw        text,
  source_modified_at timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE core.place_crowd_forecasts ENABLE ROW LEVEL SECURITY;

ALTER TABLE core.events                 ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON core.place_crowd_forecasts, core.events TO anon, authenticated;

CREATE POLICY "place_crowd_forecasts_select"
  ON core.place_crowd_forecasts FOR SELECT USING (true);

CREATE POLICY "place_crowd_forecasts_admin_all"
  ON core.place_crowd_forecasts FOR ALL USING (public.is_admin());

CREATE POLICY "events_select"
  ON core.events FOR SELECT USING (true);

CREATE POLICY "events_admin_all"
  ON core.events FOR ALL USING (public.is_admin());
