# Public Data Contract and KTO Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand KTO discovery/enrichment safely and expose a stable, published-only Supabase contract that the MoonSuwon mobile app can consume.

**Architecture:** Keep KTO calls in the GitHub Actions runner and keep `raw`/`core`/`editorial` private. Additive migrations will extend the existing public RPC/view shapes with pet policy and crowd freshness fields, while new pet candidates remain unpublished until admin review. The web adapter maps the same contract for public pages without editing the mobile repository.

**Tech Stack:** Next.js 16 App Router, TypeScript, Node test runner, `tsx`, Supabase Postgres/RPC, GitHub Actions, Korean Tourism API.

**Spec:** `docs/superpowers/specs/2026-09-18-public-data-app-admin-ai-design.md`

## Global Constraints

- Modify only the MoonSuwon web repository; do not modify `ChoiKkang/MoonSuwonApp`.
- Keep existing public RPC names and existing fields; use additive fields and only introduce `v2` for a breaking change.
- Never expose `raw`, `core`, `editorial`, service-role credentials, or KTO keys to the app/browser.
- New KTO candidates and pet-enriched places remain unpublished until an administrator approves them.
- Treat a successful empty KTO response as a successful zero-result, not a network/API failure.
- Preserve manual pet overrides when automated sync runs.
- Treat crowd data as relative concentration forecasts, never as real-time headcount.
- Apply Supabase migrations through the linked Supabase migration tool/MCP; do not run a blind `supabase db push` against divergent history.
- Do not change webhook/Discord behavior in this plan.

---

### Task 1: Create pure pet-policy and freshness contracts

**Files:**
- Create: `src/lib/pet/policy.ts`
- Create: `tests/pet-policy.test.ts`
- Modify: `src/lib/places/types.ts`
- Modify: `src/lib/crowd/queries.ts`

**Interfaces:**
- `PetPolicy = 'allowed' | 'partial' | 'not_allowed' | 'unknown'`.
- `DataFreshness = 'fresh' | 'stale' | 'unavailable' | 'unknown'`.
- `normalizePetPolicy(typeCode: string | null | undefined, possibleText: string | null | undefined): PetPolicy`.
- `buildPetNote(payload: Record<string, unknown>): string | null` concatenates the seven supported KTO pet note fields in a stable order and caps the display text at 240 characters.
- `freshnessFromCheckedAt(checkedAt: string | null, now?: Date, maxAgeHours?: number): DataFreshness`.

- [ ] **Step 1: Write failing unit tests**

Add tests for `가능` → `allowed`, `일부/제한` → `partial`, `불가` → `not_allowed`, unusable fields → `unknown`, preservation of the risk/facility/rental/purchase fields in the note, 240-character truncation, and fresh/stale/null timestamps.

```ts
test('does not turn unknown pet data into partial', () => {
  assert.equal(normalizePetPolicy(null, null), 'unknown');
});
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm test -- tests/pet-policy.test.ts`

Expected: FAIL because `src/lib/pet/policy.ts` and the new exports do not exist.

- [ ] **Step 3: Implement the pure helpers and shared types**

Use case-insensitive trimmed Korean text matching, prioritize an explicit “불가” match over “가능”, and never infer `allowed` from an empty payload. Keep the helper free of Supabase, fetch, and environment dependencies.

- [ ] **Step 4: Run focused and complete unit tests**

Run: `npm test -- tests/pet-policy.test.ts` and `npm test`.

Expected: PASS with no existing planner/normalizer regressions.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pet/policy.ts tests/pet-policy.test.ts src/lib/places/types.ts src/lib/crowd/queries.ts
git commit -m "feat: define pet policy and freshness contracts"
```

### Task 2: Add the additive Supabase contract and candidate lifecycle

**Files:**
- Create: `supabase/migrations/20260918140000_public_data_contract.sql`
- Modify: `scripts/verify-public-boundary.ts`
- Modify: `scripts/verify-sync-rpc.ts`

**Interfaces:**
- `public.sync_kto_pet_candidate(p_run_id uuid, p_content_id text, p_content_type_id text, p_payload jsonb, p_normalized_place jsonb, p_area_code text, p_sigungu_code text) returns uuid`, service-role only.
- `public.sync_list_pet_enrichment(p_limit integer default 250) returns table(place_id uuid, kto_content_id text, source_modified_at timestamptz, last_pet_checked_at timestamptz, data_status text)`, service-role only.
- `public.sync_finalize_pet_discovery(p_run_id uuid) returns integer`, service-role only.
- `public.sync_mark_pet_check(p_run_id uuid, p_content_id text, p_status text, p_payload jsonb default '{}'::jsonb) returns boolean`, service-role only; records a valid empty response as `unavailable` without overwriting a manual override.
- `public.sync_kto_event_item(p_run_id uuid, p_content_id text, p_payload jsonb, p_normalized_event jsonb) returns uuid`, service-role only; upserts `core.events` without changing a separate editorial approval state.
- `public.get_place_by_slug(text)` adds `pet_policy`, `pet_note`, `pet_data_status`, `pet_source_updated_at`, `crowd_forecast`, `crowd_data_status` without removing existing JSON keys.
- `public.get_course_detail(uuid)` and `serving.v_course_detail` add per-stop pet fields while retaining `pet_ready_flag`.

- [ ] **Step 1: Add a failing boundary assertion**

Extend `scripts/verify-public-boundary.ts` to call one published place through `get_place_by_slug`, assert that the response contains `pet_policy` and `pet_data_status`, call a published course detail, and assert that each returned stop has `pet_policy`. Also assert that `checkin_place` rejects an anonymous call.

- [ ] **Step 2: Run the boundary check before the migration**

Run: `npm run public:verify`.

Expected: FAIL with missing contract fields or the current anonymous check-in grant.

- [ ] **Step 3: Write the migration**

The migration must:

1. Add `core.place_sources.ingestion_status` (`candidate`, `approved`, `rejected`, `stale`) with existing rows backfilled to `approved`, plus `first_seen_at`, `last_seen_at`, and `last_pet_checked_at`.
2. Add `core.place_pet_policies.data_status`, `last_checked_at`, and `details_json`, preserving `is_manual_override`, `source_provider`, and `source_updated_at`.
3. Create `raw.kto_pet_candidates` keyed by `content_id`, storing area/sigungu/content type, list payload, source modified time, first/last seen times, and the sync run ID. Create `raw.kto_festival` keyed by `content_id` for `searchFestival2` payloads and a service-role event upsert RPC for `core.events`.
4. Implement the three service-role discovery RPCs. Candidate upsert creates/updates a core place and source mapping but leaves editorial publication false; finalization marks unseen candidates stale without deleting places or manual overrides.
5. Update `sync_kto_pet_item` to preserve all pet fields in `details_json`, set `last_checked_at`, set `data_status=fresh` on a valid response, set `unknown` for a valid payload with no policy text, and skip rows with `is_manual_override=true`. Add `sync_mark_pet_check` so a valid HTTP 200 response with zero detail items records `last_checked_at` and `data_status=unavailable` without treating the item as an API failure.
6. Recreate the public place/course functions and serving views with published/active gates and the additive fields. Crowd JSON must include the forecast date/rate/level and a freshness status; it must not use “실시간” wording.
7. Revoke `anon` execute on `public.checkin_place(uuid, uuid, numeric, numeric, text)` and grant it only to `authenticated` and `service_role`, while preserving the function’s internal user check.
8. Keep `raw`, `core`, and `editorial` direct table reads unavailable to anonymous clients and grant only the new service-role RPCs to `service_role`.

- [ ] **Step 4: Apply and inspect the migration remotely**

Use the linked Supabase migration tool/MCP with project ref `feifvxhltehhsugizrob`. Inspect the function signatures, view columns, grants, and row-level policies with read-only SQL before running the post-migration smoke tests.

- [ ] **Step 5: Run public and service-role smoke tests**

Run: `npm run public:verify` and `npm run sync:rpc:verify`.

Expected: published getters expose additive fields, unpublished candidates remain absent, service-role discovery RPCs are callable, and anonymous `checkin_place` is rejected.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260918140000_public_data_contract.sql scripts/verify-public-boundary.ts scripts/verify-sync-rpc.ts
git commit -m "feat: add published data contract and pet candidate lifecycle"
```

### Task 3: Extend the KTO client for paginated pet discovery

**Files:**
- Modify: `src/lib/kto/types.ts`
- Modify: `src/lib/kto/client.ts`
- Modify: `src/lib/kto/normalize.ts`
- Create: `tests/kto-client.test.ts`

**Interfaces:**
- `KtoPetListItem` extends the list identity fields with KTO pet-list fields.
- `KtoFestivalItem` contains `contentid`, `title`, `eventstartdate`, `eventenddate`, `addr1`, `mapx`, `mapy`, `firstimage`, `tel`, `eventplace`, `playtime`, `usetimefestival`, `program`, and `modifiedtime`.
- `KtoPage<T> = { items: T[]; totalCount: number; pageNo: number; numOfRows: number }`.
- `KtoClient.fetchPetTourPage(options: { areaCode: string; sigunguCode: string; contentTypeId: string; pageNo: number; numOfRows: number }): Promise<KtoPage<KtoPetListItem>>`.
- `KtoClient.fetchPetDetail(contentId: string): Promise<KtoPetTourItem | null>` uses `https://apis.data.go.kr/B551011/KorPetTourService2`.
- `KtoClient.fetchSuwonFestivals(options: { eventStartDate: string; eventEndDate: string; pageNo: number; numOfRows: number }): Promise<KtoPage<KtoFestivalItem>>` uses `KorService2/searchFestival2`.

- [ ] **Step 1: Add fetch-mock tests**

Mock `globalThis.fetch` and assert that the list call uses `KorPetTourService2/petTourSyncList2`, carries `areaCode`, `sigunguCode`, `contentTypeId`, page parameters, and returns a single object item as a one-element array. Add a `searchFestival2` fixture, HTTP 429 retry, and successful zero-item responses for both pet and event requests.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm test -- tests/kto-client.test.ts`.

Expected: FAIL because the page method and pet base URL are not implemented.

- [ ] **Step 3: Implement page parsing and endpoint separation**

Keep `KorService2` for general content/events, use the official pet base for pet list/detail, preserve the existing error-code handling, retain the service-key redaction, and return `totalCount` from the response body. Use a 15-second pet timeout, maximum two retries, and exponential delays of 500ms and 1,000ms for transient failures.

- [ ] **Step 4: Run focused and existing KTO tests**

Run: `npm test -- tests/kto-client.test.ts tests/kto-normalize.test.ts`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kto/types.ts src/lib/kto/client.ts src/lib/kto/normalize.ts tests/kto-client.test.ts
git commit -m "feat: add paginated KTO pet and event clients"
```

### Task 4: Replace detail-only pet sync and add event synchronization

**Files:**
- Create: `src/lib/kto/pet-sync.ts`
- Create: `tests/pet-sync.test.ts`
- Modify: `scripts/sync-kto-data.ts`
- Modify: `package.json`

**Interfaces:**
- `SyncJob = 'content' | 'events' | 'crowd' | 'pet'` is the single job union used by the CLI, workflow, and run metadata.
- `paginatePetCandidates(client, config): Promise<KtoPetListItem[]>` deduplicates by `contentid` across content types and pages.
- `classifySyncStatus(stats): 'completed' | 'partial' | 'failed'` returns `completed` for all-valid zero-result details, `partial` when item errors exist, and `failed` only for missing configuration/list-level failure or total request failure.
- CLI remains `npm run sync:data -- --job content|events|crowd|pet` and additionally accepts `--dry-run` and `--limit N` for pet discovery/event previews.

- [ ] **Step 1: Write pure pet-sync tests**

Cover pagination termination, duplicate content IDs, all seven region/content-type combinations, enrichment selection for never-checked/stale/changed candidates, and status classification for 44 valid empty detail responses versus 44 timeout errors.

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm test -- tests/pet-sync.test.ts`.

Expected: FAIL because the new module does not exist.

- [ ] **Step 3: Implement discovery helpers**

Use area `41`, sigungu `111`, `113`, `115`, `117`, and content types `12`, `14`, `15`, `28`, `32`, `38`, `39`. Continue pages until `pageNo * numOfRows >= totalCount`; stop after the configured `--limit` only in dry-run/limited mode. Normalize coordinates and names before calling `sync_kto_pet_candidate`.

- [ ] **Step 4: Implement the runner flow**

For a pet job:

1. Start one sync run with job/config metadata.
2. Discover all configured pages and upsert candidate snapshots.
3. Call `sync_list_pet_enrichment` and fetch only returned candidate details with concurrency `3`.
4. Record each detail error without aborting other candidates; count valid empty results separately.
5. Call `sync_kto_pet_item` for non-empty detail results and `sync_mark_pet_check` for valid zero-item responses.
6. Call `sync_finalize_pet_discovery` and finish the run with candidate/detail/zero/error/stale metrics.

For an events job, fetch the current/future window from `searchFestival2` for Suwon area `31`/sigungu `13`, upsert raw festival payloads and `core.events` through `sync_kto_event_item`, and treat an empty future window as a successful zero-result.

Do not throw merely because every detail response is valid but empty. Finish with `partial` when some item errors exist and preserve the last valid policy when a later call fails. Keep content/crowd jobs compatible with the existing runner and update their metadata to use the same status vocabulary.

- [ ] **Step 5: Run local dry-run and unit verification**

Run: `npm test -- tests/pet-sync.test.ts`, `npm run sync:data -- --job pet --dry-run --limit 20`, `npm run sync:data -- --job events --dry-run`, and `npm run typecheck`.

Expected: the dry run prints candidate counts without writing candidate/core rows, and TypeScript passes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/kto/pet-sync.ts tests/pet-sync.test.ts scripts/sync-kto-data.ts package.json
git commit -m "feat: discover and enrich KTO pet candidates"
```

### Task 5: Align GitHub Actions schedules and health reporting

**Files:**
- Modify: `.github/workflows/kto-data-sync.yml`
- Modify: `scripts/verify-data-health.ts`
- Modify: `docs/github-actions-data-sync-runbook.md`

**Interfaces:**
- `workflow_dispatch.job` accepts `content|events|crowd|pet` and adds optional boolean `dry_run` and numeric `limit` inputs.
- Scheduled jobs map to `crowd` daily, `events` daily, `pet` daily discovery/enrichment, and `content` weekly; manual dispatch bypasses the Seoul-date guard.

- [ ] **Step 1: Add workflow structure checks**

Extend the existing verification or add a shell/YAML assertion that checks `workflow_dispatch`, the four schedules, `concurrency`, Node 22, `npm ci`, secret-backed environment variables, and the `--dry-run/--limit` argument wiring.

- [ ] **Step 2: Update the workflow**

Keep `permissions: contents: read`, the serial concurrency group, 30-minute timeout, IPv4-first Node option, and service-role-only runner. Pass dispatch inputs safely through the shell environment; do not echo values that could contain secrets. Preserve the existing notification job unchanged.

- [ ] **Step 3: Update health semantics and runbook**

Use the approved freshness windows: crowd 26 hours, events 48 hours, pet 8 days, general content 8 days. Treat `failed` and stale as failures, `partial` as a warning with an actionable error count, and valid zero-result pet detail calls as successful. Document the official pet base URL, the candidate lifecycle, quota/backoff behavior, and exact read-only SQL fields operators should inspect.

- [ ] **Step 4: Validate workflow and application checks**

Run: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run data:verify -- --job all`, and the available YAML parser/action structure check.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/kto-data-sync.yml scripts/verify-data-health.ts docs/github-actions-data-sync-runbook.md
git commit -m "ci: schedule resilient KTO discovery and health checks"
```

### Task 6: Map the additive contract into the web adapters

**Files:**
- Modify: `src/lib/places/types.ts`
- Modify: `src/lib/places/queries.ts`
- Modify: `src/lib/courses/types.ts`
- Modify: `src/lib/courses/queries.ts`
- Modify: `src/lib/crowd/queries.ts`
- Create: `tests/public-adapters.test.ts`

**Interfaces:**
- `ImportedPlace` gains `petPolicy`, `petNote`, `petDataStatus`, and `petSourceUpdatedAt`.
- `ServiceCourse.places` exposes the same pet fields; `ServiceCourse` retains `petReadyFlag` when available.
- `NowGoodSpot` gains `crowdDataStatus` and a forecast date while keeping `forecastScore`/`crowdLevel`.

- [ ] **Step 1: Write adapter tests**

Test that `unknown` remains `unknown`, a null pet row produces a safe `unknown`/`unavailable` state, secure image normalization is unchanged, and crowd copy is labeled as a forecast.

- [ ] **Step 2: Update public selects and mappers**

Select only the additive columns from the public views/RPCs, coerce numeric fields exactly as current adapters do, and never select `pet_note_raw`, `details_json`, or raw payloads for public pages.

- [ ] **Step 3: Run adapter and application checks**

Run: `npm test -- tests/public-adapters.test.ts`, `npm run typecheck`, `npm run lint`, and `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/places/types.ts src/lib/places/queries.ts src/lib/courses/types.ts src/lib/courses/queries.ts src/lib/crowd/queries.ts tests/public-adapters.test.ts
git commit -m "feat: consume additive pet and crowd public contract"
```

### Task 7: End-to-end contract and data verification

**Files:**
- Modify: `scripts/verify-public-boundary.ts`
- Modify: `scripts/verify-data-health.ts`
- Modify: `scripts/verify-sync-rpc.ts`
- Modify: `docs/database-guide-for-web.md`

- [ ] **Step 1: Add contract assertions**

Verify that anonymous clients can read only published serving views/RPCs, published place/course responses contain the additive fields, upcoming events contain only current/future rows, candidate rows remain absent, raw/core direct reads fail, and service-role sync functions remain callable.

- [ ] **Step 2: Run the complete verification set**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run public:verify
npm run sync:rpc:verify
npm run data:verify -- --job all
```

Expected: all commands pass or report only explicitly documented partial-source warnings; no command prints a key or service-role value.

- [ ] **Step 3: Update the database guide**

Document the candidate lifecycle, public additive contract, official pet endpoint, forecast semantics, and the rule that the mobile app consumes public RPCs rather than raw/core tables.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-public-boundary.ts scripts/verify-data-health.ts scripts/verify-sync-rpc.ts docs/database-guide-for-web.md
git commit -m "test: verify public contract and sync boundaries"
```
