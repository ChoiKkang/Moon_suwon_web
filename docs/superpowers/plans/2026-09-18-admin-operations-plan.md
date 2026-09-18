# Admin Operations and Review Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give administrators one responsive, accessible console for KTO candidate review, data freshness, sync failures, manual overrides, and publication decisions.

**Architecture:** The server-side admin layer continues to authenticate with `requireAdmin()` and read/write through the service-role client. Candidate and audit metadata are private; the browser receives only summarized rows and explicit actions. GitHub Actions remains the scheduler, while the console links to the workflow instead of storing a GitHub token.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres, server actions, Tailwind CSS, Lucide icons, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-18-public-data-app-admin-ai-design.md`

## Global Constraints

- Execute only for authenticated `ADMIN` users through `requireAdmin()`.
- Do not expose raw KTO payloads, service-role credentials, GitHub tokens, or API keys to the browser.
- Approval changes editorial/publication state; collection success alone never publishes a candidate.
- Manual pet overrides must survive every automated sync and show their owner/time.
- Keep the existing moonlight navy/gold visual language and use text plus icon plus color for statuses.
- Preserve existing place/course/event edit flows and public contracts.
- Do not change webhook/Discord behavior.

---

### Task 1: Add review state and private audit records

**Files:**
- Create: `supabase/migrations/20260918141000_admin_review_audit.sql`
- Modify: `scripts/verify-public-boundary.ts`

**Interfaces:**
- `core.place_sources.ingestion_status` is `candidate|approved|rejected|stale`.
- `audit.admin_events(id uuid, actor_id uuid, entity_type text, entity_id uuid, action text, metadata jsonb, created_at timestamptz)` is service-role/admin-server readable only.
- `public.admin_record_audit(p_entity_type text, p_entity_id uuid, p_action text, p_metadata jsonb) returns uuid` is service-role only.

- [ ] **Step 1: Add failing privilege assertions**

Extend the public boundary script to assert that anonymous clients cannot select `audit.admin_events`, cannot call `admin_record_audit`, and cannot see a candidate through `public.v_published_places` or `get_place_by_slug`.

- [ ] **Step 2: Run the assertion before migration**

Run: `npm run public:verify`.

Expected: FAIL because the audit schema/function and candidate lifecycle columns do not exist yet.

- [ ] **Step 3: Write and apply the migration**

Create the private audit table and indexes, consume the `core.place_sources.ingestion_status` lifecycle columns from the data-contract plan, enable RLS, revoke all anonymous/authenticated access, and grant the audit RPC only to `service_role`. Add a check constraint for the four ingestion states and a partial index for candidate/stale rows only if the preceding data-contract migration has not already created them.

Use the linked Supabase migration tool/MCP with project ref `feifvxhltehhsugizrob`; do not use an unreviewed full-history push.

- [ ] **Step 4: Verify privileges and public exclusion**

Run: `npm run public:verify` and `npm run sync:rpc:verify`.

Expected: audit/candidate data is private and existing published rows remain readable.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260918141000_admin_review_audit.sql scripts/verify-public-boundary.ts
git commit -m "feat: add private candidate review and audit state"
```

### Task 2: Extend admin query models and server actions

**Files:**
- Modify: `src/lib/admin/types.ts`
- Modify: `src/lib/admin/queries.ts`
- Modify: `src/app/actions/admin.ts`
- Create: `tests/admin-review.test.ts`

**Interfaces:**
- `AdminCandidate` contains `placeId`, `displayName`, `officialName`, `ktoContentId`, `ingestionStatus`, `firstSeenAt`, `lastSeenAt`, `petPolicy`, `petDataStatus`, `petNote`, `sourceModifiedAt`, `hasCoordinates`, `hasHeroImage`, and `isPublished`.
- `AdminSourceHealth` contains `source`, `lastStatus`, `lastCompletedAt`, `freshness`, `fetched`, `upserted`, `errors`, and `metadata`.
- `getAdminCandidates(filter?: CandidateFilter): Promise<AdminQueryResult<AdminCandidate[]>>` is server-only.
- `getAdminCandidateDetail(placeId: string): Promise<AdminQueryResult<AdminCandidateDetail | null>>` returns a redacted normalized/raw summary only after `requireAdmin()`.
- `reviewPlaceCandidateAction(input: { placeId: string; decision: 'approve' | 'reject' | 'hold'; note?: string }): Promise<AdminActionResult>` records the audit event and never auto-approves a course.
- `setPetPolicyOverrideAction(input: { placeId: string; policy: PetPolicy; note: string | null }): Promise<AdminActionResult>` sets `is_manual_override=true` and records the actor/time.
- `resetPetPolicyOverrideAction(placeId: string): Promise<AdminActionResult>` clears the override flag and leaves the latest source value intact.

- [ ] **Step 1: Write pure mapping/action validation tests**

Test candidate status filters, UUID validation, allowed decision values, policy enum validation, and the rule that `unknown` is not rewritten to `partial`.

```ts
test('rejects an invalid review decision', () => {
  assert.equal(validateReviewDecision('publish'), false);
});
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test -- tests/admin-review.test.ts`.

Expected: FAIL because the new types/validators do not exist.

- [ ] **Step 3: Add private query joins**

Extend `getAdminDashboardData`/`getAdminOperations` with source health, candidate counts, pet policy coverage, stale rows, and the latest 50 actionable sync errors. Query raw payloads only for an authenticated admin detail request and return a redacted summary by default.

- [ ] **Step 4: Add guarded server actions**

Use `requireAdmin()`, validate UUID/text lengths, update only the intended source/editorial/pet rows, call `admin_record_audit`, and revalidate `/admin`, `/admin/places`, `/admin/operations`, and the affected public slug after approval. A rejected candidate stays non-public and is recoverable; it is not hard-deleted.

- [ ] **Step 5: Run tests and type checks**

Run: `npm test -- tests/admin-review.test.ts`, `npm run typecheck`, and `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/types.ts src/lib/admin/queries.ts src/app/actions/admin.ts tests/admin-review.test.ts
git commit -m "feat: add admin candidate review actions"
```

### Task 3: Build the operations dashboard and candidate inbox

**Files:**
- Create: `src/components/admin/admin-data-state.tsx`
- Create: `src/components/admin/source-health-grid.tsx`
- Create: `src/components/admin/candidate-review-panel.tsx`
- Modify: `src/components/admin/operations-panel.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/operations/page.tsx`
- Modify: `src/app/admin/places/page.tsx`
- Modify: `src/components/admin/place-manager.tsx`

**Interfaces:**
- `AdminDataState` renders `loading`, `empty`, `partial`, `stale`, `error`, and `ready` states with a text label and next action.
- `SourceHealthGrid` consumes `AdminSourceHealth[]` and links each source to its filtered run/error view.
- `CandidateReviewPanel` consumes `AdminCandidate[]` and emits the two server actions without exposing raw payloads by default.

- [ ] **Step 1: Add component-level state fixtures**

Create a small fixture object in `tests/admin-review.test.ts` and assert that each state has a non-empty Korean label and actionable button text (`다시 시도`, `검수 열기`, or `워크플로 열기`).

- [ ] **Step 2: Implement shared status presentation**

Use `AdminStatusBadge` with status text and icons. Add explicit freshness copy such as `신선`, `오래됨`, `부분 성공`, `실패`, and `검수 대기`; never rely on color alone. Keep the existing `KTO_SYNC_WORKFLOW_URL` link as the safe manual runner path.

- [ ] **Step 3: Add the candidate inbox**

Add filters for `candidate`, `stale`, `unknown`, `failed`, and `all`; search by name/slug/KTO ID; show source modified time, last checked time, pet status, coordinates/image completeness, and publication status. The detail panel shows a map link, normalized values, selected raw pet note fields, and approve/reject/hold/override actions.

- [ ] **Step 4: Add operations health cards**

Show last successful run, current freshness SLA, candidate count, pet policy coverage, stale count, and actionable error count on the dashboard. Keep the existing crowd distribution and run/error tabs, but label their data as forecasts and distinguish `partial` from `failed`.

- [ ] **Step 5: Verify responsive/admin flows**

Run: `npm run typecheck`, `npm run lint`, and `npm run build`. Start the app and manually verify `/admin`, `/admin/operations`, and `/admin/places` at desktop and narrow viewport widths; confirm keyboard focus reaches filters, tables, details, and action buttons.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/admin-data-state.tsx src/components/admin/source-health-grid.tsx src/components/admin/candidate-review-panel.tsx src/components/admin/operations-panel.tsx src/app/admin/page.tsx src/app/admin/operations/page.tsx src/app/admin/places/page.tsx src/components/admin/place-manager.tsx
git commit -m "feat: add candidate inbox and sync health dashboard"
```

### Task 4: Add manual override editor and audit visibility

**Files:**
- Modify: `src/components/admin/place-manager.tsx`
- Modify: `src/lib/admin/queries.ts`
- Modify: `src/lib/admin/types.ts`
- Modify: `src/app/admin/places/page.tsx`

- [ ] **Step 1: Add override form validation**

Require a valid policy enum, cap the operator note at 240 characters, and show the existing source value beside the override. Add a test that a later source update does not replace an override in the displayed data model.

- [ ] **Step 2: Implement override and reset controls**

Add `수동 정책 적용` and `자동값으로 되돌리기` controls. The reset action clears `is_manual_override` and leaves the most recent source value intact; both actions record an audit event and revalidate the place page.

- [ ] **Step 3: Add audit summary**

Show the latest actor, action, and timestamp for a candidate/place without exposing the entire audit table. Add a link to the operations error/run context when the last source check failed.

- [ ] **Step 4: Run checks and commit**

Run: `npm test -- tests/admin-review.test.ts`, `npm run typecheck`, `npm run lint`, and `npm run build`.

```bash
git add src/components/admin/place-manager.tsx src/lib/admin/queries.ts src/lib/admin/types.ts src/app/admin/places/page.tsx
git commit -m "feat: manage pet overrides with audit context"
```

### Task 5: Apply design tokens, accessibility states, and final admin verification

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/admin/admin-status-badge.tsx`
- Modify: `src/app/admin/layout.tsx`
- Modify: `docs/database-guide-for-web.md`
- Modify: `docs/github-actions-data-sync-runbook.md`

- [ ] **Step 1: Add shared CSS tokens**

Define CSS variables for success/warning/danger/muted surfaces, panel borders, focus rings, and reduced-motion behavior. Replace duplicated status colors in new components with the tokens while preserving the existing navy/gold palette.

- [ ] **Step 2: Verify accessibility states**

Check heading order, `aria-live` result messages, labels for search/filter controls, keyboard-visible focus, table-to-card overflow behavior, and reduced-motion rendering. Do not remove existing focus-visible rules.

- [ ] **Step 3: Run the complete web verification set**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run admin:verify
npm run public:verify
```

- [ ] **Step 4: Document operator flow**

Document how to interpret each source status, approve/reject a candidate, apply/reset a pet override, and manually open the GitHub Actions workflow without storing credentials in the web app.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/admin/admin-status-badge.tsx src/app/admin/layout.tsx docs/database-guide-for-web.md docs/github-actions-data-sync-runbook.md
git commit -m "refactor: standardize admin status and accessibility states"
```
