# Deterministic Course Quality and AI-Assisted Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended; do not dispatch one unless explicitly authorized) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve course candidate quality with explicit constraints and evidence, then add an optional, schema-validated AI copy/reranking layer that can never invent places or publish automatically.

**Architecture:** A deterministic planner remains the source of route truth. It produces validated candidate IDs, ordered stops, distance kind, constraints, and evidence. An optional server-only copy provider receives only that validated structure; invalid or unavailable AI output falls back to deterministic copy. Every generated course remains an unpublished draft until an administrator reviews it.

**Tech Stack:** TypeScript, Node test runner, Supabase Postgres/RPC, Next.js server actions, GitHub Actions, existing course manager.

**Spec:** `docs/superpowers/specs/2026-09-18-public-data-app-admin-ai-design.md`

## Global Constraints

- Only published, active, coordinate-valid places can enter a public course candidate.
- Hard constraints are checked before and after any AI call.
- AI cannot create or alter place IDs, coordinates, operating facts, prices, distances, or pet policies.
- AI output is JSON-validated and evidence-linked; failure uses deterministic copy.
- Automated drafts always set `is_published=false`; an operator must publish them.
- Straight-line distance is labeled as an estimate unless an approved routing provider supplies a route.
- Do not add an unapproved external routing or AI provider key to the repository or browser.
- Keep the mobile app contract additive and do not modify the mobile repository.

---

### Task 1: Define validated planner input/output and hard constraints

**Files:**
- Modify: `src/lib/courses/draft-planner.ts`
- Create: `src/lib/courses/course-contract.ts`
- Modify: `tests/course-draft-planner.test.ts`

**Interfaces:**
- `CoursePlannerPlace` adds `petPolicy`, `petDataStatus`, `sourceModifiedAt`, `hasHeroImage`, and optional `opensAt`/`closesAt` fields while keeping existing fields.
- `CourseConstraintViolation = 'missing_coordinates' | 'unpublished_place' | 'duplicate_place' | 'route_too_long' | 'pet_policy_unknown' | 'stale_source' | 'missing_content'`.
- `CourseDraftPlan` adds `distanceKind: 'straight_line_estimate' | 'routed'`, `evidence: Array<{ placeId: string; reasons: string[] }>`, and `constraintViolations: CourseConstraintViolation[]`.
- `validateCourseCandidate(plan): { valid: boolean; violations: CourseConstraintViolation[] }`.

- [ ] **Step 1: Add failing planner tests**

Add tests for unpublished/stale/unknown-pet exclusion, duplicate IDs, invalid coordinates, maximum route distance, deterministic output regardless of input order, evidence for every stop, and `straight_line_estimate` labeling.

```ts
test('pet-ready candidates exclude unknown policy', () => {
  const validPlace: CoursePlannerPlace = {
    id: 'place-1', slug: 'place-1', displayName: '장소 1', lat: 37.28, lng: 127.01,
    petPolicy: 'unknown', petDataStatus: 'fresh', hasHeroImage: true,
  };
  const plans = planCourseDrafts([validPlace], { petOnly: true });
  assert.equal(plans.length, 0);
});
```

- [ ] **Step 2: Run the focused planner tests and confirm failure**

Run: `npm test -- tests/course-draft-planner.test.ts`.

Expected: FAIL because the new fields/options/validator do not exist.

- [ ] **Step 3: Implement deterministic scoring and validation**

Sort candidates by stable score and ID, use bounded nearest-neighbor selection, keep the three existing themes, reject hard violations, apply freshness/content penalties, and generate evidence reasons from actual fields. Never claim walking duration when `distanceKind` is straight-line.

- [ ] **Step 4: Run all planner tests**

Run: `npm test -- tests/course-draft-planner.test.ts` and `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/courses/draft-planner.ts src/lib/courses/course-contract.ts tests/course-draft-planner.test.ts
git commit -m "feat: enforce deterministic course constraints and evidence"
```

### Task 2: Store generation provenance and evidence safely

**Files:**
- Create: `supabase/migrations/20260918142000_course_quality_metadata.sql`
- Modify: `scripts/verify-course-serving.ts`
- Modify: `scripts/verify-public-boundary.ts`

**Interfaces:**
- `core.courses.automation_metadata jsonb not null default '{}'::jsonb` stores provider, model, prompt version, input checksum, distance kind, evidence, and constraint result.
- `raw.course_generation_runs(id uuid, source text, status text, model text, prompt_version text, input_checksum text, metadata jsonb, started_at timestamptz, completed_at timestamptz)` is service-role only.
- `public.admin_upsert_course` accepts `automation_metadata` and never changes a published generated course on a later automation run.

- [ ] **Step 1: Add failing provenance assertions**

Extend course verification to assert that generated drafts have `automation_source`, `automation_key`, and non-empty metadata, while anonymous course getters return only published courses.

- [ ] **Step 2: Run the verifier before the migration**

Run: `npm run course:verify`.

Expected: FAIL for generated rows without the new metadata contract.

- [ ] **Step 3: Write and apply the migration**

Create the generation-run table with service-role-only grants, add the course JSONB metadata column and an index on `(automation_source, automation_key)`, update `admin_upsert_course` to validate metadata shape and preserve published editorial decisions, and keep public views free of internal prompt/model details.

- [ ] **Step 4: Verify remote permissions and data**

Use the linked Supabase migration tool/MCP, then run `npm run course:verify` and `npm run public:verify`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260918142000_course_quality_metadata.sql scripts/verify-course-serving.ts scripts/verify-public-boundary.ts
git commit -m "feat: persist course generation provenance"
```

### Task 3: Feed freshness/pet/evidence into draft generation

**Files:**
- Modify: `scripts/generate-course-drafts.ts`
- Modify: `src/app/actions/admin.ts`
- Modify: `src/lib/admin/types.ts`
- Modify: `src/lib/admin/queries.ts`
- Create: `tests/course-draft-source.test.ts`

**Interfaces:**
- `buildPlannerPlaces(rows): CoursePlannerPlace[]` filters only active, published, coordinate-valid places and maps pet/freshness/content fields.
- `generateCourseDraftsAction()` continues to return `AdminActionResult & { generatedCount?: number }` and always writes unpublished drafts.
- `CourseInput` accepts `automationMetadata` only as server-generated provenance; clients cannot set `is_published=true` for an automated identity.

- [ ] **Step 1: Add source-shape tests**

Test that unpublished places, stale/unknown pet rows for pet-only themes, missing hero images, and missing copy are excluded or penalized according to the planner contract. Test that input order does not change `automationKey`.

- [ ] **Step 2: Update CLI and server action queries**

Select `pet_policy`, `data_status`, `last_checked_at`, `source_modified_at`, hero-image presence, and editorial copy. Compute a stable canonical JSON input and SHA-256 checksum before planning.

- [ ] **Step 3: Write generation-run metadata and drafts**

Start a generation run, call the deterministic planner, upsert each plan through `admin_upsert_course` with `automation_source='heuristic-v2'`, its stable `automation_key`, `distanceKind`, evidence, input checksum, and `is_published=false`, then finish the run with counts and violations. In `--dry-run`, write no rows and print only redacted summaries.

- [ ] **Step 4: Run source and CLI verification**

Run: `npm test -- tests/course-draft-source.test.ts`, `npm run course:drafts -- --dry-run --limit 3`, and `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-course-drafts.ts src/app/actions/admin.ts src/lib/admin/types.ts src/lib/admin/queries.ts tests/course-draft-source.test.ts
git commit -m "feat: generate evidence-backed unpublished course drafts"
```

### Task 4: Add provider-neutral, schema-validated AI copy support

**Files:**
- Create: `src/lib/courses/course-copy-schema.ts`
- Create: `src/lib/courses/ai-drafter.ts`
- Create: `tests/course-copy-schema.test.ts`
- Modify: `src/lib/env/server.ts`

**Interfaces:**
- `ValidatedCourseCandidate` contains only candidate place IDs, ordered evidence, verified facts, constraints, and `distanceKind`.
- `CourseCopyDraft = { title: string; subtitle: string; summary: string; stopReasons: Array<{ placeId: string; text: string }>; warnings: string[] }`.
- `CourseCopyProvider.generate(input: ValidatedCourseCandidate): Promise<CourseCopyDraft>`.
- `validateCourseCopy(input, output): { valid: boolean; errors: string[] }` rejects unknown IDs, changed facts/numbers, missing warnings, and unsupported claims.
- `DeterministicCourseCopyProvider` is always available; `COURSE_AI_ENABLED` defaults to `false`.

- [ ] **Step 1: Write schema/validator tests**

Test valid structured output, unknown place ID rejection, altered distance rejection, missing stop reason rejection, unsupported pet claim rejection, length limits, and deterministic fallback output.

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- tests/course-copy-schema.test.ts`.

Expected: FAIL because the schema/provider modules do not exist.

- [ ] **Step 3: Implement the deterministic provider and validator**

Generate copy from verified theme/place names and evidence only. Keep all free text from KTO marked as untrusted data. If `COURSE_AI_ENABLED=false`, never make a network request. If a future provider is enabled, require server-only configuration, a bounded timeout, structured JSON parsing, and the same validator before accepting output.

- [ ] **Step 4: Run focused and complete tests**

Run: `npm test -- tests/course-copy-schema.test.ts` and `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/courses/course-copy-schema.ts src/lib/courses/ai-drafter.ts tests/course-copy-schema.test.ts src/lib/env/server.ts
git commit -m "feat: add validated deterministic course copy provider"
```

### Task 5: Show evidence and route warnings in the course manager

**Files:**
- Modify: `src/lib/admin/types.ts`
- Modify: `src/lib/admin/queries.ts`
- Modify: `src/components/admin/course-manager.tsx`
- Modify: `src/app/admin/courses/page.tsx`
- Modify: `src/app/actions/admin.ts`

- [ ] **Step 1: Add admin view-model fields**

Expose `distanceKind`, `constraintViolations`, `evidence`, `automationSource`, `automationKey`, `promptVersion`, `model`, and `lastAutomatedAt` to authenticated admins only. Do not expose raw prompts or keys.

- [ ] **Step 2: Add review UI**

Show a route summary/map link, straight-line estimate warning, stop-by-stop evidence, pet/freshness status, and constraint violations beside the existing editor. Add a clear “검수 후 공개” label and keep auto-generated drafts unpublished until the existing explicit save/publish action is used.

- [ ] **Step 3: Enforce server-side publication rules**

Make `saveCourseAction` reject publication when an automated draft has unresolved hard violations or a stop is not active/published. Preserve the existing manual-course path and all current slug/UUID/length validation.

- [ ] **Step 4: Run web checks**

Run: `npm run typecheck`, `npm run lint`, `npm run build`, and manually verify `/admin/courses` with a generated draft and a manual course.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/types.ts src/lib/admin/queries.ts src/components/admin/course-manager.tsx src/app/admin/courses/page.tsx src/app/actions/admin.ts
git commit -m "feat: expose course evidence and review warnings"
```

### Task 6: Keep scheduled generation safe and verify quality gates

**Files:**
- Modify: `.github/workflows/course-drafts.yml`
- Modify: `scripts/verify-course-serving.ts`
- Modify: `docs/github-actions-data-sync-runbook.md`
- Modify: `docs/database-guide-for-web.md`

- [ ] **Step 1: Update the course workflow**

Keep weekly/manual execution, Node 22, concurrency, service-role secrets, `--dry-run` support, and the existing unpublished-only behavior. Do not add an auto-publish step or expose AI credentials. Preserve the existing notification job unchanged.

- [ ] **Step 2: Add deterministic quality checks**

Verify every generated course has unique published place IDs, a valid distance kind, no hard violations, an automation identity, evidence for every stop, and `is_published=false` until an admin action. Verify repeated runs do not create duplicates.

- [ ] **Step 3: Run the full quality gate**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run course:drafts -- --dry-run --limit 3
npm run course:verify
npm run public:verify
```

- [ ] **Step 4: Document AI safety and fallback**

Document that the deterministic planner is canonical, AI is disabled by default, model/provider configuration is server-only, every output is schema/evidence validated, and no AI result is published automatically.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/course-drafts.yml scripts/verify-course-serving.ts docs/github-actions-data-sync-runbook.md docs/database-guide-for-web.md
git commit -m "test: enforce safe course generation quality gates"
```
