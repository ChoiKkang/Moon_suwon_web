# GitHub Actions 데이터 동기화 런북

## 저장소 secrets

저장소 `ChoiKkang/Moon_suwon_web`에 아래 다섯 가지 Actions secret을 등록한다.

```bash
gh secret set NEXT_PUBLIC_SUPABASE_URL --repo ChoiKkang/Moon_suwon_web
gh secret set NEXT_PUBLIC_SUPABASE_ANON_KEY --repo ChoiKkang/Moon_suwon_web
gh secret set SUPABASE_SERVICE_ROLE_KEY --repo ChoiKkang/Moon_suwon_web
gh secret set KTO_SERVICE_KEY --repo ChoiKkang/Moon_suwon_web
gh secret set DISCORD_WEBHOOK_URL --repo ChoiKkang/Moon_suwon_web
```

각 명령은 값을 표준입력으로 받아 저장한다. 값은 터미널·workflow 로그에 출력하지 않는다. `SUPABASE_SERVICE_ROLE_KEY`와 `KTO_SERVICE_KEY`는 절대 `NEXT_PUBLIC_*` 이름으로 만들지 않는다. Vercel 환경변수와 GitHub Actions secrets는 자동으로 동기화되지 않는다.

`KTO_SERVICE_KEY`는 GitHub Actions 예약 동기화뿐 아니라 관리자 콘솔의 KTO 미리보기/승인 Server Action에서도 사용한다. 따라서 해당 기능을 production에서 계속 사용할 경우 같은 키를 Vercel Production에도 서버 전용 변수로 등록한다. 브라우저 번들에는 포함되지 않는다.

`KTO_SERVICE_KEY`는 코드에서 붙인 환경변수 이름일 뿐 별도의 관광공사 키 종류가 아니다. 공공데이터포털에서 발급한 인증키를 사용하되, `KorService2`와 `TatsCnctrRateService`는 API별 활용신청·승인 상태가 각각 적용된다. 이 저장소의 클라이언트가 요청 URL을 직접 인코딩하므로, 포털의 **일반 인증키(Decoding)** 값을 한 번만 저장하고 이미 `%`로 인코딩된 값을 다시 넣어 이중 인코딩하지 않는다.

`DISCORD_WEBHOOK_URL`은 GitHub Actions 결과를 Discord 채널에 보내는 incoming webhook 주소다. 채팅·이슈·로그에 주소가 노출되면 누구나 메시지를 보낼 수 있으므로 해당 Discord 채널에서 webhook을 삭제/재생성한 뒤 새 주소를 secret 표준입력으로 등록한다. 워크플로는 `allowed_mentions.parse=[]`로 알림을 보내며 webhook 오류가 데이터 작업을 실패시키지는 않는다. Discord Developer Portal의 Application ID/Public Key는 이 알림 경로에 필요하지 않다. Public Key는 나중에 슬래시 커맨드 같은 HTTP Interaction 서명 검증을 붙일 때만 사용한다.
보안상 `Web quality`의 Discord job은 pull request(특히 fork)에서는 실행하지 않고 protected branch push 결과만 전송한다. KTO/코스 자동화는 schedule 또는 수동 실행 결과를 전송한다.

## 자동 일정

`.github/workflows/kto-data-sync.yml`의 cron은 UTC 기준이다.
workflow는 Node.js 22와 IPv4 우선 DNS 설정으로 실행한다.

| 작업 | UTC | 한국시간 |
| --- | --- | --- |
| 혼잡도 | 매일 17:30 | 매일 02:30 |
| 반려동물 | 일요일 18:00 | 월요일 03:00 |
| 장소/이미지 | UTC 28~31일 19:00 (한국시간 1일만 실행) | 매월 1일 04:00 |

작업이 겹치면 `concurrency`가 이전 실행을 취소하지 않고 KTO 요청을 직렬화한다.

`Course draft generation`은 매주 월요일 04:00 KST와 수동 실행을 지원한다. 수동 실행에서는 `dry_run`과 `limit(1~3)`을 선택할 수 있다. 공개·활성·승인된·좌표가 있는 장소를 기준으로 최대 세 개의 후보를 `core.courses`에 저장하지만 모두 비공개 초안이다. `/admin/courses`에서 실제 도보 동선과 운영 가능 여부를 검수한 뒤 공개 상태를 직접 켜야 한다. 같은 장소 조합은 automation key로 갱신되므로 반복 실행으로 중복 코스가 쌓이지 않는다. 각 초안에는 `core.courses.automation_metadata`에 직선거리 추정 여부, 장소별 근거, 품질 위반 목록, 입력 checksum이 저장된다. AI는 기본 비활성이고, 도입하더라도 검증된 장소 ID·근거를 바꾸거나 자동 공개할 수 없다.

각 작업은 일시적인 네트워크 실패에 대비해 최대 3회 실행을 시도하고, 성공 뒤 `npm run data:verify -- --job <job>`로 최근 실행 이력과 공개 serving view를 확인한다. 실패·검증 결과는 GitHub Actions Step Summary와 `/admin/operations`의 `raw.sync_runs`/`raw.sync_errors`에서 확인한다.

## 수동 실행

GitHub Actions의 `KTO data sync` workflow에서 `Run workflow`를 선택하고 `content`, `crowd`, `pet`, `events` 중 하나를 고른다.

CLI로 실행할 때는 다음과 같다.

```bash
gh workflow run kto-data-sync.yml --repo ChoiKkang/Moon_suwon_web -f job=content
gh run list --repo ChoiKkang/Moon_suwon_web --workflow kto-data-sync.yml --limit 5
```

## 데이터 경계

- 장소/이미지 sync는 `raw.kto_kor_content`, `raw.kto_kor_images`, `core.places`, `core.place_sources`, `core.place_images`만 갱신한다.
- 혼잡도 sync는 `raw.kto_crowd_forecast`, `core.place_crowd_forecasts`를 갱신한다.
- 반려동물 sync는 `raw.kto_pet_tour`, `core.place_pet_policies`를 갱신한다.
- 혼잡도 sync의 원천값은 실시간 현장 인원이 아니라 한국관광공사의 일 단위 방문 집중도 예측이다. 공개 화면에서는 `오늘 방문 집중도 예측`으로 표시하고, 데이터 갱신 시각을 함께 확인한다.
- `editorial.place_copy`, `editorial.place_publish_state`, 코스 테이블은 자동 sync가 변경하지 않는다.
- 코스 초안 워크플로는 예외적으로 `core.courses`, `editorial.course_copy`, `editorial.course_publish_state`, `core.course_places`를 원자 RPC로 갱신하지만 `is_published=false`를 유지한다. 기존에 운영자가 공개한 자동 코스는 다음 자동 실행에서 덮어쓰지 않는다.
- 새 장소는 게시 상태가 자동으로 공개되지 않는다.
- 새 KTO 장소는 `core.place_sources.ingestion_status=candidate`로 들어오며 `/admin/places`의 후보 검수함에서 승인·보류·제외한다. 승인도 곧바로 공개를 의미하지 않으며, 공개 토글은 별도 editorial 검수다.
- 후보 결정과 반려동물 정책 수동 override/해제는 비공개 `audit.admin_events`에 관리자·대상·시각·메모가 기록된다. 원본 KTO payload는 브라우저에 내보내지 않는다.
- `/admin/operations`의 Source Health는 최근 실행·48시간 freshness·fetched/upserted/errors를 보여준다. 수동 실행은 GitHub Actions 링크를 사용하며 웹에 GitHub token을 저장하지 않는다.
- KTO 이미지 URL은 정규화 단계에서 HTTPS로 저장하며, 공개 query adapter도 기존 값을 HTTPS로 보정한다.
- 예정 행사는 `core.events`에서 `public.v_upcoming_events`로 제공되며 종료일이 지난 행사는 공개 웹에서 숨긴다.
- 익명 브라우저는 curated serving view/RPC만 사용하며 unpublished core/editorial 행을 직접 읽을 수 없다.

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

### 혼잡도 403 점검 순서

로컬 호출은 성공하지만 GitHub Actions의 `crowd`만 403이면 다음 순서로 확인한다.

1. 공공데이터포털에서 `TatsCnctrRateService` 활용신청이 승인되었고 호출 한도가 남아 있는지 확인한다. `KorService2` 승인만으로는 혼잡도 엔드포인트 호출이 보장되지 않는다.
2. GitHub Actions의 `KTO_SERVICE_KEY`가 로컬에서 성공한 값과 같은지 확인한다. 키 원문이나 전체 요청 URL을 로그에 출력하지 말고, 포털의 Decoding 키를 그대로 한 번만 저장한다.
3. `workflow_dispatch`에서 `crowd`를 수동 실행하고, 실패하더라도 생성된 `raw.sync_runs`와 `raw.sync_errors` 행을 아래 SQL로 확인한다.

```sql
select
  r.id,
  r.source,
  r.status,
  r.items_fetched,
  r.items_upserted,
  r.error_count,
  r.started_at,
  r.completed_at
from raw.sync_runs r
where r.source = 'GitHubActions:crowd'
order by r.started_at desc
limit 1;

select
  r.id as sync_run_id,
  e.endpoint,
  e.error_code,
  e.message,
  e.created_at
from raw.sync_runs r
join raw.sync_errors e on e.sync_run_id = r.id
where r.source = 'GitHubActions:crowd'
order by e.created_at desc
limit 20;

select
  count(*) as forecast_rows,
  max(forecast_date) as latest_forecast_date,
  max(source_updated_at) as latest_source_updated_at
from core.place_crowd_forecasts;
```

저장소 checkout에서 자동 검증을 재현한다.

```bash
npm run data:verify -- --job all
```

`status = 'completed'`와 최신 `latest_forecast_date`가 오늘 날짜로 갱신된 경우에만 공개 화면의 STALE 상태가 해소된다. 403이 계속되면 코드에서 키를 바꾸거나 우회하지 말고 포털 승인·키 등록을 먼저 수정한다.

## 로컬 재현

`.env.local`에 서버 전용 키를 넣고 다음 명령으로 같은 runner를 실행한다.

```bash
NODE_OPTIONS=--dns-result-order=ipv4first npm run sync:data -- --job content
NODE_OPTIONS=--dns-result-order=ipv4first npm run sync:data -- --job crowd
NODE_OPTIONS=--dns-result-order=ipv4first npm run sync:data -- --job pet
```

로컬에서도 service-role 키가 필요한 RPC만 호출하며, 키는 출력하지 않는다.

## 배포 후 웹 smoke test

Vercel 배포가 완료되면 공개 경로와 관리자 인증 경계를 함께 확인한다.

```bash
DEPLOYMENT_URL=https://서비스도메인.example npm run deployment:verify
```

홈, 코스 목록, `paldalmun` 공개 상세, `robots.txt`, `sitemap.xml`은 2xx여야 하며 `/admin/operations`는 인증 없이 3xx/401/403이어야 한다.
