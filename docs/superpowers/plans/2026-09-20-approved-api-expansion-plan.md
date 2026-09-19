# Approved API Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register all 14 approved public APIs, ingest and validate the nine unused sources, improve pet/crowd coverage telemetry, and expose only reviewed data through backward-compatible app contracts.

**Architecture:** Extend the existing GitHub Actions and Supabase `raw → core → public` pipeline instead of adding a second ingestion system. A typed catalog defines the 14 sources, a common raw item store preserves source payloads, dataset-specific normalizers populate private core tables, and reviewed data reaches the app only through additive public RPC fields. Durunubi remains an active source whose expected Suwon result may be a healthy zero.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.2.4, TypeScript 5, Node 22, `tsx`/Node test runner, Supabase Postgres 17 and `@supabase/supabase-js` 2.108.1, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-20-approved-api-expansion-design.md`

## Global Constraints

- Modify only `moon_suwon`; do not modify `ChoiKkang/MoonSuwonApp`.
- Preserve every existing public RPC name and existing response field; new app data is additive.
- Keep source keys and Supabase service-role credentials out of browser bundles, logs, and app code.
- Keep `raw`, `core`, and `ops` unavailable to `anon` and `authenticated`; expose reviewed data through public RPC/view contracts only.
- Use Suwon district codes `41111`, `41113`, `41115`, and `41117`; never treat a `41110` zero-result response as complete Suwon coverage.
- Treat a valid empty response as `zero_result`, not a failed run.
- Preserve the last successful value as `stale` when an upstream call fails.
- Never infer pet permission, bus stops, copyrights, or tourism relevance when the source does not provide enough evidence.
- Treat crowd and visitor-count data as forecasts/aggregates, never real-time people counts.
- Durunubi is implemented and monitored even when its reviewed Suwon publication count is zero.
- Create migration files with `supabase migration new`; apply only the generated migration and verify permissions after application.
- Use the checked-in Next.js 16 documentation under `node_modules/next/dist/docs/` before changing App Router server/client boundaries.

## Review Focus

- A source returns HTTP 200/result code success with no items: record a successful zero-result run and retain prior reviewed data; covered in Tasks 2, 4, and 6.
- One of four Suwon districts returns zero while the others return rows: complete the run with a coverage warning rather than silently treating it as complete; covered in Tasks 3 and 6.
- A source returns duplicate items across page boundaries: deduplicate by stable source/scope key and keep the latest payload hash; covered in Tasks 2 and 3.
- A public row points to an unpublished place or unreviewed image/relation: exclude it from anonymous RPC responses; covered in Tasks 7 and 10.
- A pet or crowd run fetches data but produces no changed rows: distinguish healthy `unchanged` from missing coverage and failure; covered in Tasks 8 and 9.

---

## File Map

- `src/lib/public-data/catalog.ts`: typed 14-API registry and freshness/review policy definitions.
- `src/lib/public-data/client.ts`: shared data.go.kr request, pagination, result-code, redaction, retry, and limit behavior.
- `src/lib/public-data/kto-extra.ts`: photo, wellness, local-hub, related, Durunubi, and visitor source methods/types.
- `src/lib/public-data/weather.ts`: KMA short/mid response normalization.
- `src/lib/public-data/bus.ts`: reviewed stop mapping and bus-arrival normalization/cache policy.
- `src/lib/public-data/review.ts`: pure Suwon scope, duplicate, copyright, relation, and publication decisions.
- `scripts/sync-public-data.ts`: new-source job orchestration using existing sync RPC lifecycle.
- `scripts/sync-kto-data.ts`: pet/crowd metrics and real `--limit` enforcement.
- `scripts/verify-data-health.ts`: catalog-aware health and dataset integrity verification.
- `src/lib/admin/types.ts`, `src/lib/admin/queries.ts`, `src/components/admin/operations-panel.tsx`: API ledger read model and UI.
- `.github/workflows/public-data-sync.yml`: scheduled/manual new-source jobs.
- `.github/workflows/kto-data-sync.yml`: existing pet/crowd options and verification integration.
- CLI-generated `approved_api_registry.sql` migration: registry, common raw store, private core tables, sync RPCs, grants.
- CLI-generated `approved_api_public_contract.sql` migration: reviewed public RPC fields and read permissions.
- `docs/public-api-contract.md`: app-team fixture and semantics.

---

### Task 1: Define the 14-API catalog and stable policies

**Files:**
- Create: `src/lib/public-data/catalog.ts`
- Create: `tests/public-data-catalog.test.ts`
- Modify: `src/lib/env/server.ts`
- Modify: `.env.local.example`

**Interfaces:**
- Produces `PublicApiKey`, `PublicApiDefinition`, `PUBLIC_API_CATALOG`, `getPublicApiDefinition(key)`.
- `PublicApiDefinition` includes `key`, `provider`, `displayName`, `approvedAt`, `expiresAt`, `accountStage`, `implementationStatus`, `syncJob`, `freshnessSlaHours`, and `reviewPolicy`.
- Server key resolution is `getPublicDataServiceKey(provider)` using provider-specific keys first and `KTO_SERVICE_KEY` as the compatibility fallback.

- [ ] **Step 1: Write the failing catalog tests**

```ts
test('catalog has exactly 14 unique approved APIs', () => {
  assert.equal(PUBLIC_API_CATALOG.length, 14);
  assert.equal(new Set(PUBLIC_API_CATALOG.map((item) => item.key)).size, 14);
});

test('Durunubi stays active but requires review', () => {
  const api = getPublicApiDefinition('durunubi');
  assert.equal(api.implementationStatus, 'active');
  assert.equal(api.reviewPolicy, 'review_before_publish');
});
```

- [ ] **Step 2: Run the focused test and observe the missing module failure**

Run: `npx tsx --test tests/public-data-catalog.test.ts`

Expected: FAIL because `src/lib/public-data/catalog.ts` does not exist.

- [ ] **Step 3: Implement the union, catalog, lookup, and server-only key fallback**

```ts
export type PublicApiKey =
  | 'kto_korean' | 'kto_photo' | 'kto_wellness' | 'kto_local_hub'
  | 'kto_accessibility' | 'kto_audio' | 'gg_bus_arrival' | 'kto_crowd'
  | 'kma_short' | 'kma_mid' | 'durunubi' | 'kto_related'
  | 'kto_visitors' | 'kto_pet';

export type ReviewPolicy = 'automatic' | 'review_before_publish' | 'internal_analysis' | 'raw_only';
```

Populate all dates from the user's approved list, with `accountStage: 'production_submitted'` and the exact expiration date for each row.

- [ ] **Step 4: Run catalog tests and typecheck**

Run: `npx tsx --test tests/public-data-catalog.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit the catalog**

```bash
git add src/lib/public-data/catalog.ts src/lib/env/server.ts .env.local.example tests/public-data-catalog.test.ts
git commit -m "feat: define approved public API catalog"
```

### Task 2: Add the private registry, raw item store, and normalized core tables

**Files:**
- Create with CLI: the single timestamped `supabase/migrations/*_approved_api_registry.sql` returned by `supabase migration new approved_api_registry`
- Modify: `scripts/verify-public-boundary.ts`
- Modify: `scripts/verify-sync-rpc.ts`

**Interfaces:**
- `ops.api_registry` stores the 14 definitions keyed by `api_key text primary key`.
- `raw.public_api_items` has unique `(api_key, source_item_key, scope_key)` and stores `payload`, `payload_hash`, `source_updated_at`, `fetched_at`, `last_sync_run_id`.
- Core tables: `place_photo_candidates`, `place_wellness`, `local_hub_candidates`, `place_relations`, `durunubi_courses`, `regional_visitor_stats`, `weather_forecasts`, `place_bus_stops`, `bus_arrival_snapshots`.
- Service-only RPCs: `sync_public_api_item`, `sync_public_api_review`, and dataset batch upserts.

- [ ] **Step 1: Generate the migration file through the installed CLI**

Run: `supabase migration new approved_api_registry`

Expected: one new timestamped SQL file under `supabase/migrations/`.

- [ ] **Step 2: Write migration SQL with explicit constraints and private grants**

The SQL must include:

```sql
create schema if not exists ops;

create table if not exists ops.api_registry (
  api_key text primary key,
  provider text not null,
  display_name text not null,
  approval_status text not null check (approval_status in ('approved','expired','suspended')),
  account_stage text not null check (account_stage in ('development','production_submitted','production')),
  approved_at date not null,
  expires_at date not null,
  implementation_status text not null check (implementation_status in ('not_implemented','implemented','active','hold')),
  sync_job text,
  schedule_label text,
  freshness_sla_hours integer check (freshness_sla_hours is null or freshness_sla_hours > 0),
  review_policy text not null check (review_policy in ('automatic','review_before_publish','internal_analysis','raw_only')),
  last_reviewed_at timestamptz,
  review_note text
);

create table if not exists raw.public_api_items (
  id uuid primary key default gen_random_uuid(),
  api_key text not null references ops.api_registry(api_key),
  source_item_key text not null,
  scope_key text not null default '',
  payload jsonb not null,
  payload_hash text not null,
  source_updated_at timestamptz,
  fetched_at timestamptz not null default now(),
  last_sync_run_id uuid references raw.sync_runs(id) on delete set null,
  unique(api_key, source_item_key, scope_key)
);
```

Add `review_status check in ('pending','approved','hold','excluded')`, `reviewed_at`, and `review_note` to candidate tables. Enable RLS on all exposed-schema tables, revoke all from `PUBLIC`, `anon`, and `authenticated`, and grant only required service-role access.

- [ ] **Step 3: Seed 14 rows using the catalog keys and approved dates**

Use `insert ... on conflict (api_key) do update` so migration replay and catalog-label correction are deterministic.

- [ ] **Step 4: Extend boundary verification**

Assert that anon cannot select `ops.api_registry`, `raw.public_api_items`, or any new core table, and that service role can call the sync RPCs.

- [ ] **Step 5: Apply locally and run boundary/RPC checks**

Run: `supabase migration up --local && npm run public:verify && npm run sync:rpc:verify`

Expected: migrations apply; public access is denied; service sync functions work.

- [ ] **Step 6: Commit the schema**

```bash
git add supabase/migrations scripts/verify-public-boundary.ts scripts/verify-sync-rpc.ts
git commit -m "feat: add approved API registry and private stores"
```

### Task 3: Build the shared public-data client and pagination contract

**Files:**
- Create: `src/lib/public-data/client.ts`
- Create: `tests/public-data-client.test.ts`

**Interfaces:**
- `PublicDataClient.requestPage<T>(endpoint, params, options): Promise<PublicDataPage<T>>`.
- `collectPages<T>({ fetchPage, limit, identity }): Promise<T[]>` applies a real global limit and deduplicates page-boundary repeats.
- `PublicDataApiError` exposes endpoint, HTTP status, safe result code, and retryability without exposing service keys.

- [ ] **Step 1: Add fixtures for empty success, repeated rows, quota error, malformed body, and limit=2**

```ts
test('a successful empty response is a zero-result page', async () => {
  const page = await client.requestPage('/empty', {});
  assert.deepEqual(page.items, []);
  assert.equal(page.totalCount, 0);
});

test('global limit stops pagination after two unique items', async () => {
  const rows = await collectPages({ fetchPage, limit: 2, identity: (row) => row.id });
  assert.deepEqual(rows.map((row) => row.id), ['1', '2']);
});
```

- [ ] **Step 2: Run the focused tests and observe failures**

Run: `npx tsx --test tests/public-data-client.test.ts`

Expected: FAIL because the client helpers do not exist.

- [ ] **Step 3: Implement URL construction, result parsing, redacted errors, and deduplicating pagination**

The service key must be added through `URLSearchParams` but never included in thrown messages. Retry only network errors, HTTP 429/5xx, and documented temporary result codes; do not retry auth/registration errors.

- [ ] **Step 4: Run client tests and full tests**

Run: `npx tsx --test tests/public-data-client.test.ts && npm test`

Expected: PASS.

- [ ] **Step 5: Commit the client**

```bash
git add src/lib/public-data/client.ts tests/public-data-client.test.ts
git commit -m "feat: add resilient public data client"
```

### Task 4: Implement KTO extra-source clients and pure review rules

**Files:**
- Create: `src/lib/public-data/kto-extra.ts`
- Create: `src/lib/public-data/review.ts`
- Create: `tests/kto-extra.test.ts`
- Create: `tests/public-data-review.test.ts`

**Interfaces:**
- `KtoExtraClient.fetchPhotos`, `fetchWellness`, `fetchLocalHub`, `fetchRelated`, `fetchDurunubi`, `fetchRegionalVisitors`.
- `reviewPhotoCandidate`, `reviewTourismCandidate`, `reviewRelation`, `reviewDurunubiCourse` return `{ status, reasons }`.
- `SUWON_ADMIN_DISTRICT_CODES` is the exact tuple `['41111','41113','41115','41117']`.

- [ ] **Step 1: Write parsing and review tests**

Cover four-district iteration, one-district zero warning, duplicate pagination, missing copyright exclusion, non-Suwon exclusion, self-relation exclusion, and Durunubi healthy zero.

```ts
test('Durunubi zero results remain healthy and publish nothing', () => {
  const result = reviewDurunubiCollection([]);
  assert.deepEqual(result, { status: 'approved', publishable: [], zeroResult: true });
});
```

- [ ] **Step 2: Run the focused tests and observe missing exports**

Run: `npx tsx --test tests/kto-extra.test.ts tests/public-data-review.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement source methods with the verified endpoints and source-specific keys**

Use stable keys from the response; for visitor data use `(baseYmd, signguCode, visitorType)`; for relations use `(baseYm, originId, relatedId)`; for photo use the gallery content identifier.

- [ ] **Step 4: Implement deterministic review rules**

Approval requires explicit Suwon address/code or geographic inclusion, valid coordinates when supplied, stable source ID, and dataset-specific provenance. Ambiguous candidates return `hold`, not `approved`.

- [ ] **Step 5: Run focused and complete tests**

Run: `npx tsx --test tests/kto-extra.test.ts tests/public-data-review.test.ts && npm test`

Expected: PASS.

- [ ] **Step 6: Commit KTO extra sources**

```bash
git add src/lib/public-data/kto-extra.ts src/lib/public-data/review.ts tests/kto-extra.test.ts tests/public-data-review.test.ts
git commit -m "feat: add reviewed KTO extra sources"
```

### Task 5: Implement KMA forecast and Gyeonggi bus normalization

**Files:**
- Create: `src/lib/public-data/weather.ts`
- Create: `src/lib/public-data/bus.ts`
- Create: `tests/weather.test.ts`
- Create: `tests/bus.test.ts`

**Interfaces:**
- `normalizeVillageForecast(items, issuedAt)` groups `TMP`, `POP`, `PTY`, `PCP`, `WSD`, `SKY` by forecast time.
- `normalizeMidForecast(land, temperature, issuedAt)` creates day 4–11 Seoul-capital forecasts.
- `normalizeBusArrivals(items, fetchedAt)` rejects negative arrival seconds and returns two arrival slots per route.
- `isBusSnapshotFresh(fetchedAt, now)` uses a 120-second cache window and 300-second stale limit.

- [ ] **Step 1: Write unit and boundary tests**

```ts
test('short forecast groups categories without mixing forecast times', () => {
  const rows = normalizeVillageForecast(fixture, '2026-09-20T02:00:00+09:00');
  assert.equal(rows[0].temperatureC, 19);
  assert.equal(rows[0].precipitationProbability, 30);
});

test('negative bus arrival seconds are rejected', () => {
  assert.throws(() => normalizeBusArrivals([{ predictTime1: '-1' }], NOW));
});
```

- [ ] **Step 2: Run tests and confirm missing-module failures**

Run: `npx tsx --test tests/weather.test.ts tests/bus.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement exact unit/date normalization and null-preserving behavior**

Do not convert missing precipitation text to zero. Store upstream issued time separately from fetch time. Bus output includes `stationId`, `routeId`, `routeName`, `arrivalSeconds`, `remainingStops`, and `fetchedAt`.

- [ ] **Step 4: Run focused and complete tests**

Run: `npx tsx --test tests/weather.test.ts tests/bus.test.ts && npm test`

Expected: PASS.

- [ ] **Step 5: Commit weather and bus domain code**

```bash
git add src/lib/public-data/weather.ts src/lib/public-data/bus.ts tests/weather.test.ts tests/bus.test.ts
git commit -m "feat: normalize weather and bus data"
```

### Task 6: Add new-source synchronization and schedules

**Files:**
- Create: `scripts/sync-public-data.ts`
- Create: `tests/sync-public-data.test.ts`
- Create: `.github/workflows/public-data-sync.yml`
- Modify: `package.json`

**Interfaces:**
- Jobs: `photo | wellness | local_hub | related | durunubi | visitors | weather_short | weather_mid | bus_arrival`.
- CLI supports `--job`, `--dry-run`, and positive `--limit` for every job.
- Run metadata contains `fetched`, `unchanged`, `changed`, `upserted`, `published`, `zero_result`, `scope_counts`, and `review_counts`.

- [ ] **Step 1: Write orchestration tests with fake clients and repository**

Cover dry-run no-write, limit enforcement, zero-result completion, partial district warning, idempotent unchanged rows, and one-item failure producing partial status.

- [ ] **Step 2: Run focused tests and observe missing orchestrator failure**

Run: `npx tsx --test tests/sync-public-data.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement job registry and repository boundary**

Each job starts one existing `sync_run_start`, persists common raw items and normalized rows through service-only RPCs, records item errors through `sync_run_error`, and finishes exactly once. A healthy empty Durunubi job finishes `completed` with `zero_result: true`.

- [ ] **Step 4: Add package command and workflow inputs/schedules**

Add `"sync:public-data": "tsx scripts/sync-public-data.ts"`. Use Node 22 and the same secret validation/redaction rules as the KTO workflow. Run weather separately from monthly analytics so a slow visitor pull cannot block forecasts.

- [ ] **Step 5: Run orchestration tests and workflow syntax checks**

Run: `npx tsx --test tests/sync-public-data.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit synchronization**

```bash
git add scripts/sync-public-data.ts tests/sync-public-data.test.ts .github/workflows/public-data-sync.yml package.json package-lock.json
git commit -m "feat: schedule approved public data ingestion"
```

### Task 7: Add reviewed public contracts for app consumption

**Files:**
- Create with CLI: the single timestamped `supabase/migrations/*_approved_api_public_contract.sql` returned by `supabase migration new approved_api_public_contract`
- Modify: `scripts/verify-public-boundary.ts`
- Create: `tests/public-api-contract.test.ts`
- Create: `docs/public-api-contract.md`

**Interfaces:**
- Extend `get_place_by_slug(text)` JSON with `related_places`, `approved_photos`, `wellness_tags`, `weather_summary`, and `nearby_bus_arrivals`.
- New internal/admin RPC exposes visitor aggregates, never anonymous place detail.
- Every new block includes `data_status`, `source_updated_at`, and `fetched_at`; absent data is `[]` or `null`.

- [ ] **Step 1: Generate the public-contract migration**

Run: `supabase migration new approved_api_public_contract`

Expected: one new SQL file.

- [ ] **Step 2: Write contract fixture tests before changing SQL**

Assert old keys remain, unreviewed relations/photos are absent, unpublished places cannot appear as related places, and empty Durunubi does not affect place detail.

- [ ] **Step 3: Implement additive SQL with reviewed/published gates**

Use `security_invoker` for exposed views. Revoke execute from `PUBLIC` before granting only the intended RPCs to `anon, authenticated`. Leave internal analytics service/admin only.

- [ ] **Step 4: Apply locally and run contract/boundary checks**

Run: `supabase migration up --local && npx tsx --test tests/public-api-contract.test.ts && npm run public:verify`

Expected: PASS and no private rows visible to anon.

- [ ] **Step 5: Document the additive JSON fixture for the app team**

Include one populated and one empty response, freshness semantics, crowd/visitor disclaimers, and bus cache timestamps.

- [ ] **Step 6: Commit public contracts**

```bash
git add supabase/migrations scripts/verify-public-boundary.ts tests/public-api-contract.test.ts docs/public-api-contract.md
git commit -m "feat: expose reviewed public data contracts"
```

### Task 8: Improve pet and crowd coverage metrics

**Files:**
- Modify: `scripts/sync-kto-data.ts`
- Modify: `src/lib/kto/client.ts`
- Modify: `tests/kto-client.test.ts`
- Modify: `tests/pet-sync.test.ts`
- Create: `tests/sync-coverage.test.ts`

**Interfaces:**
- Pet metadata: `discovered_count`, `detail_attempted_count`, `detail_success_count`, `source_empty_count`, `policy_valid_count`, `unchanged_count`, `changed_count`, `upserted_count`, `published_covered_count`.
- Crowd metadata: `matched_place_count`, `unmatched_attraction_count`, `published_covered_count`, `forecast_date_count`, `scope_counts`.
- Existing content and crowd jobs honor the global CLI `--limit`.

- [ ] **Step 1: Add failing tests for no-change health, network stale, and actual limit enforcement**

```ts
test('zero changed pet rows can still be a healthy completed run', () => {
  const status = classifyCoverageRun({ attempted: 8, succeeded: 8, changed: 0, errors: 0 });
  assert.equal(status, 'completed');
});
```

Also assert `limit=2` produces at most two content enrichments and two crowd upserts.

- [ ] **Step 2: Run focused tests and confirm current behavior fails the new assertions**

Run: `npx tsx --test tests/kto-client.test.ts tests/pet-sync.test.ts tests/sync-coverage.test.ts`

Expected: FAIL on missing metrics/limit behavior.

- [ ] **Step 3: Separate discovered, attempted, source-empty, unchanged, changed, and published coverage counters**

Prioritize published places that are unchecked, stale, or previously failed. Keep successful empty responses as `unavailable`; keep prior policy as `stale` for request failures; preserve manual overrides.

- [ ] **Step 4: Improve crowd matching without guessing**

Normalize names and use a unique high-confidence place match only. Save multi-match and no-match rows as review candidates. Record all four district scopes.

- [ ] **Step 5: Apply the CLI limit before expensive detail calls and before crowd batch writes**

The first `N` deterministic candidates are processed; metadata records `limited: true` and the undispatched candidate count.

- [ ] **Step 6: Run focused and full tests**

Run: `npx tsx --test tests/kto-client.test.ts tests/pet-sync.test.ts tests/sync-coverage.test.ts && npm test`

Expected: PASS.

- [ ] **Step 7: Commit coverage improvements**

```bash
git add scripts/sync-kto-data.ts src/lib/kto/client.ts tests/kto-client.test.ts tests/pet-sync.test.ts tests/sync-coverage.test.ts
git commit -m "feat: improve pet and crowd coverage telemetry"
```

### Task 9: Expand health verification across the 14-API catalog

**Files:**
- Modify: `scripts/verify-data-health.ts`
- Create: `src/lib/public-data/health.ts`
- Create: `tests/public-data-health.test.ts`

**Interfaces:**
- `evaluateApiHealth(definition, latestRun, previousRun, datasetStats, now)` returns `healthy | warning | failed | hold` plus findings.
- Checks catalog coverage, missing run, SLA, valid zero-result, sudden drop, four-district completeness, weather continuity, visitor-month completeness, relation integrity, image provenance, and bus cache age.

- [ ] **Step 1: Write pure health-classification tests**

Cover missing run failure for active APIs, Durunubi zero healthy, photo 90% drop warning, one district missing warning, expired forecast failure, pet unchanged healthy, and raw/public count inversion failure.

- [ ] **Step 2: Run tests and observe missing health module failure**

Run: `npx tsx --test tests/public-data-health.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement pure evaluation and wire database queries**

`data:verify -- --job all` verifies existing jobs plus every active catalog row. `--job durunubi` must pass after a completed zero-result run.

- [ ] **Step 4: Run focused tests, typecheck, and current production health**

Run: `npx tsx --test tests/public-data-health.test.ts && npm run typecheck && npm run data:verify -- --job all`

Expected: unit/type checks pass. Before initial new-source sync, the production command may list precisely the new missing-run findings; after Task 11 it must pass.

- [ ] **Step 5: Commit verification**

```bash
git add scripts/verify-data-health.ts src/lib/public-data/health.ts tests/public-data-health.test.ts
git commit -m "feat: verify health across approved APIs"
```

### Task 10: Add the 14-API management ledger to the admin operations page

**Files:**
- Modify: `src/lib/admin/types.ts`
- Modify: `src/lib/admin/queries.ts`
- Modify: `src/components/admin/operations-panel.tsx`
- Modify: `src/app/admin/operations/page.tsx`
- Create: `tests/admin-api-ledger.test.ts`

**Interfaces:**
- `AdminApiLedgerItem` contains registry fields, latest run counts/status, freshness, review counts, and expiration state.
- `getAdminOperations()` returns `apiLedger` in addition to existing fields.
- UI renders exactly 14 rows/cards with provider, account stage, implementation, schedule, last success, counts, SLA, review status, and expiration.

- [ ] **Step 1: Read the checked-in Next.js guides before editing server/client boundaries**

Read: `node_modules/next/dist/docs/01-app/01-getting-started/06-fetching-data.md` and `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`.

- [ ] **Step 2: Write query-mapping tests**

Assert 14 unique rows, never-run state, expired state, zero-result label, partial/warning state, and latest-run selection by source.

- [ ] **Step 3: Implement admin types and server-side query joins**

Read registry via the authenticated admin service client and combine with the latest run per `sync_job`. Do not query private schemas from the client component.

- [ ] **Step 4: Render accessible responsive ledger UI**

Desktop uses a table; small screens use cards or horizontal overflow. Status uses text plus icon/color. Include a note that Durunubi `0건` can be healthy when no Suwon course exists.

- [ ] **Step 5: Run admin tests, lint, typecheck, and build**

Run: `npx tsx --test tests/admin-api-ledger.test.ts && npm run lint && npm run typecheck && npm run build`

Expected: PASS.

- [ ] **Step 6: Commit admin ledger**

```bash
git add src/lib/admin/types.ts src/lib/admin/queries.ts src/components/admin/operations-panel.tsx src/app/admin/operations/page.tsx tests/admin-api-ledger.test.ts
git commit -m "feat: show approved API operations ledger"
```

### Task 11: Apply remote migrations, ingest real data, and perform agent review

**Files:**
- Modify only if findings require corrections: files introduced in Tasks 1–10
- Create: `docs/approved-api-ingestion-review-2026-09-20.md`

**Interfaces:**
- Produces a reproducible review report with per-source fetched/changed/upserted/approved/hold/excluded/zero/error counts.
- Records reviewed public IDs and exclusion reasons without exposing keys or raw sensitive URLs.

- [ ] **Step 1: Run all local verification before remote writes**

Run: `npm test && npm run lint && npm run typecheck && npm run build && npm run public:verify && npm run sync:rpc:verify`

Expected: PASS.

- [ ] **Step 2: Run Supabase advisors and review security findings**

Run: `supabase db advisors --linked`

Expected: no new critical security/performance finding attributable to the migrations. Fix new findings before proceeding.

- [ ] **Step 3: Apply the two reviewed migrations through the linked project workflow**

Use the repository's linked Supabase migration process, then run `supabase migration list` and confirm both local/remote versions match. Do not use a blind destructive reset.

- [ ] **Step 4: Probe all nine jobs with a small dry run**

Run:

```bash
for job in photo wellness local_hub related durunubi visitors weather_short weather_mid bus_arrival; do
  npm run sync:public-data -- --job "$job" --dry-run --limit 2
done
```

Run `bus_arrival` only after at least one reviewed station mapping exists; otherwise record it as `hold` with `mapped_station_count=0` rather than calling a guessed station.

Expected: no secret in output; valid result codes; Durunubi may report `zero_result=true`.

- [ ] **Step 5: Execute full ingestion in quota-safe order**

Run weather first, then KTO candidate sources, then monthly visitor analytics, and finally mapped bus stations. Stop on authentication/quota errors rather than retrying the full set.

- [ ] **Step 6: Review and classify the ingested candidates**

Apply the exact spec rules to all machine-approvable rows and every publication candidate. Record `approved`, `hold`, or `excluded` with reasons. Approve no photo without copyright/source fields, no relation with an unpublished endpoint, no non-Suwon candidate, and no guessed bus mapping.

- [ ] **Step 7: Verify anonymous app contracts with real data**

Call the public RPC using the anon key for a published place with new data and one without it. Confirm reviewed data appears, private/unreviewed data does not, and existing fields remain unchanged.

- [ ] **Step 8: Run final health and coverage verification**

Run: `npm run data:verify -- --job all && npm run public:verify && npm run admin:verify && npm run deployment:verify`

Expected: all active sources pass or show an explicitly approved healthy zero/hold state; no secret or private schema is exposed.

- [ ] **Step 9: Write the real-data review report**

The report must include exact counts, API response dates, four-district completeness, pet/crowd before-after coverage, Durunubi zero-result evidence, bus mapped/unmapped counts, held/excluded reasons, and app-contract examples.

- [ ] **Step 10: Commit the review and any evidence-backed corrections**

```bash
git add docs/approved-api-ingestion-review-2026-09-20.md
git commit -m "docs: record approved API ingestion review"
```

If Task 11 discovers a defect, return to the task that owns the affected file, add the regression test there, and commit that correction before committing this report.

### Task 12: Final regression and handoff

**Files:**
- Modify: `README.md`
- Modify: `docs/github-actions-data-sync-runbook.md`
- Modify: `docs/kto-content-ingestion-runbook.md`

**Interfaces:**
- Operations handoff lists commands, schedules, key names, zero-result semantics, review rules, and app contract version.

- [ ] **Step 1: Update operational documentation with exact commands and schedules**

Document both workflows, all job names, `--dry-run`/`--limit`, provider key fallback, review states, and how to interpret healthy Durunubi zero results.

- [ ] **Step 2: Run the complete repository verification suite once more**

Run: `npm test && npm run lint && npm run typecheck && npm run build && npm run data:verify -- --job all && npm run public:verify && npm run admin:verify && npm run deployment:verify`

Expected: PASS.

- [ ] **Step 3: Inspect the final diff and ensure user-owned files are untouched**

Run: `git status --short && git diff --check && git diff --stat f534e7f..HEAD`

Expected: the existing modified `local_docs` files remain outside task commits; no key, `.env.local`, generated cache, or unrelated document is staged.

- [ ] **Step 4: Commit documentation changes**

```bash
git add README.md docs/github-actions-data-sync-runbook.md docs/kto-content-ingestion-runbook.md
git commit -m "docs: document public data operations"
```
