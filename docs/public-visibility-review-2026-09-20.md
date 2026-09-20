# 공개 노출·운영 검수 재점검

검수 시각: 2026-09-20 15:02 KST (Supabase 조회 시각 2026-09-20 06:02 UTC)

대상: 공개 웹, 모바일 앱 공개 RPC 계약, 관리자 콘솔, GitHub Actions, Supabase serving/core/raw 경계, 코스·스팟 길찾기

## 결론

- 공개 스팟은 48개이며 좌표 누락이 0건이다.
- 공개 코스는 7개, 코스 정차지는 29건이며 7개 코스 모두 모든 정차지 좌표가 확인됐다. 코스 전체 도보 길찾기 링크를 노출해도 된다.
- 코스·스팟 데이터는 `core.course_places.order_index`와 `public.v_course_detail`로 연결되어 있다. 스팟 상세에서도 실제 포함 코스만 보여준다.
- 공개 경계 검증은 통과했다. 비게시 스팟·코스, 후보·원본·운영 집계는 익명 공개에서 차단되어 있다.
- 전체 데이터 health가 실패한 원인은 `gg_bus_arrival` 하나뿐이다. 마지막 실행 실패와 5분 freshness 초과가 확인되어 버스 도착 항목은 계속 숨긴다.

## 공개하기로 한 항목

| 화면/데이터 | 공개 기준 | 현재 판정 |
|---|---|---|
| 게시 스팟 기본정보·좌표 | `public.v_published_places`, 좌표 검증 | 48건 공개 |
| 스팟 길찾기 | 게시 스팟 좌표가 있으면 카카오맵 목적지·Google 도보·네이버지도 검색 링크 | 48건 제공 가능 |
| 코스 목록·정차지 순서 | 게시 코스이며 모든 정차지가 게시 상태 | 7개 코스, 29개 정차지 공개 |
| 코스 전체 길찾기 | 모든 정차지 좌표가 있을 때만 Google 도보 경유지 링크 노출 | 7개 코스 모두 가능 |
| 단기·중기예보 | 공개 계약의 `fresh` 블록만 사용 | 정상 수집·공개 가능 |
| 혼잡도 | 당일 예측이 있고 `crowd_data_status=fresh`일 때만 ‘방문 집중도 예측’으로 표시 | 48곳 중 19곳 표시 |
| 반려동물 정보 | 정책이 확인되고 `pet_data_status`가 `fresh` 또는 운영자가 확인한 값일 때 표시 | 48곳 중 3곳 표시 |
| 연관 관광지 | 양쪽 장소가 게시되고 관계가 `approved`일 때만 공개 RPC에서 반환 | 승인 23건 중 공개 조건 충족분만 노출 |
| 행사 | 현재·예정 행사만 공개 serving view에서 반환 | 6건 확인 |

## 공개하지 않는 항목

- 버스 도착: `place_bus_stops`는 `approved 129`, `hold 15`지만, `bus_arrival_snapshots` 720행·고유 정류장 50개가 모두 5분 freshness를 초과했다. 마지막 `GitHubActions:bus_arrival` 실행도 실패했다. 다음 성공 수집 전까지 공개 RPC의 `nearby_bus_arrivals.items`는 빈 배열로 유지한다.
- 반려동물 미확인: 공개 스팟 45곳은 `unavailable` 상태이므로 허용/불허로 추정하지 않는다.
- 혼잡도 미확인: 공개 스팟 29곳은 예측이 없으므로 카드에 혼잡 문구를 만들지 않는다.
- 관광사진: 후보 828건 모두 현재 `excluded`이며 저작권 증거가 없는 사진은 공개하지 않는다.
- 웰니스: 2건 모두 `excluded`이며 수원 공개 데이터로 사용하지 않는다.
- 기초지자체 관광지: `approved 11`, `hold 382`; 승인·게시 매칭이 끝난 항목 외에는 공개하지 않는다.
- 연관 관광지: `approved 23`, `hold 977`; 보류 관계와 비게시 endpoint는 공개하지 않는다.
- 두루누비: 140건 수집 결과 중 수원 교차 코스 0건. 수집 health는 유지하되 공개 코스에는 추가하지 않는다.
- 지역별 방문자수: 240행은 운영 분석 전용이며 앱/익명 RPC에 노출하지 않는다.
- `raw`, `core` 후보 테이블, 운영 API registry, sync 로그와 원본 payload: 관리자·서비스 역할 전용이다.

## 길찾기 반영 내용

- 스팟 상세에서 좌표가 있으면 카카오맵 목적지 링크, Google 도보 길찾기, 네이버지도 검색을 제공한다.
- 코스 카드에서 모든 정차지 좌표가 확인될 때 코스 전체 도보 경로 링크와 정차지별 다음 스팟 링크를 제공한다.
- 현재 코스의 `walking_distance_km`는 실제 도보 경로가 아닌 운영 참고값일 수 있으므로 화면에 ‘참고값’ 문구를 표시한다.
- 외부 경로 API를 서버에서 호출하거나 경로선(polyline)을 저장하는 기능은 아직 추가하지 않았다. 별도 제공처 키·쿼터·약관 검토 후 POC로 진행한다.

## 점검 결과

| 점검 | 결과 |
|---|---|
| `npm test` | 173/173 통과 |
| `npm run typecheck` | 통과 |
| `npm run lint` | 통과 |
| `npm run build` | 통과 |
| `npm run course:verify` | 공개 코스 7개, 좌표·운영시간 검증 통과 |
| `npm run public:verify` | 48개 스팟·7개 코스 공개 경계 통과 |
| `npm run admin:verify` | 운영 테이블·감사 조회 통과 |
| `npm run sync:rpc:verify` | 승인 API 14개·검수 큐·stale run 검증 통과 |
| `npm run kto:verify` | 공개 serving 20행 조회 통과 |
| 운영 배포 route smoke | `/`, `/courses`, 게시 스팟, `/robots.txt`, `/sitemap.xml` 200; `/admin/operations` 로그인 redirect 307 |
| `npm run data:verify -- --job all` | 버스 최근 실패·cache expired만 실패. 나머지 API health 통과 |

## 운영 보류 해제 조건

1. 버스 제공처 quota가 복구된 뒤 승인 정류장 수집 1회 성공.
2. 5분 이내 `bus_arrival_snapshots`가 다시 생성되고 `data:verify`가 버스까지 통과.
3. 그 다음에만 버스 도착 블록을 익명 공개.
4. 실제 도보 경로는 Google 또는 TMAP POC에서 거리·시간·경로선 품질을 비교한 뒤 앱 계약을 additive 방식으로 확장.

