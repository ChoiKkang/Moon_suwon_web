# KTO 콘텐츠 적재 검증 보고서

## 검증 일시

2026-07-04

## 완료된 항목

- KTO TourAPI `areaBasedList2` 호출 성공
- 수원 관광지 43개 중 프로젝트 적용 후보 5개 선택 성공
- 선택 스팟 5개 모두 `detailCommon2` 개요와 이미지 정규화 성공
- 원격 Supabase에 KTO 적재용 `core`, `editorial`, `serving` 구조 보강 성공
- 원격 Supabase에 KTO 스팟 5개 SQL 적재 성공
- 원격 DB에서 `serving.v_imported_places` 직접 조회 성공
- 원격 DB에서 `anon` 역할로 `serving.v_imported_places` 조회 성공
- 홈 화면에서 공개 API 별칭 `public.v_imported_places`를 읽는 섹션 연결 완료
- `npm run kto:verify`로 Supabase REST 조회 성공
- `/courses` 서비스 코스 목록 페이지 구현 완료
- `/places/[slug]` KTO 스팟 상세 페이지 구현 완료
- `/admin` 콘텐츠 운영 대시보드 실데이터 기반 전환 완료
- `/terms`, `/privacy` 기본 정책 페이지 연결 완료

## 적재 확인 데이터

| 장소 | KTO contentId | Hero 이미지 |
| --- | --- | --- |
| 동북공심돈 | `2613657` | 있음 |
| 봉돈 | `2613659` | 있음 |
| 수원 지동벽화마을 | `2946407` | 있음 |
| 수원통닭거리 | `2613664` | 있음 |
| 연무대(동장대) | `1064469` | 있음 |

## 최종 REST 검증

`npm run kto:verify`는 앱과 같은 Supabase REST 경로로 `public.v_imported_places`를 조회한다. 현재 `.env.local`의 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 갱신 후 5개 장소가 정상 반환되었다.

원격 DB에서 `set local role anon`으로 `serving.v_imported_places`를 조회했을 때도 5개 장소가 정상 반환되었다. 따라서 RLS, GRANT, `serving` 뷰 권한과 REST 공개 별칭이 모두 정상이다.

홈 화면은 `src/lib/places/queries.ts`를 통해 `public.v_imported_places`를 읽도록 연결되어 있다. 이 뷰는 `serving.v_imported_places`의 공개 API 별칭이다. 키가 갱신되면 랜딩 페이지의 “공공데이터로 검증한 달빛 스팟” 섹션에 KTO 적재 장소가 표시된다.

## 서비스형 웹앱 구현 결과

- `/courses`: 3개 코스 구조를 제공한다. `성곽 야경 입문 코스`는 실제 KTO 적재 스팟 5개와 상세 링크를 연결한다.
- `/places/[slug]`: 각 KTO 스팟의 hero 이미지, 주소, 좌표, 연락처, KTO contentId, 코스 CTA를 제공한다.
- `/admin`: 하드코딩 사용자 지표 대신 공개 KTO 스팟 수, hero 이미지 보유 수, 주소 보유 수, 운영 문구 보유 수를 표시한다.
- 홈 랜딩: 메뉴와 CTA를 `/courses`, `#kto-spots`, `/admin`, `/places/[slug]` 실제 동선으로 연결한다.

## 다음 실행

재검증이 필요할 때 아래 명령을 실행한다.

```bash
npm run kto:verify
npm run typecheck
npm run lint
npm run build
```

성공 기준은 `Serving rows: 5`가 출력되고, 타입체크/린트/빌드가 실패 없이 완료되는 것이다.
