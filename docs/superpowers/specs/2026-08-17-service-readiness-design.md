# 달빛수원 서비스 준비 설계

## 목표

원격 Supabase에 적재되는 관광 데이터를 공개 사이트에 정확히 반영하고, 인증·코스·운영 화면에서 데모용 하드코딩과 지원하지 않는 로그인 provider를 제거해 실제 서비스로 운영할 수 있는 기반을 만든다.

## 현재 확인된 사실

- `public.v_imported_places`에 활성 스팟 13개가 존재한다.
- 13개 중 대표 이미지 12개, 설명 문구 5개가 존재한다.
- 공개 장소 조회 코드가 `limit(12)`를 사용해 DB의 13번째 스팟을 숨기고 있다.
- `core.courses`와 `core.course_places`는 현재 비어 있다.
- 현재 코스 3개와 코스 문구·동선은 `src/lib/courses/catalog.ts`에 하드코딩되어 있다.
- Apple `.p8` 키와 JWT 생성 스크립트는 존재하지만 `.env.local`의 Apple 변수와 Supabase Auth Apple Secret이 비어 있다.
- Supabase Auth에서 Kakao는 redirect가 가능하고, Naver는 지원 provider가 아니다.

## 설계

### 1. 인증

- 로그인 provider는 Kakao와 Apple만 노출한다.
- Naver UI와 타입·provider 분기를 제거한다.
- `.env.local`에는 Apple JWT 생성에 필요한 식별자와 키 경로만 복구한다. 생성된 JWT는 저장소나 코드에 기록하지 않는다.
- Supabase Dashboard의 Apple Secret Key 등록은 외부 수동 단계로 명시한다.
- callback 경로는 기존 GET/POST 처리와 내부 경로 제한을 유지한다.

### 2. 공개 장소 데이터

- `public.v_imported_places`를 공개 데이터의 단일 읽기 경로로 사용한다.
- 고정 12개 제한을 제거하고 활성 공개 스팟 전체를 조회한다.
- 장소 식별자 `id`와 대표 이미지·원본 수정 시각을 데이터 모델에 포함해 코스 연결과 freshness 표시에 사용할 수 있게 한다.
- 이미지·설명·연락처가 없는 레코드는 오류가 아니라 필드별 빈 상태로 표시한다.

### 3. 코스 데이터

- `core.courses`, `core.course_places`, `editorial.course_copy`, `editorial.course_publish_state`를 읽는 별도 query adapter를 만든다.
- `is_published = true`인 코스만 공개 화면에 노출한다.
- 장소 연결은 DB의 `place_id`를 공개 장소 `id`와 매칭한다.
- 코스 데이터가 없을 때 기존 하드코딩 코스를 조용히 노출하지 않고 “공개된 코스가 준비 중” 상태를 표시한다.
- DB 적재 담당자가 코스를 추가하면 코드 변경 없이 `/courses`, 홈 코스 영역, 관리자 통계에 반영되게 한다.

### 4. UI의 사실성

- DB 장소 수와 대표 이미지 보유 수를 홈 통계에 사용한다.
- `50k+`, `4.9/5`, 고정 `12개 스팟` 같은 검증되지 않은 수치는 제거한다.
- 브랜드 설명·정적 시각 자산처럼 의도적으로 고정하는 콘텐츠는 유지하되, 실제 운영 지표처럼 보이는 값은 데이터로 교체한다.
- 코스 카드·장소 카드에는 실제 DB 데이터만 사용한다.

### 5. 개발·운영 안정성

- 현재 Mac 환경에서 Turbopack이 과도한 worker와 malloc 경고를 발생시키므로 `dev`와 `build`는 webpack 모드로 고정한다.
- production 환경에서 필요한 Supabase 공개 URL/키, service role key, KTO service key, site URL을 점검한다.
- 원격 DB에는 저장소에 없는 추가 migration이 존재하므로, DB 담당자와 migration 동기화 절차를 별도로 기록한다. 이번 변경에서 원격 코스 데이터를 임의로 덮어쓰지 않는다.

## 서비스 출시 기준

1. Kakao 로그인은 provider redirect와 callback을 통과한다.
2. Apple Secret을 Supabase Dashboard에 등록한 뒤 Apple 로그인도 callback을 통과한다.
3. 공개 장소 13개가 모두 노출되고, 이미지 없는 장소도 레이아웃을 깨지 않는다.
4. DB 코스가 없을 때 허위 코스가 노출되지 않는다.
5. DB 코스가 적재되면 재배포 없이 공개 코스 화면에 노출된다.
6. 관리자 KTO 적재는 인증·service role·KTO key가 설정된 환경에서만 동작한다.
7. 타입 검사, lint, webpack production build, 주요 route smoke test가 통과한다.

## 범위 밖 / 수동 단계

- Supabase Dashboard의 Apple Secret Key 저장은 로컬 파일이나 SQL로 대체하지 않는다.
- DB 담당자가 관리하는 원격 migration과 코스 seed는 기존 데이터의 소유권을 확인하기 전 자동 덮어쓰지 않는다.
- Supabase Advisor의 기존 보안·성능 경고는 별도 DB 보안 작업으로 분리한다. 특히 `public.spatial_ref_sys` RLS 오류와 SECURITY DEFINER 함수 권한은 운영 공개 전에 DBA 검토가 필요하다.
