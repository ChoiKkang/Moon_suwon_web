-- ================================================================
-- 002_core_places.sql
-- 관광지 마스터 및 연관 테이블
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- core.places | 관광지 마스터
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.places (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  text NOT NULL UNIQUE,
  official_name         text NOT NULL,
  address_full          text,
  lat                   numeric(10,7) NOT NULL,
  lng                   numeric(10,7) NOT NULL,
  contact_phone         text,
  source_overview_raw   text,
  short_description     text,
  recommended_stay_min  int DEFAULT 30,
  category              text,
  is_active             bool DEFAULT true,
  source_modified_at    timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_places_is_active ON core.places (is_active);

CREATE INDEX idx_places_category ON core.places (category);

-- ────────────────────────────────────────────────────────────────
-- core.place_sources | KTO 원본 ID 매핑 (Phase 2 데이터 적재 예정)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.place_sources (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id              uuid NOT NULL UNIQUE REFERENCES core.places (id) ON DELETE CASCADE,
  kto_content_id        text NOT NULL UNIQUE,
  kto_content_type_id   text NOT NULL,
  sync_enabled          bool DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────
-- core.place_images | 스팟 이미지 목록
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.place_images (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id      uuid NOT NULL REFERENCES core.places (id) ON DELETE CASCADE,
  image_url     text NOT NULL,
  is_hero       bool DEFAULT false,
  display_order int DEFAULT 0,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_place_images_place_id ON core.place_images (place_id);

CREATE INDEX idx_place_images_is_hero  ON core.place_images (place_id, is_hero);

-- ────────────────────────────────────────────────────────────────
-- core.place_pet_policies | 반려동물 동반 정책 (MVP 앱 미노출)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE core.place_pet_policies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id       uuid NOT NULL UNIQUE REFERENCES core.places (id) ON DELETE CASCADE,
  pet_policy     text NOT NULL,
  pet_note_raw   text,
  pet_note_short text,
  updated_at     timestamptz DEFAULT now()
);
