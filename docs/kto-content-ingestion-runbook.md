# KTO 콘텐츠 적재 및 호출 검증 런북

## 목적

관광콘텐츠랩 TourAPI 데이터를 서버에서만 호출하고, Supabase에 적재한 뒤 앱/웹이 공개 `public.v_*` serving view를 통해 조회할 수 있는지 확인한다.

## 환경변수

`.env.local`에는 아래 값이 필요하다.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
KTO_SERVICE_KEY=...
KMA_SERVICE_KEY=...
GG_BUS_SERVICE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY`와 `KTO_SERVICE_KEY`는 브라우저에 노출하면 안 된다. `NEXT_PUBLIC_` 접두사를 붙이지 않는다.
`KMA_SERVICE_KEY`와 `GG_BUS_SERVICE_KEY`도 서버 전용이며, 신규 승인 public-data 작업에서 제공처별 키를 우선 사용하고 `KTO_SERVICE_KEY`를 호환 fallback으로만 사용한다.

## Supabase 스키마 반영

현재 로컬 마이그레이션은 아래 계층을 만든다.

- `core.places`: 관광지 기준 데이터
- `core.place_sources`: KTO `contentid` 동기화 기준
- `core.place_images`: KTO 이미지
- `editorial.place_copy`: 운영자가 작성하는 야간 큐레이션 문구
- `serving.v_imported_places`: 앱/웹 조회용 공개 뷰
- `public.v_imported_places`: Supabase REST Data API가 읽는 공개 별칭 뷰
- `serving.v_published_places`: publish state가 true인 공개 장소 view
- `public.v_published_places`: 공개 웹이 읽는 장소 alias view
- `serving.v_home_courses`, `serving.v_course_detail`: DB 공개 코스/코스 장소 조회 뷰
- `public.v_home_courses`, `public.v_course_detail`: 앱이 읽는 코스 view alias
- `serving.v_now_good_spot_candidates`: 현재 날짜 혼잡도와 공개 장소를 조합한 view
- `public.v_now_good_spot_candidates`: 홈의 오늘의 달빛 스팟 alias view
- `serving.v_upcoming_events`, `public.v_upcoming_events`: 종료되지 않은 행사 공개 view

승인 API registry/public contract는 원격에 반영됐고, 반려동물 보강 큐 조건 수정 migration `20260919181438_scope_pet_enrichment_candidates`도 적용됐다. 기존 원격 이력이 로컬과 다르므로 전체 `supabase db push`를 무심코 실행하지 말고, 링크된 migration 목록을 확인한 뒤 새 migration만 검토한다.

## 승인 public-data 작업과 현재 검수 상태

신규 9개 작업은 `scripts/sync-public-data.ts`에서 실행한다.

```bash
npm run sync:public-data -- --job photo --dry-run --limit 2
npm run sync:public-data -- --job weather_short --limit 2
npm run sync:public-data -- --job bus_arrival --dry-run --limit 2
```

작업 목록은 `photo`, `wellness`, `local_hub`, `related`, `durunubi`, `visitors`, `weather_short`, `weather_mid`, `bus_arrival`이다. `--dry-run`은 저장 없이 원천 호출·검수만 확인하고, `--limit`은 1 이상 정수의 전체 처리 한도다.

정상 빈 응답은 실패가 아니라 `zero_result=true`다. 두루누비는 전국 140건을 조회했지만 수원 교차 코스가 없어 `healthy zero`이며, 버스는 승인 정류장 매핑 0건이라 호출하지 않고 `hold`다. 사진은 저작권·출처가 없는 후보를 공개하지 않고, 관계·기초지자체는 게시 장소와 유일한 장소 매칭을 모두 통과한 후보만 공개한다.

실데이터 수치와 제외 사유는 [승인 API 실데이터 검수 보고서](approved-api-ingestion-review-2026-09-20.md)에 기록한다. 앱 공개 계약은 [docs/public-api-contract.md](public-api-contract.md)의 additive block 버전이며, 앱은 TourAPI를 직접 호출하지 않는다.

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
npm run course:verify
```

## 완료 기준

- `npm run kto:preview`가 수원 관광지 목록과 선택 스팟 정규화 결과를 반환한다.
- `npm run kto:import`가 선택 관광지를 `core`, `editorial` 계층에 적재한다.
- `npm run kto:verify`가 익명 키로 `public.v_imported_places`에서 1개 이상의 행을 반환한다.
- `npm run course:verify`가 공개 코스 수와 코스별 연결 스팟 수를 반환한다. 코스가 아직 없으면 `Published courses: 0`이 정상이다.
- `npm run data:verify -- --job all`이 최신 동기화 이력과 공개 serving view의 무결성을 통과한다.
- 앱/웹 구현은 TourAPI를 직접 호출하지 않고 Supabase `serving` 계층만 조회한다.

## 현재 확인된 차단 조건

- 이 체크아웃의 `.env.local`에는 필요한 로컬 검증 변수가 존재하며, `npm run kto:verify`, `npm run data:verify`가 성공했다. 파일은 gitignore 대상이고 값을 커밋하거나 로그에 출력하지 않는다.
- 로컬 `.env.local`, GitHub Actions secrets, Vercel 환경변수는 서로 자동 동기화되지 않는다. Actions의 `KTO_SERVICE_KEY`와 Vercel의 공개/서버 변수는 각 대시보드에서 별도로 확인한다.
- 원격 Supabase 마이그레이션 이력에 로컬에 없는 버전이 있어 바로 `db push`하면 실패한다. 새 이벤트/이미지 migration은 linked SQL runner로 적용했으며, 전체 이력 정리는 별도 작업으로 남아 있다.
- 반려동물 API는 승인 범위에 따라 결과가 0건 또는 403일 수 있다. `detailPetTour2`는 전용 발견 목록에 있는 ID만 호출하며, 일반 `KorService2` 콘텐츠 ID를 반복 호출하지 않는다. 현재 재수집은 발견 8건·상세 시도 1건·정상 빈 응답 1건·오류 0건이다.
- 혼잡도는 4개 수원 구를 모두 순회해 미래 예측 1,680건을 core에 저장했으며, 게시 장소 연결은 19/48이다. 56개 관광지명은 유일한 공개 장소로 확인되지 않아 공개하지 않았다.
- 로컬 Docker 데몬이 꺼져 있으면 `supabase db reset --local`로 로컬 DB 검증을 할 수 없다.
