# GitHub Actions 데이터 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Actions로 KTO 장소·이미지·혼잡도·반려동물 데이터를 예약/수동 동기화하고 Supabase에 안전하게 적재한다.

**Architecture:** Actions가 `workflow_dispatch` 또는 UTC cron으로 TypeScript runner를 실행한다. Runner는 Supabase `public` 스키마의 service-role 전용 RPC만 호출하고 RPC가 `raw` 원본과 `core` 정규화 데이터를 갱신한다. Editorial 문구, 게시 상태, 코스는 자동 동기화에서 제외한다.

**Tech Stack:** GitHub Actions, Node.js 20, TypeScript, `tsx`, `@supabase/supabase-js`, Supabase PostgreSQL RPC, KTO TourAPI.

**Spec:** `docs/superpowers/specs/2026-09-07-github-actions-data-sync-design.md`

## Global Constraints

- API 키는 GitHub Actions secrets에서만 주입하며 로그에 출력하지 않는다.
- `core`, `editorial`, `raw` 테이블을 REST에 공개하지 않고 service-role 전용 RPC로만 쓴다.
- 자동 동기화는 원천 사실과 raw 로그만 갱신하고 editorial·publish·course 데이터를 덮어쓰지 않는다.
- 개별 API 항목 실패는 `raw.sync_errors`에 기록하고 나머지 항목은 계속 처리한다.
- 목록 API 또는 필수 환경변수 실패는 workflow를 실패시킨다.
- 변경 후 `npm run typecheck`, `npm run lint`, `npm run build`와 실제 RPC smoke test를 실행한다.

---

### Task 1: Service-role 전용 sync RPC와 pet override 스키마

**Files:**
- Modify: `supabase/migrations/20260906163828_github_actions_data_sync.sql`
- Test: `scripts/verify-sync-rpc.ts`

**Interfaces:**
- Produces `public.sync_run_start(source, metadata) -> uuid`.
- Produces `public.sync_run_finish(run_id, status, fetched, upserted, errors, metadata) -> void`.
- Produces `public.sync_run_error(run_id, endpoint, content_id, error_code, message) -> void`.
- Produces `public.sync_list_places() -> {place_id, kto_content_id, official_name}[]`.
- Produces `public.sync_kto_content_item(run_id, content_id, content_type_id, list_payload, detail_payload, normalized_place, images) -> uuid`.
- Produces `public.sync_kto_pet_item(run_id, content_id, payload) -> boolean`.
- Produces `public.sync_kto_crowd_batch(run_id, rows) -> integer`.

- [ ] **Step 1: Add failing RPC smoke test**

Create a script that requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, calls `sync_run_start`, `sync_run_finish`, and checks the returned run through a service-role RPC/read path without printing credentials.

- [ ] **Step 2: Run the smoke test before migration**

Run `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/verify-sync-rpc.ts`.

Expected: FAIL with a missing RPC error because the migration has not been applied.

- [ ] **Step 3: Write the migration**

Add `is_manual_override boolean not null default false` and `source_updated_at timestamptz` to `core.place_pet_policies`. Add service-role grants for the exact raw/core tables used by the RPCs. Revoke execute on the public RPCs from `PUBLIC`, `anon`, and `authenticated`, then grant execute to `service_role` only.

Implement the RPC bodies so content upserts locate places by KTO content ID, images use `on conflict do nothing` plus an update by source image ID, pet upserts skip manual overrides, and crowd rows map normalized tourist names to active KTO places. Do not write `editorial.place_copy`, `editorial.place_publish_state`, or course tables.

- [ ] **Step 4: Apply the migration to the linked project**

Run `supabase db query --linked --file supabase/migrations/20260906163828_github_actions_data_sync.sql`.

- [ ] **Step 5: Run the smoke test after migration**

Run `NODE_OPTIONS=--dns-result-order=ipv4first npx tsx scripts/verify-sync-rpc.ts`.

Expected: PASS, with a completed test run and no credential output.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260906163828_github_actions_data_sync.sql scripts/verify-sync-rpc.ts
git commit -m "feat: add service-role sync RPCs"
```

### Task 2: KTO client and sync runner

**Files:**
- Modify: `src/lib/kto/client.ts`
- Modify: `src/lib/kto/types.ts`
- Create: `scripts/sync-kto-data.ts`
- Modify: `package.json`

**Interfaces:**
- `KtoClient.fetchCrowdForecasts()` returns `KtoCrowdForecastItem[]` from `TatsCnctrRateService/tatsCnctrRatedList`.
- `KtoClient.fetchPetDetail(contentId)` returns `KtoPetTourItem | null` from `KorService2/detailPetTour2`.
- `sync-kto-data.ts --job content|crowd|pet` exits non-zero on required setup/list failure and records item-level failures.

- [ ] **Step 1: Add type fixtures/tests for crowd and pet normalization**

Use pure helper assertions in the runner test path for `cnctrRate` numeric parsing, `baseYmd` date parsing, and pet policy classification (`일부구역` → `partial`, `불가` → `not_allowed`, `가능` → `allowed`, no usable field → `unknown`).

- [ ] **Step 2: Run the new checks before implementation**

Run `npx tsx scripts/sync-kto-data.ts --help` and the focused fixture command. Expected: FAIL because the new methods/runner do not exist.

- [ ] **Step 3: Extend the KTO client**

Use HTTPS endpoints, a 20-second abort timeout, and bounded retries for transient network failures. Add `fetchPetDetail` and `fetchCrowdForecasts` while preserving the existing list/detail/image behavior. Never include the service key in thrown messages.

- [ ] **Step 4: Implement the runner**

Resolve the requested job, start one `sync_runs` row, process items sequentially to respect KTO rate limits, call the corresponding RPC, record per-item errors, finish the run, and exit non-zero only for required failures or a pet job with zero successful API results. `content` fetches all Suwon attraction rows and detail/images; `crowd` fetches area `41`, sigungu `41115`; `pet` gets IDs from `sync_list_places`.

- [ ] **Step 5: Add npm scripts**

Add `sync:data`: `tsx scripts/sync-kto-data.ts` and `sync:rpc:verify`: `tsx scripts/verify-sync-rpc.ts`.

- [ ] **Step 6: Run local API smoke tests**

Run `NODE_OPTIONS=--dns-result-order=ipv4first npm run sync:data -- --job content` with local server env. Then run `npm run sync:data -- --job crowd` and `npm run sync:data -- --job pet`; the pet job may finish as `failed` with an explicit KTO approval error if `detailPetTour2` is not approved.

- [ ] **Step 7: Commit**

```bash
git add src/lib/kto/client.ts src/lib/kto/types.ts scripts/sync-kto-data.ts package.json package-lock.json
git commit -m "feat: add KTO content crowd pet sync runner"
```

### Task 3: GitHub Actions schedule and manual dispatch

**Files:**
- Create: `.github/workflows/kto-data-sync.yml`
- Modify: `.env.local.example`
- Create: `docs/github-actions-data-sync-runbook.md`

**Interfaces:**
- Workflow input `job` accepts `content`, `crowd`, or `pet`.
- Scheduled invocations select the job from their exact cron expression.
- Required repository secrets are `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `KTO_SERVICE_KEY`.

- [ ] **Step 1: Write workflow validation expectations**

Check the YAML for `workflow_dispatch`, three schedules, `concurrency`, `timeout-minutes`, `npm ci`, and secret-backed env variables. The runner command must be `npm run sync:data -- --job "$JOB"`.

- [ ] **Step 2: Create the workflow**

Use Node 20, `actions/checkout@v4`, `actions/setup-node@v4` with npm cache, `npm ci`, a shell step that maps the schedule/input to the job, and a final runner step. Set `permissions: contents: read` and cancel duplicate runs per job.

- [ ] **Step 3: Document secret setup and manual run**

Document `gh secret set` commands that read values from environment/stdin, the UTC-to-KST schedules, the pet API approval caveat, and the expected `sync_runs`/`sync_errors` checks.

- [ ] **Step 4: Validate YAML and workflow command locally**

Run a YAML parser if installed, `npm run typecheck`, and `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/kto-data-sync.yml .env.local.example docs/github-actions-data-sync-runbook.md
git commit -m "ci: schedule KTO data sync with GitHub Actions"
```

### Task 4: GitHub secrets and end-to-end verification

**Files:**
- No source files; configure repository secrets for `ChoiKkang/Moon_suwon_web`.

- [ ] **Step 1: Set secrets without printing values**

Use `gh secret set` with stdin for the local Supabase URL, service-role key, and KTO key. Generate a fresh `SYNC_JOB_TOKEN` only if a future protected HTTP trigger needs it; the current RPC workflow does not require it.

- [ ] **Step 2: Dispatch a content run**

Run `gh workflow run kto-data-sync.yml --repo ChoiKkang/Moon_suwon_web -f job=content`, wait for completion, and inspect the run summary without exposing secrets.

- [ ] **Step 3: Verify database invariants**

Check that a new `raw.sync_runs` row completed, `raw.sync_errors` contains only item-level failures, and counts in `core.places`/`core.place_images` changed only as expected. Compare representative `editorial.place_copy`, publish state, and course rows before/after to verify they were not modified.

- [ ] **Step 4: Run application verification**

Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run kto:verify`, `npm run course:verify`, and a production HTTP smoke check for `/`, `/courses`, `/robots.txt`, and `/sitemap.xml`.

- [ ] **Step 5: Report actual status**

Report workflow run URL/status, exact jobs that succeeded or failed, the pet API approval condition if present, and any remaining admin REST schema blocker. Do not claim completion without fresh command output.
