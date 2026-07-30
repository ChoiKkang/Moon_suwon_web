# KTO 콘텐츠 적재 및 호출 검증 런북

## 목적

관광콘텐츠랩 TourAPI 데이터를 서버에서만 호출하고, Supabase에 적재한 뒤 앱/웹이 `serving.v_imported_places`를 통해 조회할 수 있는지 확인한다.

## 환경변수

`.env.local`에는 아래 값이 필요하다.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
KTO_SERVICE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY`와 `KTO_SERVICE_KEY`는 브라우저에 노출하면 안 된다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다.

## Supabase 스키마 반영

현재 로컬 마이그레이션은 아래 계층을 만든다.

- `core.places`: 관광지 기준 데이터
- `core.place_sources`: KTO `contentid` 동기화 기준
- `core.place_images`: KTO 이미지
- `editorial.place_copy`: 운영자가 작성하는 야간 큐레이션 문구
- `serving.v_imported_places`: 앱/웹 조회용 공개 뷰
- `public.v_imported_places`: Supabase REST Data API가 읽는 공개 별칭 뷰

원격 반영 전에는 원격 마이그레이션 이력을 먼저 맞춰야 한다. 이전 확인에서 원격에는 로컬에 없는 마이그레이션 버전이 존재했으므로, `supabase db push` 전에 이력 정리가 필요하다.

## 실행 순서

1. `.env.local`에 서버 전용 키를 입력한다.
2. Supabase Data API 노출 스키마에 `serving`이 포함되어 있는지 확인한다.
3. 원격 마이그레이션 이력을 로컬과 맞춘다.
4. 마이그레이션을 반영한다.
5. KTO API 미리보기를 실행한다.
6. Supabase 적재를 실행한다.
7. `serving.v_imported_places` 조회 검증을 실행한다.

```bash
npm run kto:preview
npm run kto:import
npm run kto:verify
```

## 완료 기준

- `npm run kto:preview`가 수원 관광지 목록과 선택 스팟 정규화 결과를 반환한다.
- `npm run kto:import`가 선택 관광지를 `core`, `editorial` 계층에 적재한다.
- `npm run kto:verify`가 `serving.v_imported_places`에서 1개 이상의 행을 반환한다.
- 앱/웹 구현은 TourAPI를 직접 호출하지 않고 Supabase `serving` 계층만 조회한다.

## 현재 확인된 차단 조건

- `.env.local`에 `SUPABASE_SERVICE_ROLE_KEY`가 없다. 단, 현재는 `supabase db query --linked`로 스키마 적용과 SQL 적재를 완료했다.
- `.env.local`에 `KTO_SERVICE_KEY`가 없다. 현재 검증은 런타임 환경변수로만 주입해 수행했다.
- `.env.local`의 `NEXT_PUBLIC_SUPABASE_ANON_KEY`는 현재 프로젝트 anon 키로 갱신되었고, `npm run kto:verify` REST 조회가 성공했다.
- 원격 Supabase 마이그레이션 이력에 로컬에 없는 버전이 있어 바로 `db push`하면 실패한다.
- 로컬 Docker 데몬이 꺼져 있으면 `supabase db reset --local`로 로컬 DB 검증을 할 수 없다.
