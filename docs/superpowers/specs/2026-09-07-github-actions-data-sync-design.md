# GitHub Actions 데이터 동기화 설계

## 목표

달빛수원의 장소·이미지·혼잡도·반려동물 원천 데이터를 GitHub Actions로 예약/수동 실행한다. 자동 수집은 `raw`와 `core`의 사실 데이터만 갱신하고, 운영자가 작성한 `editorial` 문구·코스·게시 상태는 보존한다.

## 범위

- `content`: KTO 수원 관광지 목록, 상세, 이미지 수집
- `crowd`: 관광지 집중률 향후 30일 수집 및 장소명 매칭
- `pet`: KTO 반려동물 상세정보 수집 및 정책 정규화
- `workflow_dispatch`: 운영자가 `content`, `crowd`, `pet` 중 하나를 즉시 재실행
- `schedule`: 혼잡도 매일, 반려동물 매주, 장소/이미지 매월 실행
- `sync_runs`와 `sync_errors`: 실행별 집계와 항목별 오류 기록

코스 생성·장소 문구·게시 승인은 자동화 범위에 포함하지 않는다. 이 데이터는 관리자 화면에서 수동으로 관리한다.

## 아키텍처

```text
GitHub Actions schedule/workflow_dispatch
  -> scripts/sync-kto-data.ts
  -> Supabase public RPC (service_role 전용)
  -> raw 원본 저장 + core 정규화
  -> serving/public view
```

원격 Data API에는 `public` 스키마의 RPC만 호출한다. `core`, `editorial`, `raw` 스키마를 REST에 추가로 공개하지 않아도 되도록 RPC 내부에서 테이블을 갱신한다.

## 데이터 보존 규칙

1. 장소 동기화는 `place_sources.kto_content_id`로 기존 장소를 먼저 찾는다.
2. 원천 필드(`official_name`, 주소, 좌표, 전화, overview, 이미지)만 갱신한다.
3. `is_active`, `editorial.place_copy`, `editorial.place_publish_state`, 코스 데이터는 자동 동기화가 변경하지 않는다.
4. 새 장소는 DB 트리거가 만든 비공개 상태로 남는다.
5. 반려동물 정책은 `is_manual_override = true`인 행을 자동 동기화가 덮어쓰지 않는다.
6. 혼잡도는 원천 집중률을 그대로 저장한다. 추천 여부는 운영자 설정을 따른다.

## 실행 일정

GitHub Actions cron은 UTC 기준이다.

| 작업 | 일정(UTC) | 한국시간 | 수동 입력 |
| --- | --- | --- | --- |
| crowd | 매일 `30 17 * * *` | 매일 02:30 | `crowd` |
| pet | 매주 일요일 `0 18 * * 0` | 월요일 03:00 | `pet` |
| content | UTC 28~31일 `0 19 28-31 * *` (한국시간 1일 guard) | 매월 1일 04:00 | `content` |

모든 작업의 중복 실행은 GitHub Actions `concurrency`로 직렬화해 KTO API 요청이
서로 겹치지 않게 한다.

## 실패 처리

- 목록 API 실패: run을 `failed`로 종료하고 workflow도 실패시킨다.
- 상세/이미지/개별 pet 항목 실패: `sync_errors`에 저장하고 나머지 항목은 계속 처리한다.
- 성공한 항목이 하나라도 있으면 run은 `completed`로 종료하되 `error_count`를 남긴다.
- 모든 pet 항목이 권한 오류로 실패하면 run을 `failed`로 종료해 서비스 승인 문제를 알린다.
- API 키나 Supabase 환경변수 누락은 시작 단계에서 즉시 실패한다.

## 보안

- GitHub Actions secrets에 `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KTO_SERVICE_KEY`를 저장한다.
- service-role 키와 KTO 키는 로그, URL, artifact에 출력하지 않는다.
- RPC execute 권한은 `service_role`에만 부여하고 `anon`·`authenticated`·`PUBLIC`에서 회수한다.
- 공개 앱은 기존 `public.v_*` 읽기 뷰만 사용한다.

## 수동 운영 경계

- 장소: 문구·야간 적합도·추천 토글·게시 여부를 관리자에서 승인한다.
- 코스: 장소 순서·시간·반려동물 가능 여부·우선순위·게시 여부를 관리자에서 관리한다.
- 반려동물: 자동 결과는 참고값이며, 관리자가 예외 장소를 수동 override할 수 있다.
- 혼잡도: 자동 예보를 표시하되, `is_now_good_enabled`와 추천 boost는 관리자가 결정한다.

## 검증 기준

- 로컬에서 각 sync job을 실제 KTO API로 실행할 수 있다.
- 원격 RPC 호출 후 `raw.sync_runs`와 `raw.sync_errors`가 생성된다.
- 장소/이미지/혼잡도/반려동물 데이터가 각각의 raw/core 테이블에 upsert된다.
- 기존 editorial·publish·course 행의 값이 동기화 전후 동일하다.
- `npm run typecheck`, `npm run lint`, `npm run build`가 통과한다.
