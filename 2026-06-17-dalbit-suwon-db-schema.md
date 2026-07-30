# 달빛수원 DB 스키마 설계

**문서 목적:** MVP 기획 문서와 서비스 플로우 기반으로 앱·공개웹·운영웹 3채널을 지원하는 Supabase PostgreSQL 스키마를 설계한다.  
**문서 상태:** Draft v1  
**작성일:** 2026-06-17  
**연계 문서:** [달빛수원 MVP 기획 문서](./2026-05-25-dalbit-suwon-mvp-design.md), [달빛수원 서비스 플로우 기획 문서](./2026-05-25-dalbit-suwon-service-flow.md)

---

## 현재 상태

- `public.profiles` 테이블 1개만 존재 (id/email/nickname/avatar_url/provider/role)
- 마이그레이션 파일 없음, `supabase/` 폴더 없음
- Supabase 프로젝트 ref: `feifvxhltehhsugizrob`

---

## 스키마 분리 구조

```
raw       공공 API 원본 JSON 저장 (Phase 2)
core      정규화된 서비스 기준 데이터 + 사용자 활동 데이터
editorial 운영자가 직접 작성하는 문구와 큐레이션
serving   앱/웹이 읽는 View와 RPC
public    기존 profiles 테이블 유지
```

핵심 원칙:
- 앱·웹은 `serving` 계층만 읽음 (core/editorial 직접 접근 금지)
- 운영자 편집 데이터는 `editorial` 스키마에 별도 보관
- 백오피스는 서버 액션(`service_role` key)으로 core/editorial 직접 수정

---

## 마이그레이션 파일 구조

`supabase/migrations/` 아래 번호순으로 관리:

```
001_create_schemas.sql       스키마 생성 (core/editorial/serving)
002_core_places.sql          관광지 마스터 및 연관 테이블
003_core_courses.sql         코스 및 코스-스팟 연결
004_core_local_spots.sql     로컬 스팟 (카페 등)
005_core_user_activity.sql   사용자 진행 기록 및 찜
006_editorial_tables.sql     운영자 편집 문구
007_serving_views.sql        앱/웹용 View
008_rls_policies.sql         Row Level Security 정책
009_functions_rpc.sql        RPC 함수 (체크인 판정, 인근 스팟 등)
```

---

## 1. core 스키마

### 관광지 (places)

```sql
-- ────────────────────────────────────────────────────────────
-- core.places | 관광지 마스터
-- 수원화성 관광지의 정규화된 기준 데이터.
-- 공공데이터(KTO)에서 정제해 저장. 사용자 노출 문구(야간 포인트,
-- 포토팁 등)는 editorial.place_copy에서 별도 관리.
-- ────────────────────────────────────────────────────────────
core.places (
  id                    uuid PK default gen_random_uuid(),
                        -- 내부 고유 식별자 (UUID v4 자동 생성)
  slug                  text NOT NULL UNIQUE,
                        -- 웹 URL 경로용 식별자
                        -- 예: 'banghwasuryujeong' → /places/banghwasuryujeong
  official_name         text NOT NULL,
                        -- 공공데이터 원본 관광지명. 절대 수정하지 않고 보존
  address_full          text,
                        -- 공공데이터 addr1 + addr2 조합 전체 주소
  lat                   numeric(10,7) NOT NULL,
                        -- 위도 (WGS84 기준). 예: 37.2870000
                        -- 체크인 반경 판정 및 카카오맵 딥링크에 사용
  lng                   numeric(10,7) NOT NULL,
                        -- 경도 (WGS84 기준). 예: 127.0175000
  contact_phone         text,
                        -- 관광지 연락처 (공공데이터 tel 필드)
  source_overview_raw   text,
                        -- 공공데이터 원문 개요. 가공 없이 그대로 보존.
                        -- 운영자가 short_description 작성 시 참고용
  short_description     text,
                        -- 앱/웹에 노출하는 한 줄 소개.
                        -- 운영자가 source_overview_raw 참고해 직접 작성
  recommended_stay_min  int default 30,
                        -- 이 스팟의 권장 체류 시간(분).
                        -- 코스 전체 예상 소요시간 합산에 사용
  category              text,
                        -- 관광지 성격 분류 태그.
                        -- 'heritage-night-view' / 'local-cafe' / 'park' 등
  is_active             bool default true,
                        -- false면 모든 serving view에서 자동 제외.
                        -- 폐쇄·공사·임시 운영 중단 시 사용
  source_modified_at    timestamptz,
                        -- KTO API의 modifiedtime 필드.
                        -- 저장값과 달라지면 재동기화 대상으로 판단
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
)
-- display_name    → editorial.place_copy.display_name 에서 관리
-- mission_radius_m → editorial.place_copy.mission_radius_m 에서 관리
-- hero_image_url  → core.place_images WHERE is_hero=true 로 단일화 (places 컬럼 제거)
-- thumbnail_url   → core.place_images WHERE is_hero=true 동일 row 사용

-- ────────────────────────────────────────────────────────────
-- core.place_sources | KTO 원본 ID 매핑
-- 관광지와 한국관광공사 API의 contentId를 연결.
-- 공공데이터 재동기화 시 어떤 ID로 API를 호출할지 기록.
-- Phase 1: 테이블 생성만 (데이터 없음). Phase 2: 공공 API 연동 시 데이터 적재.
-- ────────────────────────────────────────────────────────────
core.place_sources (
  id                    uuid PK default gen_random_uuid(),
  place_id              uuid NOT NULL FK -> core.places UNIQUE,
                        -- 연결된 관광지. 관광지 1개당 소스 1개
  kto_content_id        text NOT NULL UNIQUE,
                        -- KTO가 각 관광지에 부여한 고유 번호.
                        -- 상세정보·이미지·반려동물 API 호출 시 이 ID 사용
  kto_content_type_id   text NOT NULL,
                        -- 관광지 유형 코드.
                        -- 12=관광지 / 14=문화시설 / 38=스포츠 / 39=음식점
  sync_enabled          bool default true,
                        -- false면 정기 동기화에서 이 스팟 제외.
                        -- API 누락되거나 직접 관리하는 스팟에 사용
  created_at            timestamptz default now()
)

-- ────────────────────────────────────────────────────────────
-- core.place_images | 스팟 이미지 목록
-- 관광지별 이미지를 여러 장 관리.
-- is_hero=true인 이미지가 상세 화면 대표 이미지.
-- ────────────────────────────────────────────────────────────
core.place_images (
  id            uuid PK default gen_random_uuid(),
  place_id      uuid NOT NULL FK -> core.places,
                -- 이미지가 속한 관광지
  image_url     text NOT NULL,
                -- 이미지 URL (Supabase Storage 또는 KTO CDN)
  is_hero       bool default false,
                -- true면 대표 이미지. place당 1개만 true여야 함
  display_order int default 0,
                -- 갤러리 노출 순서. 낮을수록 먼저 표시
  created_at    timestamptz default now()
)

-- ────────────────────────────────────────────────────────────
-- core.place_pet_policies | 반려동물 동반 정책
-- MVP에서는 앱 UI 미노출. 향후 반려동물 서브코스 출시 시 활용.
-- 데이터 구조만 선반영.
-- ────────────────────────────────────────────────────────────
core.place_pet_policies (
  id             uuid PK default gen_random_uuid(),
  place_id       uuid NOT NULL FK -> core.places UNIQUE,
                 -- 연결된 관광지. place당 정책 1개
  pet_policy     text NOT NULL,
                 -- 정규화된 정책 상태값:
                 -- 'allowed'=전면 허용 / 'partial'=조건부 허용
                 -- 'restricted'=금지 / 'unknown'=정보 없음
  pet_note_raw   text,
                 -- 공공데이터 원문 그대로 보존
  pet_note_short text,
                 -- 사용자 노출용 짧은 요약.
                 -- 예: "실외 가능, 혼잡 시간 리드줄 권장"
  updated_at     timestamptz default now()
)
```

### 코스 (courses)

```sql
-- ────────────────────────────────────────────────────────────
-- core.courses | 야간 데이트 코스 정의
-- 앱에서 제공하는 코스의 기본 구조 데이터.
-- 노출 문구와 공개 여부는 editorial.course_copy /
-- editorial.course_publish_state에서 관리.
-- ────────────────────────────────────────────────────────────
core.courses (
  id                      uuid PK default gen_random_uuid(),
  slug                    text NOT NULL UNIQUE,
                          -- URL 경로용 식별자.
                          -- 예: 'night-photo-01' → /courses/night-photo-01
  theme_tags              text[] default '{}',
                          -- 코스 성격 태그 배열.
                          -- 예: ['date', 'photo', 'night', 'pet']
  estimated_duration_min  int NOT NULL,
                          -- 코스 전체 예상 소요시간(분).
                          -- course_places의 각 place.recommended_stay_min 합산 기준
  walking_distance_km     numeric(5,2),
                          -- 코스 전체 도보 이동 거리(km).
                          -- 스팟 간 이동 거리 합산값
  recommended_start_time  text,
                          -- 권장 시작 시간대. 예: '19:00-20:00'
                          -- 야경이 가장 좋은 시간대 기준으로 운영자 설정
  pet_ready_flag          bool default false,
                          -- true면 반려동물 동반 가능 코스.
                          -- MVP에서는 모두 false. 향후 반려동물 서브코스에 사용
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
)
-- is_published / display_priority → editorial.course_publish_state 에서 관리

-- ────────────────────────────────────────────────────────────
-- core.course_places | 코스 내 스팟 순서
-- 코스를 구성하는 스팟 목록과 방문 순서.
-- 같은 스팟이 여러 코스에 포함될 수 있음 (N:M).
-- ────────────────────────────────────────────────────────────
core.course_places (
  id          uuid PK default gen_random_uuid(),
  course_id   uuid NOT NULL FK -> core.courses,
              -- 소속 코스
  place_id    uuid NOT NULL FK -> core.places,
              -- 방문할 관광지
  order_index int NOT NULL,
              -- 코스 내 방문 순서. 1부터 시작.
              -- 앱 진행 화면에서 "2/5번째 스팟" 계산에 사용
  UNIQUE(course_id, order_index),  -- 같은 코스에서 순서 중복 불가
  UNIQUE(course_id, place_id)      -- 같은 코스에 같은 스팟 중복 불가
)
```

### 로컬 스팟

```sql
-- ────────────────────────────────────────────────────────────
-- core.local_spots | 로컬 스팟 (카페·음식점·디저트 등)
-- 코스 스팟 근처의 상권 정보. 스팟 상세 화면 하단 "주변 로컬 스팟"
-- 섹션에 노출. 코스 마무리 또는 중간 쉬어가기 동선 제안용.
-- ────────────────────────────────────────────────────────────
core.local_spots (
  id                uuid PK default gen_random_uuid(),
  name              text NOT NULL,
                    -- 가게·장소 이름. 예: '행리단길 카페 OO'
  spot_type         text NOT NULL,
                    -- 업종 분류:
                    -- 'cafe' / 'restaurant' / 'dessert' / 'shop' / 'other'
  summary           text,
                    -- 한 줄 소개. 예: "코스 마무리 후 들르기 좋은 디저트 카페"
  lat               numeric(10,7),
                    -- 위도. 카카오맵/네이버맵 딥링크 정확한 위치 이동에 사용
  lng               numeric(10,7),
                    -- 경도
  walking_minutes   int,
                    -- 연결된 관광지에서 도보 소요 시간(분).
                    -- place_local_spots로 연결된 관광지 기준
  pet_friendly      bool default false,
                    -- true면 반려동물 동반 가능. MVP 비노출이지만 데이터 선반영
  is_active         bool default true,
                    -- false면 모든 노출에서 제외. 폐업·임시 중단 시 사용
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
)
-- nearest_place_id 제거 → 관광지 연결은 place_local_spots N:M 테이블만 사용

-- ────────────────────────────────────────────────────────────
-- core.local_spot_links | 로컬 스팟 외부 링크
-- 카카오맵, 네이버 플레이스, 인스타그램 등 외부 링크 목록.
-- 앱에서 "자세히 보기" 버튼으로 외부 앱/브라우저 연결.
-- ────────────────────────────────────────────────────────────
core.local_spot_links (
  id              uuid PK default gen_random_uuid(),
  local_spot_id   uuid NOT NULL FK -> core.local_spots,
                  -- 연결된 로컬 스팟
  link_label      text NOT NULL,
                  -- 버튼에 표시할 텍스트. 예: '카카오맵', '네이버 플레이스'
  link_url        text NOT NULL,
                  -- 외부 링크 URL
  display_order   int default 0
                  -- 링크 버튼 노출 순서. 낮을수록 먼저
)

-- ────────────────────────────────────────────────────────────
-- core.place_local_spots | 관광지 ↔ 로컬 스팟 연결 (N:M)
-- 특정 관광지 상세 화면에서 어떤 로컬 스팟을 추천할지 연결.
-- 하나의 로컬 스팟이 여러 관광지에 연결될 수 있고,
-- 하나의 관광지에 여러 로컬 스팟이 연결될 수 있음.
-- ────────────────────────────────────────────────────────────
core.place_local_spots (
  place_id        uuid NOT NULL FK -> core.places,
                  -- 관광지 스팟
  local_spot_id   uuid NOT NULL FK -> core.local_spots,
                  -- 추천할 로컬 스팟
  PRIMARY KEY (place_id, local_spot_id)
)
```

### 사용자 활동

```sql
-- ────────────────────────────────────────────────────────────
-- core.user_course_progress | 코스 진행 기록
-- 로그인 사용자의 코스 시작·완료 상태 저장.
-- 비회원은 앱 로컬(SharedPreferences)에만 저장.
-- UNIQUE(user_id, course_id) 제약 없음 → 코스 완료 후 재시작,
-- 포기 후 재진행 허용.
-- ────────────────────────────────────────────────────────────
core.user_course_progress (
  id            uuid PK default gen_random_uuid(),
  user_id       uuid NOT NULL FK -> auth.users,
                -- 진행 중인 로그인 사용자
  course_id     uuid NOT NULL FK -> core.courses,
                -- 진행 중인 코스
  status        text NOT NULL default 'in_progress',
                -- 진행 상태:
                -- 'in_progress' = 코스 시작 후 진행 중
                -- 'completed'   = 마지막 스팟까지 체크인 완료
                -- 'abandoned'   = 중도 포기 (재시작 시 이전 row를 이 상태로 변경)
  started_at    timestamptz default now(),
                -- 코스 시작 시각
  completed_at  timestamptz,
                -- 코스 완료 시각. 완료 전까지 null
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
)

-- ────────────────────────────────────────────────────────────
-- core.user_place_checkins | 스팟 체크인 기록
-- 코스 진행 중 각 스팟 도착을 확인한 기록.
-- 자동(GPS 반경 감지)과 수동(직접 체크하기) 방식을 구분해 저장.
-- ────────────────────────────────────────────────────────────
core.user_place_checkins (
  id            uuid PK default gen_random_uuid(),
  progress_id   uuid NOT NULL FK -> core.user_course_progress,
                -- 어느 코스 진행 세션의 체크인인지
  place_id      uuid NOT NULL FK -> core.places,
                -- 체크인한 관광지 스팟
  check_mode    text NOT NULL,
                -- 체크인 방식:
                -- 'auto'   = GPS 반경 진입 자동 감지
                -- 'manual' = 사용자가 직접 체크하기 버튼 누름
  lat_at_check  numeric(10,7),
                -- 체크인 당시 사용자 위도.
                -- 나중에 반경 기준 조정 시 실제 거리 분석 데이터로 활용
  lng_at_check  numeric(10,7),
                -- 체크인 당시 사용자 경도
  checked_at    timestamptz default now(),
                -- 체크인 완료 시각
  UNIQUE(progress_id, place_id)  -- 같은 진행 세션에서 같은 스팟 중복 체크인 방지
)

-- ────────────────────────────────────────────────────────────
-- core.user_favorites | 찜 목록
-- 로그인 사용자의 코스·스팟 저장 목록.
-- MVP에서는 비회원 찜을 앱 로컬(SharedPreferences)에 저장.
-- 로그인 후 이 테이블로 동기화 (확장 단계).
-- ────────────────────────────────────────────────────────────
core.user_favorites (
  id          uuid PK default gen_random_uuid(),
  user_id     uuid NOT NULL FK -> auth.users,
              -- 찜한 사용자
  target_type text NOT NULL check (target_type in ('course', 'spot')),
              -- 찜 대상 유형: 'course' 또는 'spot'
  course_id   uuid FK -> core.courses,
              -- target_type='course'일 때만 값. 나머지는 NULL
  place_id    uuid FK -> core.places,
              -- target_type='spot'일 때만 값. 나머지는 NULL
  created_at  timestamptz default now(),
  CHECK (
    -- course_id와 place_id 중 정확히 하나만 NOT NULL이어야 함
    (target_type = 'course' AND course_id IS NOT NULL AND place_id IS NULL) OR
    (target_type = 'spot'   AND place_id  IS NOT NULL AND course_id IS NULL)
  ),
  UNIQUE(user_id, course_id),  -- 같은 코스를 중복 찜 방지
  UNIQUE(user_id, place_id)    -- 같은 스팟을 중복 찜 방지
)
```

---

## 2. editorial 스키마

운영자가 직접 작성하는 문구와 노출 설정. 운영 웹에서만 수정 가능.
공공데이터에는 없는 서비스 핵심 콘텐츠(야간 포인트, 포토팁, 미션 문구 등)를 담는 계층.

```sql
-- ────────────────────────────────────────────────────────────
-- editorial.place_copy | 스팟 기획 문구
-- 야간 포인트, 포토팁, 미션, 커플 질문 등 운영자가 직접 작성.
-- 공공데이터에 없는 서비스 핵심 가치이며, place당 1행.
-- ────────────────────────────────────────────────────────────
editorial.place_copy (
  id                uuid PK default gen_random_uuid(),
  place_id          uuid NOT NULL FK -> core.places UNIQUE,
                    -- 연결된 관광지. place당 문구 1세트
  display_name      text,
                    -- 앱/웹에 노출할 관광지 이름.
                    -- NULL이면 core.places.official_name 사용
  mission_radius_m  int default 80,
                    -- 이 스팟의 체크인 인정 반경(미터).
                    -- 성벽 인접: 100~120m / 개방 공간: 80m / 골목: 60m
  night_highlight   text,
                    -- 야간에만 볼 수 있는 포인트 설명.
                    -- 예: "수면 반사와 정자 조명이 함께 보이는 구간"
  photo_tip         text,
                    -- 사진 잘 나오는 구도·위치 안내.
                    -- 예: "난간 대신 정자와 수면을 함께 넣는 구도 권장"
  mission_type      text,
                    -- 체험 카드 유형:
                    -- 'check'           = 도착 확인형
                    -- 'photo'           = 포토 미션형
                    -- 'story'           = 스토리 감상형
                    -- 'couple_question' = 커플 질문형
  mission_prompt    text,
                    -- 미션 카드에 표시되는 안내 문구.
                    -- 예: "정자와 수면이 함께 보이는 지점을 찾아보세요"
  couple_question   text,
                    -- 커플 질문 카드 문구.
                    -- 예: "이 야경을 한 문장으로 표현한다면?"
  short_story       text,
                    -- 한 줄 역사·문화 맥락 카드.
                    -- 예: "정조가 화성을 순행할 때 머물던 곳"
  og_title          text,
                    -- 웹 공유 시 SNS 미리보기 제목.
                    -- NULL이면 display_name 또는 official_name 사용
  og_description    text,
                    -- 웹 공유 시 SNS 미리보기 설명. 120자 이내 권장
  og_image_url      text,
                    -- 웹 공유 시 SNS 미리보기 이미지.
                    -- NULL이면 core.places.hero_image_url 사용
  updated_at        timestamptz default now(),
  updated_by        uuid FK -> auth.users
                    -- 마지막으로 수정한 운영자 ID
)

-- ────────────────────────────────────────────────────────────
-- editorial.course_copy | 코스 기획 문구
-- 코스 제목, 설명, 동선 요약 등 운영자가 작성.
-- 웹 공유 og 메타데이터도 여기서 관리. course당 1행.
-- ────────────────────────────────────────────────────────────
editorial.course_copy (
  id              uuid PK default gen_random_uuid(),
  course_id       uuid NOT NULL FK -> core.courses UNIQUE,
                  -- 연결된 코스. course당 문구 1세트
  hero_title      text NOT NULL,
                  -- 앱 홈·상세 화면에 표시되는 코스 대표 제목.
                  -- 예: "처음 가는 수원화성 데이트 코스"
  subtitle        text,
                  -- 코스 한 줄 설명. 코스 카드 하단에 표시
  route_summary   text,
                  -- 동선 흐름 요약. 예: "장안문 → 화홍문 → 행리단길"
  og_title        text,
                  -- 웹 공유 시 SNS 미리보기 제목
  og_description  text,
                  -- 웹 공유 시 SNS 미리보기 설명
  og_image_url    text,
                  -- 웹 공유 시 SNS 미리보기 이미지
  updated_at      timestamptz default now(),
  updated_by      uuid FK -> auth.users
)

-- ────────────────────────────────────────────────────────────
-- editorial.place_publish_state | 스팟 노출 상태
-- 각 스팟의 앱/웹 공개 여부, 노출 우선순위, 운영 메모.
-- core.places INSERT 시 트리거로 자동 생성 (is_published=false).
-- ────────────────────────────────────────────────────────────
editorial.place_publish_state (
  id                uuid PK default gen_random_uuid(),
  place_id          uuid NOT NULL FK -> core.places UNIQUE,
                    -- 연결된 관광지
  is_published      bool default false,
                    -- true여야 앱/웹 serving view에서 노출됨.
                    -- 운영 웹에서 명시적으로 켜야 공개됨
  display_priority  int default 0,
                    -- 목록·홈 화면 노출 우선순위. 높을수록 상단 배치
  ops_memo          text,
                    -- 운영자 내부 메모. 사용자에게 절대 미노출.
                    -- 예: "주차 공사 중 — 3월 재확인"
  published_at      timestamptz,
                    -- 최초 공개 시각
  updated_at        timestamptz default now(),
  updated_by        uuid FK -> auth.users
)

-- ────────────────────────────────────────────────────────────
-- editorial.course_publish_state | 코스 노출 상태
-- 각 코스의 앱/웹 공개 여부, 홈 화면 노출 순서.
-- core.courses INSERT 시 트리거로 자동 생성 (is_published=false).
-- ────────────────────────────────────────────────────────────
editorial.course_publish_state (
  id                uuid PK default gen_random_uuid(),
  course_id         uuid NOT NULL FK -> core.courses UNIQUE,
                    -- 연결된 코스
  is_published      bool default false,
                    -- true여야 홈 화면 v_home_courses에 노출됨
  display_priority  int default 0,
                    -- 홈 화면 코스 카드 노출 순서. 낮을수록 위에 배치
  ops_memo          text,
                    -- 운영자 내부 메모. 사용자 미노출
  published_at      timestamptz,
  updated_at        timestamptz default now(),
  updated_by        uuid FK -> auth.users
)
```

---

## 3. public 스키마

```sql
-- ────────────────────────────────────────────────────────────
-- public.profiles | 사용자 프로필
-- Supabase auth.users와 1:1 연결되는 공개 프로필 테이블.
-- 소셜 로그인(카카오·네이버·Apple) 완료 시 자동 생성.
-- ────────────────────────────────────────────────────────────
public.profiles (
  id          uuid PK references auth.users,
              -- auth.users.id와 동일한 UUID.
              -- 소셜 로그인 성공 시 이 값으로 row 생성
  email       text,
              -- 사용자 이메일.
              -- Apple "나의 이메일 가리기" 사용 시
              -- @privaterelay.appleid.com relay 주소가 저장될 수 있음.
              -- 중복 가입 차단은 이메일이 아닌 provider+sub 기준으로 처리
  nickname    text,
              -- 앱 내 표시 이름. 소셜 계정 이름을 기본값으로 사용
  avatar_url  text,
              -- 프로필 이미지 URL. 소셜 계정 프로필 사진 기본값
  provider    text,
              -- 가입에 사용한 소셜 제공자:
              -- 'kakao' / 'naver' / 'apple'
  role        text default 'USER',
              -- 사용자 권한:
              -- 'USER'  = 일반 사용자 (기본값, 자동 부여)
              -- 'ADMIN' = 운영 웹 접근 가능. DB에서 직접 변경 필요
              -- 첫 번째 ADMIN 계정은 Supabase 대시보드 SQL Editor에서
              -- UPDATE profiles SET role='ADMIN' WHERE id='...' 로 설정
  updated_at  timestamptz default now()
)
```

---

## 4. serving 스키마 (Views)

앱과 공개 웹이 직접 읽는 뷰. 쓰기 불가.

```sql
-- 홈 코스 카드 목록 (published 코스만)
serving.v_home_courses
  course + course_copy(hero_title, subtitle)
  + 스팟 수 + 대표 이미지(첫 번째 place의 place_images WHERE is_hero=true)

-- 코스 상세 (스팟 목록 포함, 앱 UUID 기반)
serving.v_course_detail
  course + course_copy + course_places + places + place_copy(mission_prompt)

-- 스팟 상세
serving.v_place_detail
  place + place_copy(night_highlight, photo_tip, mission_prompt, couple_question)
  + place_images + place_pet_policies

-- 공개된 스팟 목록 (내 주변 등)
serving.v_published_places
  core.places JOIN editorial.place_publish_state WHERE is_published = true

-- 로컬 추천 (특정 place 기준)
serving.v_local_recommendations
  place_local_spots + local_spots + local_spot_links

-- [웹 전용] 코스 SEO 페이지용 (/courses/{slug})
serving.v_web_course_page
  course + course_copy(og_title, og_description, og_image_url) + 스팟 미리보기(첫 3개)

-- [웹 전용] 스팟 SEO 페이지용 (/places/{slug})
serving.v_web_place_page
  place + place_copy(night_highlight, photo_tip, og_*) + place_images
```

---

## 5. 채널별 접근 패턴

### Flutter 앱 (사용자 앱)

| 화면 | 읽기 | 쓰기 |
|---|---|---|
| 홈 | `serving.v_home_courses` | - |
| 코스 상세 | `get_course_detail(course_id)` RPC | - |
| 스팟 상세 | `serving.v_place_detail` | - |
| 코스 시작 | - | `core.user_course_progress` INSERT |
| 스팟 체크인 | - | `checkin_place()` RPC |
| 찜 | `core.user_favorites` SELECT | INSERT / DELETE |
| 내 주변 | `get_nearby_places(lat, lng)` RPC | - |

### Next.js 공개 웹 (검색 유입·공유 랜딩)

| 페이지 | 읽기 | 특이사항 |
|---|---|---|
| `/courses/{slug}` | `serving.v_web_course_page` | SSR, og:meta 포함 |
| `/places/{slug}` | `serving.v_web_place_page` | SSR, og:meta 포함 |
| 랜딩 | `serving.v_home_courses` | 코스 카드 미리보기 |

- 공개 웹은 **읽기 전용**, 쓰기 없음
- `slug` 기반 → `get_course_by_slug(slug)` / `get_place_by_slug(slug)` RPC 사용
- 딥링크: 앱 설치 시 앱 redirect, 미설치 시 웹 상세 유지

### Next.js 운영 웹 (백오피스)

| 기능 | 읽기 | 쓰기 |
|---|---|---|
| 코스 관리 | `core.courses` + `editorial.course_copy` | 두 테이블 모두 |
| 스팟 관리 | `core.places` + `editorial.place_copy` | 두 테이블 모두 |
| 노출 상태 | `editorial.place_publish_state` | `is_published`, `display_priority` |
| SEO 관리 | `editorial.course_copy`/`place_copy` og 필드 | og_title, og_description, og_image_url |
| 로컬 스팟 | `core.local_spots` + `local_spot_links` | CRUD |
| 수동 재동기화 | - | Phase 2 (Edge Function 트리거) |
| 동기화 로그 | `raw.sync_runs`, `raw.sync_errors` | Phase 2 |

- 백오피스는 **서버 액션**(`service_role` key)으로 core/editorial 직접 수정
- `profiles.role = 'ADMIN'` 확인 후 접근 허용

---

## 6. RPC 함수

```sql
-- 코스 상세 단건 조합 (앱: course_id 기반)
get_course_detail(p_course_id uuid) RETURNS json

-- 코스 상세 단건 조합 (웹: slug 기반, SSR용)
get_course_by_slug(p_slug text) RETURNS json

-- 스팟 상세 단건 조합 (웹: slug 기반, SSR용)
get_place_by_slug(p_slug text) RETURNS json

-- 현재 위치 기준 인근 스팟 (PostGIS ST_DWithin 사용, 앱 전용)
-- 사전 조건: Supabase 대시보드 → Database → Extensions → postgis 활성화 필요
get_nearby_places(p_lat numeric, p_lng numeric, p_radius_m int default 500)
  RETURNS TABLE(
    id               uuid,
    slug             text,
    official_name    text,
    lat              numeric,
    lng              numeric,
    category         text,
    display_name     text,   -- editorial.place_copy.display_name (NULL이면 official_name)
    night_highlight  text,
    hero_image_url   text,   -- place_images WHERE is_hero=true
    distance_m       numeric -- 요청 좌표 기준 거리(m). 거리순 정렬 및 앱 표시용
  )

-- 체크인 판정 및 진행 상태 갱신 (앱 전용)
checkin_place(
  p_progress_id uuid,
  p_place_id    uuid,
  p_lat         numeric,
  p_lng         numeric,
  p_mode        text   -- 'auto' | 'manual'
) RETURNS text         -- 'success' | 'out_of_range' | 'already_checked'
```

> 모든 RPC 함수는 `public` 스키마에 정의해야 PostgREST가 노출함.  
> `checkin_place` 등 판정 로직은 `SECURITY DEFINER`로 작성해 RLS 우회.

---

## 7. RLS 정책 방향

| 테이블 | anon | authenticated | admin |
|---|---|---|---|
| `core.places` / `core.courses` | SELECT | SELECT | ALL |
| `editorial.*` | 금지 | 금지 | ALL |
| `serving.v_*` | SELECT | SELECT | SELECT |
| `core.user_course_progress` | 금지 | 본인만 | ALL |
| `core.user_place_checkins` | 금지 | 본인만 | ALL |
| `core.user_favorites` | 금지 | 본인만 | ALL |
| `public.profiles` | 금지 | 본인만 | ALL |

`admin` 역할: `profiles.role = 'ADMIN'` 기반으로 policy 작성.

---

## 8. 비회원 정책

- **찜**: 로그인 전까지 앱 로컬 저장 → 로그인 시 `user_favorites`로 업서트
- **코스 진행 (Phase 1)**: 앱 로컬(SharedPreferences)에만 저장. 서버 저장은 Phase 2.
- **코스 진행 (Phase 2)**: `device_id` 컬럼 추가 → 로그인 시 `user_id`로 마이그레이션

---

## 9. Phase 구분

### Phase 1 — MVP (지금 만들 것)

`raw` 스키마 없이, 운영자가 백오피스에서 직접 데이터 입력.

**포함:**
- `core`: places, place_images, place_pet_policies, courses, course_places, local_spots, local_spot_links, place_local_spots, user_course_progress(회원만), user_place_checkins, user_favorites
- `editorial`: place_copy (og 필드 포함), course_copy (og 필드 포함), place_publish_state, course_publish_state
- `serving`: v_home_courses, v_course_detail, v_place_detail, v_web_course_page, v_web_place_page, v_published_places, v_local_recommendations

**제외 (Phase 2로 이동):**
- `raw` 스키마 전체 (공공데이터 ETL 파이프라인)
- `core.place_crowd_forecasts` (혼잡도 기능 — MVP 제외 범위)
- 반려동물 전용 serving view
- 비회원 `device_id` 서버 저장

### Phase 2 — 출시 이후

- `raw` 스키마 + 공공데이터 ETL 파이프라인 (GitHub Actions schedule + Edge Function, Supabase Cron은 Pro 플랜 전환 시 이전)
- `core.place_sources` 활성화 (공공 API contentId 매핑)
- `core.place_crowd_forecasts` + 혼잡도 기반 대체 스팟 추천
- 비회원 코스 진행 서버 저장 (`device_id` + 로그인 마이그레이션)
- 반려동물 전용 서브코스 및 serving view

---

## 10. 미결 사항

1. **`supabase/` 로컬 폴더 사용 여부**: 로컬 CLI 방식 vs MCP `apply_migration`만 사용
2. **비회원 찜 동기화 방식**: 앱 로컬 저장 후 로그인 시 서버 업서트 로직 (앱팀 구현 필요)
3. **publish_state 자동 생성 트리거 구현**: `core.places` / `core.courses` INSERT 시 각각 `editorial.place_publish_state` / `editorial.course_publish_state` row 자동 생성하는 PostgreSQL trigger 작성 필요
4. **user_course_progress 재시작 정책**: 같은 코스를 재시작할 때 기존 `in_progress` row를 `abandoned`로 업데이트한 뒤 새 row를 insert하는 RPC 또는 앱 로직 필요
5. **`get_course_detail`, `checkin_place` RPC 본문 작성**: 함수 시그니처만 정의, 실제 SQL 로직 미작성

---

### 확정된 사항 (더 이상 미결 아님)

- PostGIS 사용: `ST_DWithin` 방식으로 확정, Supabase Extensions에서 활성화
- `mission_radius_m`: `editorial.place_copy`에만 관리
- `display_name`: `editorial.place_copy`에만 관리
- `is_published`: `editorial.place_publish_state` / `editorial.course_publish_state`로 일원화
- `local_spots` 연결: `place_local_spots` N:M 테이블만 사용
- 찜: MVP 로컬 저장, 확장 단계에서 `user_favorites` 서버 동기화
