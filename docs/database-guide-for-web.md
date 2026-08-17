# 달빛수원 웹 개발용 DB 가이드

> 이 문서는 친구가 작성한 `jira_docs`의 DB/API 설계를 현재 Supabase 원격 DB와 Next.js 웹 코드에 맞춰 요약한 문서다.

최종 확인 기준: 2026-08-17~18 / Supabase project ref `feifvxhltehhsugizrob`

## 1. 가장 먼저 이해할 구조

웹이 직접 읽는 것은 `core` 테이블이 아니라 `public`에 노출된 읽기 전용 view다.

```text
한국관광공사 API
      │
      ▼
raw  ── 원본 응답·수집 로그 보관
      │ 정규화
      ▼
core ── 서비스 기준 데이터
      │
      ├── editorial ── 운영 문구·공개 상태
      │
      ▼
serving ── 앱/웹 화면용 view·RPC
      │ public alias
      ▼
Next.js 공개 웹 / 운영 웹 / Flutter 앱
```

원칙은 다음과 같다.

- 브라우저에서 KTO API를 직접 호출하지 않는다.
- 공개 웹은 `public.v_*` view 또는 공개 RPC만 읽는다.
- `core`와 `editorial`에 대한 쓰기는 운영 서버/관리 작업에서만 수행한다.
- 원천 API 값은 `raw`에 보존하고, 서비스 노출 문구는 `editorial`에서 관리한다.

## 2. 스키마별 역할

| 스키마 | 쉽게 말하면 | 웹에서의 사용 |
|---|---|---|
| `raw` | KTO/API 원본 창고 | 웹이 직접 읽지 않음. 수집 재현·오류 분석용 |
| `core` | 정규화된 서비스 원본 | 웹이 직접 읽지 않음. 장소·코스·혼잡도·행사 원본 |
| `editorial` | 사람이 다듬은 문구와 공개 스위치 | 웹이 직접 읽지 않음. 운영 view에 합쳐짐 |
| `serving` | 화면별 조합 결과 | 웹의 데이터 설계 기준 |
| `public` | Supabase Data API에 노출된 안전한 alias | Next.js의 실제 조회 경로 |

## 3. 핵심 테이블과 의미

### 장소

| 테이블 | 역할 | 주요 컬럼 |
|---|---|---|
| `core.places` | 관광지 정규화 마스터 | `id`, `slug`, `official_name`, `address_full`, `lat`, `lng`, `is_active`, `source_modified_at` |
| `core.place_sources` | 장소와 KTO contentId 매핑 | `place_id`, `kto_content_id`, `kto_content_type_id`, `sync_enabled` |
| `core.place_images` | 장소 이미지 갤러리 | `place_id`, `image_url`, `thumbnail_url`, `is_hero`, `display_order` |
| `core.place_pet_policies` | 반려동물 이용 정책 | `place_id`, `pet_policy`, `pet_note_short` |

`core.places.official_name`은 KTO 원본 이름이다. 웹 표시 이름과 운영 문구는 `editorial.place_copy`를 우선한다.

### 코스

| 테이블 | 역할 | 주요 컬럼 |
|---|---|---|
| `core.courses` | 코스 기본 정의 | `id`, `slug`, `theme_tags`, `estimated_duration_min`, `walking_distance_km` |
| `core.course_places` | 코스와 장소의 N:M 연결 | `course_id`, `place_id`, `order_index` |
| `editorial.course_copy` | 코스 제목·설명·SEO 문구 | `hero_title`, `subtitle`, `route_summary`, `og_*` |
| `editorial.course_publish_state` | 코스 공개 여부·순서 | `is_published`, `display_priority`, `published_at` |

코스는 네 테이블을 합쳐야 화면 카드 하나가 완성된다. 현재 웹은 이를 `public.v_home_courses`와 `public.v_course_detail`로 읽는다.

### 혼잡도·행사

| 테이블 | 역할 | 현재 상태 |
|---|---|---:|
| `raw.kto_crowd_forecast` | 관광지 집중률 원본 | 980행 |
| `core.place_crowd_forecasts` | 장소별 날짜 예보 정규화 | 224행 |
| `core.events` | 행사/축제 정규화 | 6행 |

혼잡도는 `forecast_score`를 `여유`/`보통`/`혼잡`으로 변환해 저장한다. 웹은 `public.v_now_good_spot_candidates`에서 현재 날짜 기준 공개 후보만 읽는다.

### 운영 문구·공개 상태

| 테이블 | 역할 |
|---|---|
| `editorial.place_copy` | 장소 표시명, 한 줄 설명, 야간 포인트, 포토팁, 미션, OG 문구 |
| `editorial.place_publish_state` | 장소 공개 여부, 노출 순서, 지금 가기 좋은 스팟 활성화 |
| `editorial.course_copy` | 코스 제목, 설명, 동선, OG 문구 |
| `editorial.course_publish_state` | 코스 공개 여부와 홈 카드 순서 |

`is_active`는 데이터 자체의 운영 중단 여부이고, `is_published`는 웹 공개 여부다. 둘 다 통과해야 공개 view에 노출된다.

## 4. 현재 웹이 읽는 공개 view

| 웹 기능 | 실제 조회 view | 코드 |
|---|---|---|
| 홈 공개 장소 | `public.v_published_places` | `src/lib/places/queries.ts`의 `getPublishedPlaces()` |
| 장소 상세 | `public.v_published_places` | `getPublishedPlaceBySlug()` |
| 운영 imported 검증 | `public.v_imported_places` | `scripts/verify-kto-serving.ts` |
| 홈/코스 목록 | `public.v_home_courses` | `src/lib/courses/queries.ts` |
| 코스 장소 순서 | `public.v_course_detail` | `src/lib/courses/queries.ts` |
| 오늘 혼잡도 | `public.v_now_good_spot_candidates` | `src/lib/crowd/queries.ts` |

새 테이블을 DB에 추가해도 웹에 자동으로 나타나지 않는다. 다음 순서가 필요하다.

1. `core` 또는 `raw`에 적재
2. `editorial` 문구/공개 상태 반영
3. `serving` view에 포함
4. `public` alias와 권한 추가
5. 웹 query adapter에서 읽기
6. route smoke test

## 5. 장소가 13개인데 웹에는 7개인 이유

현재 원격 DB 상태는 다음과 같다.

| 구분 | 개수 |
|---|---:|
| `core.places` | 13 |
| `public.v_imported_places` | 13 |
| `editorial.place_publish_state` | 13 |
| `public.v_published_places` | 7 |
| `public.v_now_good_spot_candidates` | 7 |

13개는 친구가 적재한 서비스 장소 원본이고, 7개는 운영자가 공개 승인한 장소다. 공개 웹은 7개를 보여주는 것이 정상이다.

공개 상태를 바꾸는 것은 코드 수정이 아니라 운영 데이터 변경이다. 운영자가 승인할 때 `editorial.place_publish_state.is_published`를 켜고, 필요하면 `display_priority`와 `is_now_good_enabled`를 설정한다.

현재 공개된 7개는 대표 이미지·주소·오늘 혼잡도 예보가 모두 있다. 다만 editorial 설명 문구는 7개 중 1개뿐이므로, 출시 품질을 높이려면 `editorial.place_copy.short_description`, `night_highlight`, `photo_tip`을 보강해야 한다.

## 6. 현재 DB 적재 현황

마지막 점검 시점 기준으로 친구의 수집 작업은 다음까지 반영되어 있다.

| 영역 | 행 수 | 의미 |
|---|---:|---|
| `raw.kto_kor_content` | 98 | 일반 관광정보 원본 |
| `raw.kto_kor_images` | 113 | 일반 관광 이미지 원본 |
| `raw.kto_crowd_forecast` | 980 | 집중률 원본 |
| `raw.kto_pet_tour` | 2 | 반려동물 원본 |
| `raw.sync_runs` | 7 | 수집 실행 이력 |
| `raw.sync_errors` | 6 | 수집 오류 이력 |
| `core.places` | 13 | 정규화 장소 |
| `core.place_sources` | 13 | KTO 매핑 |
| `core.place_images` | 123 | 정규화 이미지 |
| `core.place_crowd_forecasts` | 224 | 장소별 예보 |
| `core.events` | 6 | 행사 데이터 |
| `core.courses` | 2 | 공개 코스 2개 |

코스는 현재 다음 두 개가 `public.v_home_courses`에서 조회된다.

- 야경 사진 집중 코스 — 3개 스팟
- 성곽 야간 산책 코스 — 3개 스팟

## 7. API 수집 흐름

| API | 원본 용도 | 정규화/서빙 |
|---|---|---|
| `detailCommon2` | 이름·주소·좌표·개요·대표 이미지 | `core.places`, `core.place_images` |
| `detailIntro2` | 운영시간·주차·반려동물 1차 정보 | `core`/반려동물 정책 |
| `detailImage2` | 이미지 갤러리 | `core.place_images` |
| `areaBasedList2` | 수원 후보 장소 탐색 | `raw`, 선별 후 `core.places` |
| `locationBasedList2` | 주변 장소 탐색 | serving/RPC 확장 |
| `searchFestival2` | 행사/축제 | `core.events` |
| `TatsCnctrRateService` | 방문 집중률 예측 | `raw.kto_crowd_forecast` → `core.place_crowd_forecasts` |
| `KorPetTourService2` | 반려동물 장소/정책 | `raw.kto_pet_tour` → 반려동물 core |

주의할 API 파라미터:

- `KorService2/*2`는 구형 `defaultYN`, `firstImageYN`, `addrinfoYN` selector를 사용하지 않는다.
- `detailImage2`는 `imageYN=Y`만 사용하고 `subImageYN`은 넣지 않는다.
- 반려동물 API 목록/일부 endpoint는 현재 서비스 키 승인 문제로 403이 발생한다.

## 8. 운영 웹 현재 기능과 미구현 범위

현재 [관리자 대시보드](../src/app/admin/page.tsx)는 다음을 제공한다.

- 공개 장소 KPI: 공개 수, hero 이미지, 주소, editorial 문구 보유 현황
- 공개 장소 목록과 상세 링크
- 공개 코스 수와 코스별 스팟 수
- KTO 관광지 목록 실시간 조회
- 선택 관광지 상세/이미지 preview
- 관리자 승인 후 `core.places`, `core.place_sources`, `core.place_images` upsert
- 적재 후 관련 Next.js 경로 revalidate

아직 별도 화면이 필요한 기능:

- 장소 `is_published`, `display_priority`, `is_now_good_enabled` 편집
- `editorial.place_copy` 문구 편집
- 코스 생성/수정/공개/순서 변경
- `raw.sync_runs`, `raw.sync_errors` 조회
- `core.events` 운영
- `core.place_crowd_forecasts` 최신 수집 상태 확인
- 로컬 스팟 CRUD

운영 권한 주의:

- 설계 문서 기준 role 값은 `USER`/`ADMIN` 대문자다.
- 현재 웹 Server Action의 관리자 검사는 `profile.role === 'admin'` 소문자를 요구한다.
- 현재 프로필은 모두 `USER`라 실제 관리자 계정이 없다.
- `/admin` layout은 로그인 여부만 확인하고 role은 확인하지 않는다.

따라서 배포 전에 role 표준을 하나로 통일하고, `/admin` 진입과 Server Action 양쪽에서 같은 관리자 판정을 사용해야 한다.

## 9. 웹 개발자가 실행할 검증 명령

```bash
# 원본/운영 imported 장소 확인
npm run kto:verify

# 공개 코스와 연결 스팟 확인
npm run course:verify

# 타입·lint·production build
npm run typecheck
npm run lint
npm run build
```

현재 성공 기준:

- `kto:verify`: Serving rows 13
- `course:verify`: Published courses 2
- 공개 웹: publish된 장소 7개와 오늘 예보 7개
- 비공개 장소 slug: 404
- `npm audit --omit=dev`: 0 vulnerabilities

## 10. 배포 전 체크리스트

- [ ] Vercel `NEXT_PUBLIC_SUPABASE_URL`/publishable key 설정
- [ ] Vercel `NEXT_PUBLIC_SITE_URL`을 localhost가 아닌 실제 도메인으로 설정
- [ ] 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`, `KTO_SERVICE_KEY` 설정
- [ ] Apple/Kakao의 Supabase callback과 production redirect URL 등록
- [ ] 관리자 role 표준 통일 및 첫 ADMIN 계정 지정
- [ ] 7개 공개 장소 editorial 설명 보강
- [ ] 반려동물 API 승인 또는 반려동물 수집 기능 비활성화 결정
- [ ] 원격 migration 이력과 저장소 migration 동기화
- [ ] Supabase Advisor의 `public.spatial_ref_sys` RLS 오류와 SECURITY DEFINER 권한 검토
- [ ] production에서 `/`, `/courses`, `/places/{published-slug}`, `/admin` smoke test

## 참고 문서

- [친구 DB 스키마 원문](../jira_docs/2026-06-17-dalbit-suwon-db-schema%20(f82b9123-cc1c-46af-8575-a9d02776fdbe).md)
- [친구 API 필드 매핑 원문](../jira_docs/2026-05-25-dalbit-suwon-api-field-mapping.md)
- [친구 서비스 플로우 원문](../jira_docs/2026-05-25-dalbit-suwon-service-flow.md)
- [현재 Supabase 감사 보고서](./supabase-database-audit-2026-08-17.md)
- [KTO 적재 런북](./kto-content-ingestion-runbook.md)
