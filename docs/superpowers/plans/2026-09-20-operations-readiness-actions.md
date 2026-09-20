# Operations Readiness Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the approved public-data integrations toward production operation while making synchronization, review holds, and user-facing accessibility issues visible and safe.

**Architecture:** Keep all provider credentials and synchronization writes in GitHub Actions/service-role jobs. The public site continues to receive only approved, published records; the admin console receives operational links and server-provided health/hold metadata. DB review state is inspected read-only and never auto-promoted.

**Tech Stack:** Next.js/React/TypeScript, Node test runner via `tsx`, GitHub Actions, Supabase RPCs and migrations, `gh` CLI.

**Spec:** User request in this task: execute four approved operations, identify DB operational holds, and verify what may be shown publicly versus what still requires review.

## Global Constraints

- Preserve the mobile-app data contract and do not modify the separate mobile repository.
- Keep unapproved, pending, held, excluded, stale, or unmatched source data out of public responses.
- Preserve the user's unrelated `local_docs/` working-tree changes.
- Provider-specific production secrets must be validated without printing secret values.
- Run the full existing test, lint, typecheck, build, boundary, admin, and data-health checks before claiming readiness.
- The user explicitly selected inline execution; do not dispatch subagents or create a worktree.

## Review Focus

- A scheduled weather job with a missing KMA key must fail fast instead of silently using the KTO compatibility key; covered by the workflow secret-validation diff and dry-run/remote workflow verification.
- A bus job with zero reviewed station mappings must remain an explicit operational hold; covered by existing health tests and the DB hold report.
- Pending/held/excluded review rows must not appear in public serving RPCs; covered by existing public-boundary verification and status classification.
- The mobile navigation control must have an accessible name and state; covered by source-level accessibility assertions and browser smoke.
- Public API links in the admin console must route to the correct workflow; covered by the admin UI source test and browser smoke.

---

### Task 1: Harden approved public-data workflow credentials

**Files:**
- Modify: `.github/workflows/public-data-sync.yml`
- Test: `tests/admin-api-ledger.test.ts` (workflow contract assertions)

**Interfaces:**
- Consumes: matrix job id (`weather_short`, `weather_mid`, `bus_arrival`, or KTO-backed job).
- Produces: fail-fast provider-specific secret validation while retaining the existing compatibility key for KTO-backed jobs.

- [ ] **Step 1: Write the failing contract assertion** for provider-specific validation and run the focused test.
- [ ] **Step 2: Update the workflow validation shell case** so weather jobs require `KMA_SERVICE_KEY`, bus requires `GG_BUS_SERVICE_KEY`, and the remaining jobs require `KTO_SERVICE_KEY`.
- [ ] **Step 3: Run the focused test, local weather dry-runs, and inspect the rendered YAML.**

### Task 2: Expose every approved sync operation in the admin console

**Files:**
- Modify: `src/components/admin/operations-panel.tsx`
- Test: `tests/admin-api-ledger.test.ts`

**Interfaces:**
- Consumes: the server-provided 14-row API ledger and fixed public/KTO workflow URLs.
- Produces: correct manual links for all approved public-data jobs, with an explicit bus mapping hold note and review-only note.

- [ ] **Step 1: Add a failing source-level assertion** that the public workflow URL and all nine public job ids appear in the console.
- [ ] **Step 2: Add the public workflow link/job cards** while keeping the existing KTO cards and read-only security boundary.
- [ ] **Step 3: Run the focused test and typecheck.**

### Task 3: Fix high-impact public accessibility findings

**Files:**
- Modify: `src/components/landing-client.tsx`
- Modify: `src/components/public/scroll-rail.tsx`
- Test: `tests/admin-api-ledger.test.ts` (source contract assertions)

**Interfaces:**
- Consumes: existing menu state and labelled content rails.
- Produces: named/toggled mobile navigation control, semantic list rails, and sufficient footer/legal-copy contrast.

- [ ] **Step 1: Add failing assertions** for the mobile button name/state, list role, and contrast class.
- [ ] **Step 2: Implement the smallest JSX/class changes.**
- [ ] **Step 3: Run focused tests and browser/axe smoke at desktop and 390px widths.**

### Task 4: Execute operational verification and classify DB holds

**Files:**
- Read-only checks: Supabase RPC/data queries, `scripts/verify-data-health.ts`, `scripts/verify-public-boundary.ts`, `scripts/verify-admin-serving.ts`.
- No data-promotion migration is allowed for this task.

**Interfaces:**
- Consumes: current Supabase project data and API registry.
- Produces: a dated list of healthy, public-safe, admin-only, and operationally held datasets with counts and representative rows.

- [ ] **Step 1: Query API registry, sync health, review statuses, place coverage, bus mappings, and cross-scope Durunubi rows without exposing secrets.**
- [ ] **Step 2: Run all local dry-runs and verification scripts.**
- [ ] **Step 3: After code verification, commit/push the approved source and workflow changes, inspect remote Actions workflow/secrets by name, and dispatch only a safe weather verification run if the workflow and required secrets are present.**
- [ ] **Step 4: Report what may be shown publicly versus what stays admin-only/held, and record any external deployment blocker (domain or production credentials) explicitly.**
