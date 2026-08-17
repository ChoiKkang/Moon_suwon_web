# Supabase 데이터베이스 점검 보고서

점검일: 2026-08-17 (Asia/Seoul)

## 스키마 역할

| 스키마 | 역할 | 확인된 주요 객체 |
| --- | --- | --- |
| `raw` | KTO/API 원천 응답과 동기화 이력 보관 | `kto_kor_content`, `kto_kor_images`, `kto_crowd_forecast`, `sync_runs`, `sync_errors` |
| `core` | 정규화된 서비스 원본 데이터 | `places`, `place_sources`, `place_images`, `place_crowd_forecasts`, `courses`, 사용자 활동 테이블 |
| `editorial` | 운영자 문구와 공개 상태 | `place_copy`, `place_publish_state`, `course_copy`, `course_publish_state` |
| `serving` | 앱 화면용 읽기 모델/view | `v_imported_places`, `v_published_places`, `v_home_courses`, `v_course_detail`, `v_now_good_spot_candidates` |
| `public` | Supabase Data API에 노출하는 안전한 alias | `v_imported_places`, `v_published_places`, `v_home_courses`, `v_course_detail`, `v_now_good_spot_candidates` |

## 데이터 현황

- `core.places`: 13개, 모두 active
- `core.place_sources`: 13개
- `core.place_images`: 123개
- `editorial.place_copy`: 5개
- `editorial.place_publish_state`: 13개 중 7개 공개
- `public.v_imported_places`: 13개. 운영/관리자용 전체 적재 확인
- `public.v_published_places`: 7개. 공개 웹 노출 기준
- `core.place_crowd_forecasts`: 224개, 8개 장소, 예보 기간 2026-08-17~2026-09-13
- `raw.kto_crowd_forecast`: 980개, 35개 관광지, 최신 수집 2026-08-17 08:38 UTC
- `serving.v_now_good_spot_candidates`: 현재 공개 후보 7개
- `public.v_now_good_spot_candidates`: 공개 Data API alias 7개
- `core.courses`, `core.course_places`, `editorial.course_copy`, `editorial.course_publish_state`: 현재 0개
- `public.profiles`: 2개

## 적재 결과

- `KorService2`: completed, 163 fetched / 387 upserted / 0 errors
- `TatsCnctrRateService`: completed, 980 fetched / 1,204 upserted / 0 errors
- `KorPetTourService2`: failed, service not approved
- `raw.sync_errors`: 1건. `HTTP_403`, `The supplied service key is not approved for KorPetTourService2.`

## 무결성

- source가 없는 place: 0
- place가 없는 image: 0
- place가 없는 editorial copy: 0
- course 관계 고아 row: 0
- 중복 KTO content ID: 0
- 대표 이미지 없는 장소: 1 (`팔달문`)

## 보안/운영 주의

- `public.spatial_ref_sys`는 RLS가 꺼져 있어 Supabase Advisor ERROR가 발생한다.
- `public`의 SECURITY DEFINER 함수 중 일부가 `anon`/`authenticated`에 실행 권한을 가진다. 특히 `checkin_place`, `delete_own_account`, `is_admin`, course/place RPC는 의도와 권한을 DBA가 검토해야 한다.
- 함수 search path mutable 경고 8건, multiple permissive policy 경고 다수, unindexed foreign key 정보가 존재한다.
- 원격 migration 이력은 로컬보다 앞서 있다. 원격에는 baseline 10개, 2026-08-17 데이터/정책 migration 6개와 이번 공개 alias migration 4개가 있다. `supabase db push`를 무검토로 실행하지 않는다.
- 앱 의존성은 Next 16.3.1 보안 패치 후 `npm audit --omit=dev`가 0 vulnerabilities를 반환한다.

## 앱 반영

- 공개 화면은 publish state가 true인 7개만 읽는다.
- 운영/적재 검증은 imported view 13개를 계속 읽는다.
- 현재 혼잡도 view를 홈의 “오늘의 달빛 스팟”에 연결했다.
- 코스가 0개인 동안 하드코드 코스를 노출하지 않고 빈 상태를 보여준다.

## 출시 전 남은 외부 작업

1. Supabase Auth Apple Provider에 생성된 client secret JWT 등록
2. `KorPetTourService2` 서비스 승인 또는 해당 수집 기능을 운영에서 비활성화
3. 코스 담당자가 course/core-editorial 데이터를 적재하고 `course:verify`로 확인
4. Supabase Advisor ERROR/WARN과 원격 migration을 DB 담당자와 정리
5. Next.js 의존성 보안 audit의 남은 high 취약점 검토
