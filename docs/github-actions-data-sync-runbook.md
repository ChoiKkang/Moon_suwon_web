# GitHub Actions 데이터 동기화 런북

## 저장소 secrets

저장소 `ChoiKkang/Moon_suwon_web`에 아래 세 가지 Actions secret을 등록한다.

```bash
gh secret set NEXT_PUBLIC_SUPABASE_URL --repo ChoiKkang/Moon_suwon_web
gh secret set SUPABASE_SERVICE_ROLE_KEY --repo ChoiKkang/Moon_suwon_web
gh secret set KTO_SERVICE_KEY --repo ChoiKkang/Moon_suwon_web
```

각 명령은 값을 표준입력으로 받아 저장한다. 값은 터미널·workflow 로그에 출력하지 않는다. `SUPABASE_SERVICE_ROLE_KEY`와 `KTO_SERVICE_KEY`는 절대 `NEXT_PUBLIC_*` 이름으로 만들지 않는다.

## 자동 일정

`.github/workflows/kto-data-sync.yml`의 cron은 UTC 기준이다.

| 작업 | UTC | 한국시간 |
| --- | --- | --- |
| 혼잡도 | 매일 17:30 | 매일 02:30 |
| 반려동물 | 월요일 18:00 | 월요일 03:00 |
| 장소/이미지 | 매월 1일 19:00 | 매월 1일 04:00 |

작업이 겹치면 `concurrency`가 이전 실행을 취소하지 않고 KTO 요청을 직렬화한다.

## 수동 실행

GitHub Actions의 `KTO data sync` workflow에서 `Run workflow`를 선택하고 `content`, `crowd`, `pet` 중 하나를 고른다.

CLI로 실행할 때는 다음과 같다.

```bash
gh workflow run kto-data-sync.yml --repo ChoiKkang/Moon_suwon_web -f job=content
gh run list --repo ChoiKkang/Moon_suwon_web --workflow kto-data-sync.yml --limit 5
```

## 데이터 경계

- 장소/이미지 sync는 `raw.kto_kor_content`, `raw.kto_kor_images`, `core.places`, `core.place_sources`, `core.place_images`만 갱신한다.
- 혼잡도 sync는 `raw.kto_crowd_forecast`, `core.place_crowd_forecasts`를 갱신한다.
- 반려동물 sync는 `raw.kto_pet_tour`, `core.place_pet_policies`를 갱신한다.
- `editorial.place_copy`, `editorial.place_publish_state`, 코스 테이블은 자동 sync가 변경하지 않는다.
- 새 장소는 게시 상태가 자동으로 공개되지 않는다.

## 실행 이력 확인

모든 작업은 `raw.sync_runs`에 하나의 실행을 남기고, 개별 API 오류는 `raw.sync_errors`에 기록한다. 원격 DB에서 다음을 확인한다.

```sql
select source, status, items_fetched, items_upserted, error_count, started_at, completed_at
from raw.sync_runs
order by started_at desc
limit 10;

select endpoint, content_id, error_code, message, created_at
from raw.sync_errors
order by created_at desc
limit 20;
```

## 실패 해석

- `content`: 목록 API 실패만 전체 실패다. 상세/이미지 하나가 실패해도 나머지는 계속 저장한다.
- `crowd`: `TatsCnctrRateService` 활용신청·운영 승인이 없으면 403으로 실패한다. 이 경우 공공데이터포털에서 해당 API의 활용신청/승인과 호출 한도를 확인한다.
- `pet`: `detailPetTour2`에서 403이면 `KorService2`의 반려동물 상세 기능 승인을 확인한다. 결과가 없는 장소는 `zero_result_content_ids` metadata에 남는다.

## 로컬 재현

`.env.local`에 서버 전용 키를 넣고 다음 명령으로 같은 runner를 실행한다.

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npm run sync:data -- --job content
NODE_OPTIONS=--dns-result-order=ipv4first npm run sync:data -- --job crowd
NODE_OPTIONS=--dns-result-order=ipv4first npm run sync:data -- --job pet
```

로컬에서도 service-role 키가 필요한 RPC만 호출하며, 키는 출력하지 않는다.
