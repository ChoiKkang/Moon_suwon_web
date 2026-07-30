# KTO 관광콘텐츠 수집/적재/호출 설계

작성일: 2026-07-04  
상태: 사용자 리뷰 대기  
대상 프로젝트: 달빛수원

## 1. 목적

달빛수원은 관광콘텐츠랩/한국관광공사 TourAPI를 앱과 웹에서 직접 호출하지 않는다. TourAPI는 관광지의 사실 데이터와 이미지 기준값을 확보하는 수집 소스로 사용하고, 사용자 경험은 Supabase의 `core`, `editorial`, `serving` 계층에서 완성한다.

이 설계의 목표는 다음 세 가지다.

- 현재 프로젝트의 Supabase/DB 연동 상태를 사실 기준으로 정리한다.
- 실제 TourAPI 응답 필드를 달빛수원 DB 컬럼에 어떻게 적재할지 정의한다.
- Phase 1 수동/시드 적재와 Phase 2 자동 동기화로 이어지는 구조를 확정한다.

## 2. 현재 DB 연동 상태

현재 저장소에는 Supabase 클라이언트 연결 코드가 있다.

- `src/lib/supabase/server.ts`: 서버 컴포넌트/서버 액션용 Supabase 클라이언트 생성
- `src/lib/supabase/client.ts`: 브라우저 클라이언트 생성
- `src/app/page.tsx`: `auth.getUser()`로 현재 사용자 조회
- `src/app/admin/layout.tsx`: 관리자 레이아웃 진입 전 `auth.getUser()`로 로그인 여부 확인

현재 구현된 DB 연동은 Auth 세션 확인 수준이다. 관광 데이터용 `core.places`, `editorial.place_copy`, `serving.v_home_courses`를 읽거나 쓰는 코드는 아직 없다.

현재 저장소 상태는 다음과 같다.

- `supabase/config.toml`은 존재한다.
- Supabase CLI 링크 흔적은 존재한다.
- `supabase/migrations` SQL 파일은 없다.
- 문서에는 `core`, `editorial`, `serving`, `raw` 스키마가 설계되어 있지만 실제 마이그레이션 구현은 아직 저장소에 없다.
- 현재 `.env.local`의 anon key를 갱신한 뒤 원격 Supabase REST 요청이 성공했다.

따라서 구현 전 선행 작업은 다음이다.

- Supabase anon key 재확인 또는 재발급
- 마이그레이션 작성
- `serving` 스키마를 Data API에 노출할지, `public` RPC로 감쌀지 결정
- TourAPI 키를 코드에서 제거하고 환경변수/Secret으로 이동

## 3. 확인된 TourAPI 응답 특성

제공된 TourAPI 키로 실제 호출을 확인했다.

### 3.1 `areaBasedList2`

수원시 관광지 조건은 다음과 같다.

```txt
service: KorService2
endpoint: areaBasedList2
areaCode: 31
sigunguCode: 13
contentTypeId: 12
_type: json
```

응답 결과는 수원시 관광지 43건이었다. 목록 응답에서 확인된 주요 필드는 다음이다.

```txt
contentid
contenttypeid
title
addr1
addr2
mapx
mapy
tel
firstimage
firstimage2
createdtime
modifiedtime
zipcode
cat1
cat2
cat3
cpyrhtDivCd
```

### 3.2 `detailCommon2`

Service2 기준으로 `detailCommon2`는 최소 파라미터 호출이 정상 동작했다.

```txt
service: KorService2
endpoint: detailCommon2
contentId: <contentid>
MobileOS: ETC
MobileApp: moon_suwon
_type: json
```

외부 Flask 예제에서 사용하던 `overviewYN`, `addrinfoYN`, `defaultYN` 같은 파라미터를 붙이면 현재 Service2에서는 `INVALID_REQUEST_PARAMETER_ERROR`가 발생했다. 따라서 달빛수원 수집기는 Service2 기준 최소 호출을 사용한다.

상세 응답에서 추가로 확인된 주요 필드는 다음이다.

```txt
overview
homepage
telname
createdtime
modifiedtime
```

### 3.3 `detailImage2`

`detailImage2`도 최소 파라미터 호출이 정상 동작했다.

```txt
service: KorService2
endpoint: detailImage2
contentId: <contentid>
MobileOS: ETC
MobileApp: moon_suwon
_type: json
```

이미지 응답에서 확인된 주요 필드는 다음이다.

```txt
contentid
originimgurl
smallimageurl
imgname
serialnum
cpyrhtDivCd
```

## 4. DB 컬럼별 적재 방식

### 4.1 `core.places`

`core.places`에는 공공데이터에서 온 기준값만 저장한다. 운영자가 앱/웹 노출 문구를 수정하더라도 원본 기준값은 보존한다.

| TourAPI 필드 | 대상 컬럼 | 적재 방식 |
|---|---|---|
| `title` | `core.places.official_name` | 원본 관광지명. 운영자가 직접 수정하지 않는다. |
| `addr1`, `addr2` | `core.places.address_full` | `addr1 + addr2`를 공백 정리 후 저장한다. |
| `mapy` | `core.places.lat` | numeric 변환. 위도. |
| `mapx` | `core.places.lng` | numeric 변환. 경도. |
| `tel` | `core.places.contact_phone` | 빈 문자열은 `null`로 저장한다. |
| `overview` | `core.places.source_overview_raw` | KTO 원문 개요를 그대로 보존한다. |
| `modifiedtime` | `core.places.source_modified_at` | `YYYYMMDDHHmmss` 문자열을 timestamp로 변환한다. |
| 없음 | `core.places.short_description` | 운영자 작성값. KTO 원문을 자동 노출하지 않는다. |
| 없음 | `core.places.category` | 운영자 또는 매핑 규칙으로 지정한다. |
| 없음 | `core.places.is_active` | 기본 `true`. 운영자가 비노출 처리할 수 있다. |

### 4.2 `core.place_sources`

`core.place_sources`는 KTO 원본 ID와 내부 place를 연결하는 기준 테이블이다.

| TourAPI 필드 | 대상 컬럼 | 적재 방식 |
|---|---|---|
| `contentid` | `core.place_sources.kto_content_id` | KTO 원본 ID. upsert 기준. |
| `contenttypeid` | `core.place_sources.kto_content_type_id` | 관광지 유형 코드. |
| 없음 | `core.place_sources.place_id` | 연결된 `core.places.id`. |
| 없음 | `core.place_sources.sync_enabled` | 기본 `true`. KTO에 없거나 자체 관리 스팟은 `false` 또는 source row 없음. |

### 4.3 `core.place_images`

현재 문서상 `core.place_images`에는 `image_url`, `is_hero`, `display_order`만 있다. 실제 `detailImage2`를 안정적으로 적재하려면 다음 보강 컬럼을 추가한다.

```sql
source_image_id text unique null
thumbnail_url text null
alt_text text null
copyright_type text null
source_provider text default 'KTO'
```

적재 방식은 다음이다.

| TourAPI 필드 | 대상 컬럼 | 적재 방식 |
|---|---|---|
| `firstimage` | `core.place_images.image_url` | 대표 이미지 후보. `is_hero=true`, `display_order=0`. |
| `firstimage2` | `core.place_images.thumbnail_url` | 대표 이미지 썸네일 후보. |
| `originimgurl` | `core.place_images.image_url` | 갤러리 원본 이미지. |
| `smallimageurl` | `core.place_images.thumbnail_url` | 갤러리 썸네일. |
| `serialnum` | `core.place_images.source_image_id` | 이미지 중복 방지 기준. |
| `imgname` | `core.place_images.alt_text` | 접근성/관리용 이미지 설명. |
| `cpyrhtDivCd` | `core.place_images.copyright_type` | KTO 이미지 권리 유형. |

### 4.4 `editorial.place_copy`

`editorial.place_copy`는 공공데이터가 아니라 달빛수원의 경험 문구를 담는다.

운영자가 작성해야 하는 값은 다음이다.

```txt
display_name
short_description
night_highlight
photo_tip
mission_title
mission_body
og_title
og_description
og_image_url
mission_radius_m
```

KTO의 `overview`는 참고 원문으로만 사용한다. 그대로 앱/웹에 노출하지 않는다.

## 5. Phase 1 수동/시드 적재 흐름

Phase 1에서는 `raw` 스키마와 자동 동기화 파이프라인을 만들기 전에 TourAPI를 초기 기준 데이터 수집 도구로만 사용한다.

1. `areaBasedList2`로 수원시 관광지 후보 43건을 수집한다.
2. 운영자가 달빛수원 MVP에 맞는 핵심 스팟 8~10개를 선별한다.
3. KTO에 있는 스팟은 `core.places`, `core.place_sources`, `core.place_images`에 적재한다.
4. KTO에 없는 핵심 스팟은 운영자가 직접 `core.places`에 생성하고 `sync_enabled=false` 또는 source row 없음으로 관리한다.
5. 운영자가 `editorial.place_copy`에 야간 포인트, 포토팁, 미션 문구, SEO 문구를 작성한다.
6. 앱과 공개 웹은 `serving` View/RPC만 읽는다.

Phase 1에서 중요한 점은 TourAPI 전체 결과를 바로 서비스 데이터로 쓰지 않는 것이다. 달빛수원은 수원 전체 관광지 목록 서비스가 아니라 야간 데이트 코스 큐레이션 서비스다.

## 6. Phase 2 Edge Function 자동 동기화 흐름

Phase 2에서는 TourAPI 호출을 Supabase Edge Function으로 이동한다.

```txt
GitHub Actions schedule/workflow_dispatch
-> Supabase Edge Function sync-kto-content 호출
-> KTO areaBasedList2 수원 후보 목록 조회
-> raw.kto_content_list 원본 저장
-> contentid 기준 core.place_sources 매칭
-> detailCommon2 / detailImage2 상세 조회
-> raw.kto_content_detail, raw.kto_content_images 저장
-> core.places / core.place_images 갱신
-> serving view가 최신 core/editorial 조합 반영
-> sync_runs / sync_errors에 결과 기록
```

자동 동기화 기준은 `contentid`와 `modifiedtime`이다.

- `contentid`가 `core.place_sources.kto_content_id`와 매칭되어야 한다.
- 새 `modifiedtime`이 `core.places.source_modified_at`보다 최신이면 상세 API를 호출한다.
- 변경이 없으면 상세/이미지 호출을 건너뛴다.
- `editorial` 데이터는 자동 동기화로 덮어쓰지 않는다.

동기화 대상은 다음처럼 구분한다.

| 대상 | 처리 |
|---|---|
| `sync_enabled=true` | KTO 정기 동기화 대상. official_name, address, lat/lng, tel, overview, images 갱신 가능. |
| `sync_enabled=false` | KTO에 없거나 운영자가 직접 관리하는 스팟. 자동 동기화 제외. |
| source row 없음 | 순수 자체 스팟. 자동 동기화 제외. |

### 6.1 Edge Function 구성

최소 함수 구성은 다음이다.

| 함수 | 역할 |
|---|---|
| `sync-kto-content` | 지역기반 관광정보 목록/상세/이미지 수집, `core.places`, `core.place_sources`, `core.place_images` 갱신 |
| `sync-kto-pet` | 반려동물 동반여행 데이터 수집, `core.place_pet_policies` 갱신 |
| `admin-resync` | 운영자가 특정 `contentid` 또는 `place_id`를 수동 재동기화 |

### 6.2 raw/log 테이블

Phase 2에서 추가할 raw/log 테이블은 다음이다.

```txt
raw.kto_content_list
- id
- sync_run_id
- contentid
- contenttypeid
- payload jsonb
- fetched_at

raw.kto_content_detail
- id
- sync_run_id
- contentid
- payload jsonb
- fetched_at

raw.kto_content_images
- id
- sync_run_id
- contentid
- serialnum
- payload jsonb
- fetched_at

raw.sync_runs
- id
- job_name
- status
- started_at
- finished_at
- fetched_count
- inserted_count
- updated_count
- skipped_count
- error_count

raw.sync_errors
- id
- sync_run_id
- scope
- contentid
- message
- payload jsonb
- created_at
```

에러 처리는 부분 성공을 기본으로 한다. 한 스팟의 `detailImage2`가 실패해도 전체 동기화를 중단하지 않고 `sync_errors`에 기록한다. 단 `areaBasedList2` 목록 호출 자체가 실패하면 해당 동기화 실행은 실패 처리한다.

## 7. 키 관리와 보안

`test_kto_api.py`에 있는 TourAPI 키는 이미 코드에 노출된 값으로 취급한다. 운영 전에는 공공데이터포털에서 키를 재발급하거나 기존 키를 폐기 가능한 상태로 전환한다.

키 관리 원칙은 다음이다.

| 키 | 보관 위치 | 사용 위치 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local`, 배포 환경변수 | 브라우저/서버 모두 가능 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local`, 배포 환경변수 | 브라우저 가능. RLS/GRANT 필수 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 환경변수, Supabase Secret | Server Action, Route Handler, Edge Function 내부 |
| `KTO_SERVICE_KEY` | 로컬 환경변수, Supabase Edge Function Secret | Phase 1 수집 스크립트, Phase 2 Edge Function |
| `SYNC_JOB_TOKEN` | GitHub Actions Secret, Supabase Secret | GitHub Actions -> Edge Function 호출 검증 |

금지 사항은 다음이다.

- `KTO_SERVICE_KEY`를 `NEXT_PUBLIC_*`로 만들지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`를 브라우저 코드에 넣지 않는다.
- API 요청 URL이나 에러 로그에 service key를 출력하지 않는다.
- `test_kto_api.py`에 키를 하드코딩하지 않는다.

## 8. 호출 구조

앱과 웹은 TourAPI를 호출하지 않는다.

```txt
Flutter 앱
-> Supabase serving View/RPC

Next.js 공개 웹
-> Supabase serving View/RPC

Next.js 운영 웹
-> 관리자 검증
-> Server Action 또는 Route Handler
-> core/editorial 수정

GitHub Actions
-> Supabase Edge Function
-> TourAPI
-> raw/core 갱신
```

`serving` 접근 방식은 다음으로 확정한다.

```txt
Supabase Data API에 serving 스키마 노출
serving view는 읽기 전용
anon/authenticated는 serving view SELECT만 허용
core/editorial/raw는 직접 노출 금지 또는 엄격 제한
```

`public` RPC로 감싸는 방식은 이번 설계의 기본안에서 제외한다. 달빛수원 문서가 앱/웹의 읽기 계층을 `serving`으로 정의하고 있고, View/RPC 경계를 명확히 유지하는 편이 운영과 검증에 유리하기 때문이다.

## 9. 검증 기준

완료 기준은 TourAPI가 한 번 호출되는 것이 아니라, TourAPI 결과가 DB에 맞게 적재되고 앱/웹이 Supabase에서 호출할 수 있는 상태다.

### 9.1 Supabase 연결 검증

- `.env.local` anon key 갱신 후 REST 조회 성공 확인
- `auth.getUser()` 호출 가능
- `serving` View 조회 성공

### 9.2 마이그레이션 검증

- `core`, `editorial`, `serving` 스키마 생성
- Phase 2 진입 시 `raw` 스키마 생성
- `core.place_images` 보강 컬럼 포함
- RLS/GRANT 정책 확인

### 9.3 TourAPI 수집 검증

- `areaBasedList2` 수원 관광지 목록 조회 성공
- `detailCommon2` 최소 파라미터 조회 성공
- `detailImage2` 최소 파라미터 조회 성공
- 실패 로그에 키가 찍히지 않음

### 9.4 적재 검증

- `contentid` 기준 `core.place_sources` upsert 성공
- `title`, `address`, `lat`, `lng`, `overview`, `modifiedtime`가 `core.places`에 적재됨
- `firstimage`, `detailImage2` 이미지가 `core.place_images`에 중복 없이 적재됨
- KTO에 없는 자체 스팟은 자동 동기화 대상에서 제외됨

### 9.5 호출 검증

- 앱/웹은 TourAPI가 아니라 Supabase serving View/RPC만 호출
- 공개 웹에서 코스/스팟 미리보기 조회 성공
- 운영 웹에서 관리자 권한으로 core/editorial 편집 가능

## 10. 코스 및 프로젝트 방향성

실제 TourAPI 응답은 수원 전체 관광지 후보를 제공하지만, 달빛수원 핵심 경험인 수원화성 야간 데이트 코스를 자동으로 만들기에는 부족하다. `방화수류정`, `화홍문` 같은 세부 지점은 API 검색에서 누락될 수 있으므로 공공데이터는 기준 데이터로 쓰고, 서비스 경험은 자체 큐레이션으로 만든다.

추천 코스 방향은 다음이다.

### 10.1 성곽 야경 입문 코스

- 대상: 첫 방문자, 커플
- 후보: 연무대, 동북공심돈, 봉돈, 지동벽화마을, 수원통닭거리
- 목적: 실패 확률이 낮은 대표 야간 코스
- 데이터 전략: KTO 스팟과 자체 스팟을 혼합

### 10.2 사진 중심 코스

- 대상: SNS 공유와 야간 사진을 원하는 사용자
- 후보: 방화수류정, 화홍문, 용연, 성곽 조망 지점
- 목적: 달빛수원만의 큐레이션 차별화
- 데이터 전략: KTO보다 `editorial.photo_tip`, `night_highlight`, 자체 좌표가 중요

### 10.3 로컬 상권 연결 코스

- 대상: 데이트 후 식사/카페까지 원하는 사용자
- 후보: 수원통닭거리, 행궁동 카페, 소품샵, 전통시장 후보
- 목적: 관광 동선과 지역 상권 연결
- 데이터 전략: `core.local_spots`, `place_local_spots`, `editorial` 문구가 중요

프로젝트의 최종 방향성은 `공공데이터 기반 관광 DB`가 아니라 `공공데이터로 신뢰도를 확보한 야간 큐레이션 서비스`다.

역할 분리는 다음처럼 고정한다.

```txt
TourAPI
- 사실 데이터
- 원본 이미지
- contentid 기준 동기화

core
- 정규화된 기준 데이터
- 좌표/주소/이미지/원문 개요

editorial
- 달빛수원 경험 문구
- 야간 포인트
- 포토팁
- 미션
- SEO

serving
- 앱/웹이 소비하는 완성 데이터
```

## 11. 구현 계획에 반영할 확정 사항

구현 계획에는 다음 결정을 반영한다.

1. `serving` 스키마를 Data API에 노출한다.
2. `core.place_images`에 `source_image_id`, `thumbnail_url`, `alt_text`, `copyright_type`, `source_provider`를 추가한다.
3. Phase 1에서는 KTO 데이터 수집 스크립트 또는 운영자 전용 서버 작업으로 초기 시드를 만든다.
4. Phase 2에서는 Supabase Edge Function으로 자동 동기화를 구현한다.
5. 현재 노출된 TourAPI 키는 운영 전 재발급한다.
