# Discord Notifications, Course Draft Automation, and Service Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify Discord about CI/data jobs, generate reviewable course drafts from published places, and close the production data-boundary and operations gaps without changing the mobile app contract.

**Architecture:** GitHub Actions remains the scheduler. A small Node notifier posts sanitized status embeds to a repository secret-backed Discord incoming webhook, while a separate weekly workflow generates deterministic, unpublished course drafts through a service-role-only atomic RPC. Public clients continue to use serving views/RPCs; unpublished core/editorial records are not exposed through direct REST or public getter functions.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres/RPC, GitHub Actions, Discord incoming webhooks, Node 22, `tsx`, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-07-github-actions-data-sync-design.md`, `docs/superpowers/specs/2026-08-19-admin-operations-design.md`, and `AGENTS.md`.

## Global Constraints

- The web is a promotion site and admin console; the mobile app in `ChoiKkang/MoonSuwonApp` is not modified.
- Automated course generation creates drafts only; an administrator must review and publish.
- Discord credentials are never committed, printed, or stored in Vercel; only `DISCORD_WEBHOOK_URL` in GitHub Actions secrets is read at runtime.
- Public reads use curated serving views/RPCs and preserve existing mobile response shapes.
- Supabase DDL is applied through `supabase_apply_migration`; local migration history is already divergent, so do not run a blind `supabase db push`.

### Task 1: Define the atomic course-draft database contract

**Files:**
- Create: `supabase/migrations/20260918130000_course_automation_and_public_boundary.sql`
- Modify: `src/app/actions/admin.ts`
- Modify: `src/lib/admin/types.ts`

**Interfaces:**
- Produces `public.admin_upsert_course(p_payload jsonb) returns uuid`, callable only by `service_role`.
- Adds nullable `core.courses.automation_source`, `automation_key`, and `last_automated_at` plus a unique partial index on `(automation_source, automation_key)`.
- Replaces `get_course_by_slug`, `get_course_detail`, and `get_place_by_slug` so they require active, published places/courses while preserving JSON fields.

- [x] Add the additive course metadata columns and an idempotency index.
- [x] Implement `admin_upsert_course` as one transaction: validate UUIDs and at least one place, upsert course/copy/publish state, delete and replace links, and force `is_published=false` for automated payloads.
- [x] Revoke the RPC from `anon`/`authenticated`, grant it to `service_role`, and set a fixed search path.
- [x] Restrict public getter RPCs to publish state and active linked places; preserve existing return contracts.
- [x] Recreate `public.v_upcoming_events` with `security_invoker=true`, grant only upcoming event reads, and keep event writes service-role-only.
- [x] Update `saveCourseAction` to call the atomic RPC and map its existing validation payload; retain admin authorization and revalidation.
- [x] Add automation fields to `CourseInput`/`AdminCourse` only where the admin UI needs to display draft provenance.
- [x] Apply the migration remotely with project ref `feifvxhltehhsugizrob` and verify anonymous unpublished getters return no data while published serving views still work.

### Task 2: Build and test a deterministic course planner

**Files:**
- Create: `src/lib/courses/draft-planner.ts`
- Create: `tests/course-draft-planner.test.ts`

**Interfaces:**
- `CoursePlannerPlace` contains `id`, `slug`, `displayName`, `lat`, `lng`, `category`, `nightSuitabilityScore`, `recommendationBoost`, and `petReady`.
- `planCourseDrafts(places, options?)` returns deterministic `CourseDraftPlan[]` with `automationKey`, slug, title/copy, tags, ordered `placeIds`, duration, straight-line distance, and operations memo.

- [x] Write tests for deterministic ordering, duplicate suppression, minimum candidate count, coordinate validity, and maximum route distance.
- [x] Implement haversine distance and a bounded nearest-neighbor route with stable ID tie-breakers.
- [x] Generate at most three themed candidates from three-to-five published places; mark distance as a candidate estimate in the memo.
- [x] Run `npm test -- tests/course-draft-planner.test.ts` and confirm the planner tests pass.

### Task 3: Generate drafts from the production data pool

**Files:**
- Create: `scripts/generate-course-drafts.ts`
- Modify: `package.json`
- Modify: `src/app/actions/admin.ts`
- Modify: `src/components/admin/course-manager.tsx`
- Modify: `src/app/admin/courses/page.tsx`

**Interfaces:**
- CLI: `npm run course:drafts -- [--dry-run] [--limit N]`.
- Server action: `generateCourseDraftsAction(): Promise<AdminActionResult & { generatedCount?: number }>`.

- [x] Query only active, published places with coordinates and editorial scores using the service client.
- [x] Run the shared planner and upsert each plan through `admin_upsert_course` with `is_published=false` and provenance metadata.
- [x] Make repeated runs idempotent and report generated/updated counts without logging secrets.
- [x] Add an admin “자동 코스 초안 생성” button with pending state and an aria-live result; do not add an auto-publish control.
- [x] Add planner unit coverage for the production-shaped input and run the CLI in `--dry-run` mode.

### Task 4: Add scheduled workflows and Discord notifications

**Files:**
- Create: `scripts/notify-discord.ts`
- Create: `.github/workflows/course-drafts.yml`
- Modify: `.github/workflows/kto-data-sync.yml`
- Modify: `.github/workflows/web-quality.yml`
- Modify: `package.json`
- Modify: `docs/github-actions-data-sync-runbook.md`

**Interfaces:**
- CLI reads `DISCORD_WEBHOOK_URL`, `DISCORD_NOTIFICATION_TITLE`, `DISCORD_NOTIFICATION_STATUS`, `DISCORD_NOTIFICATION_URL`, and `DISCORD_NOTIFICATION_DETAILS`.
- Workflow jobs call the notifier under `if: always()` with `continue-on-error: true`.

- [x] Validate webhook host/URL, use a bounded `fetch`, set `allowed_mentions.parse=[]`, and never print the URL or response body.
- [x] Add success/failure notification jobs to KTO sync and web quality; include workflow link, ref, job, and compact counts.
- [x] Add a weekly/manual course-draft workflow with Node 22, Supabase secrets, concurrency, dry-run-safe execution, and Discord notification; it never publishes.
- [x] Document required GitHub secrets, including a newly rotated `DISCORD_WEBHOOK_URL`; do not add the exposed URL to the repository.
- [x] Test the notifier against a local mock endpoint and run YAML/actionlint-style structural checks available in the repository.

### Task 5: Reconcile stale sync runs and improve operations visibility

**Files:**
- Modify: `supabase/migrations/20260918130000_course_automation_and_public_boundary.sql`
- Modify: `scripts/sync-kto-data.ts`
- Modify: `src/lib/admin/types.ts`
- Modify: `src/lib/admin/queries.ts`
- Modify: `src/components/admin/operations-panel.tsx`

**Interfaces:**
- Adds service-role-only `public.sync_reconcile_stale_runs(p_max_age_minutes integer default 90) returns integer`.

- [x] Mark abandoned `running` rows older than the threshold as `failed`, set `completed_at`, and attach reconciliation metadata.
- [x] Invoke reconciliation at the start of every sync and surface failed/stale counts in the admin operations panel.
- [x] Keep raw tables service-role-only and preserve existing sync RPC names used by GitHub Actions.

### Task 6: Verify end-to-end service readiness

**Files:**
- Modify: `scripts/verify-data-health.ts` only if new checks need a stable CLI flag.
- Create: `scripts/verify-course-drafts.ts` if the existing course verifier cannot assert draft idempotency.
- Modify: `README.md` or the relevant runbooks with operator steps.

- [x] Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run data:verify -- --job all`, `npm run kto:verify`, `npm run course:verify`, `npm run admin:verify`, and `npm run sync:rpc:verify`.
- [x] Run the draft generator in dry-run and write modes, then confirm generated courses remain unpublished until an admin action.
- [x] Verify anonymous counts for published serving views, anonymous rejection of an unpublished course/place, and service-role access to the atomic RPC.
- [x] Verify GitHub workflow syntax and inspect the next workflow run/Discord delivery after the user adds the rotated secret.
- [x] Record any remaining external setup (Discord webhook rotation/secret entry, optional bot interactions) explicitly; webhook delivery was observed in web-quality, course-draft, and KTO failure runs; optional bot interactions remain out of scope.
