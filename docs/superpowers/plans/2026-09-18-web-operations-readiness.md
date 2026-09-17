# Web Operations Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web repository safer to operate before the Vercel launch by keeping public-data verification on the public access path, adding repeatable web CI checks, and exposing the existing GitHub Actions sync workflow from the admin console without putting privileged credentials in the web app.

**Architecture:** Keep the Next.js public site and admin console read/write boundaries unchanged. GitHub Actions remains the only scheduled/manual data-sync runner; the admin console links operators to that workflow and continues to display sync health read-only. Public-serving verification uses the Supabase anonymous key and public view, while server-side sync continues to use the service-role key in GitHub Actions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS, Tailwind CSS, GitHub Actions, npm.

**Spec:** Conversation audit for web-only launch readiness and the repository `AGENTS.md` project-role constraints.

## Global Constraints

- Modify only the MoonSuwon web repository; do not edit or clone the mobile-app repository.
- Do not write production Supabase data, dispatch GitHub workflows, change Vercel settings, or expose any secret from this workspace.
- Preserve the existing public/admin data contracts and the distinction between daily KTO visit-concentration forecasts and real-time crowd measurements.
- Run the repository verification commands after implementation and report any external prerequisite that remains blocked.

---

## Task 1: Correct public-serving verification credentials

- [x] Update `scripts/verify-kto-serving.ts` to always read `NEXT_PUBLIC_SUPABASE_ANON_KEY` when checking `v_imported_places`; never fall back to the service-role key.
- [x] Make the script error/help text state that it verifies the public anonymous view path.
- [x] Run `npm run kto:verify` and confirm it returns rows without requiring a service-role grant.

## Task 2: Add web quality CI

- [x] Add `.github/workflows/web-quality.yml` for pull requests and pushes to `main`.
- [x] Use Node.js 22, `npm ci`, and harmless CI-only public Supabase placeholders.
- [x] Run `npm run typecheck`, `npm run lint`, and `npm run build` in the workflow.
- [x] Validate the workflow file structure locally and run the same three commands locally.

## Task 3: Make manual data operations discoverable in the admin console

- [x] Add a read-only “GitHub Actions 수동 동기화” section to `OperationsPanel` with the repository workflow link and explicit content/crowd/pet job guidance.
- [x] Explain that workflow dispatch requires GitHub access and that the web app intentionally does not hold a GitHub token.
- [x] Keep the existing crowd/runs/errors tabs and health calculations unchanged.
- [x] Run typecheck, lint, and build after the component change.

## Task 4: Remove misleading KTO real-time wording

- [x] Replace “실시간 KTO 데이터 수집” wording in `KTOImportPanel` with “KTO 원천 데이터 조회/승인” wording.
- [x] Keep the panel’s actual on-demand API preview and approval behavior unchanged.
- [x] Update the sync runbook with the known crowd 403 interpretation, safe secret checks, and the exact post-rerun SQL checks.

## Task 5: Final verification and handoff

- [x] Run `npm run kto:verify`, `npm run course:verify`, `npm run admin:verify`, and `npm run sync:rpc:verify` with the local environment.
- [x] Run `git diff --check` and inspect the final diff for accidental secrets or mobile-repository changes.
- [x] Report the code changes, verification evidence, and remaining Vercel/KTO external actions without claiming a deployment occurred.

## Post-plan verification (2026-09-18)

The user later requested the targeted data repairs and end-to-end readiness work described in the handoff. Those follow-up changes were applied in the web repository and to the linked Supabase project:

- Added the public upcoming-events view and exposed four current events on the public home page.
- Normalized stored KTO image URLs to HTTPS and removed normalized duplicate image rows.
- Published the existing `paldalmun` place after verifying its KTO detail response; its page now serves a valid image placeholder because KTO has no gallery image for it.
- Added course/public-data integrity guards, client-error telemetry, route smoke checks, dependency/script approvals, and sync retries/health summaries.
- Verified `npm run data:verify -- --job all`, `npm run course:verify`, `npm run kto:verify`, `npm run build`, and the production route smoke check.

The remote migration history is still divergent from this checkout, so `supabase db push` should not be run blindly. The two new migrations were applied idempotently with the linked SQL runner; reconcile migration history separately before a future full push.
