-- ================================================================
-- 004_core_local_spots.sql
-- 로컬 스팟 (카페·음식점·디저트 등) 및 연관 테이블
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- core.local_spots | 로컬 스팟
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.local_spots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  spot_type       text NOT NULL,  -- 'cafe' | 'restaurant' | 'dessert' | 'shop' | 'other'
  summary         text,
  lat             numeric(10,7),
  lng             numeric(10,7),
  walking_minutes int,
  pet_friendly    bool DEFAULT false,
  is_active       bool DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_local_spots_is_active  ON core.local_spots (is_active);

CREATE INDEX idx_local_spots_spot_type  ON core.local_spots (spot_type);

-- ────────────────────────────────────────────────────────────────
-- core.local_spot_links | 로컬 스팟 외부 링크
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.local_spot_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_spot_id   uuid NOT NULL REFERENCES core.local_spots (id) ON DELETE CASCADE,
  link_label      text NOT NULL,
  link_url        text NOT NULL,
  display_order   int DEFAULT 0
);

CREATE INDEX idx_local_spot_links_local_spot_id ON core.local_spot_links (local_spot_id);

-- ────────────────────────────────────────────────────────────────
-- core.place_local_spots | 관광지 ↔ 로컬 스팟 연결 (N:M)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.place_local_spots (
  place_id      uuid NOT NULL REFERENCES core.places (id) ON DELETE CASCADE,
  local_spot_id uuid NOT NULL REFERENCES core.local_spots (id) ON DELETE CASCADE,
  PRIMARY KEY (place_id, local_spot_id)
);

CREATE INDEX idx_place_local_spots_place_id ON core.place_local_spots (place_id);
