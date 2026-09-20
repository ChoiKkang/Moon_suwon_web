# Web Subcontent and Service Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the web as a trustworthy promotional and operations surface while making the approved mission, story, related-place, weather, and conditional bus content discoverable to visitors; give operators a single coverage view for the same content; finish with evidence-backed user/admin service verification.

**Architecture:** Keep the existing public RPC as the only source for place-detail extras. Parse its additive JSON blocks in a server-only adapter, hide empty or stale-sensitive blocks instead of inventing copy, and render small server-rendered sections in the existing landing/place pages. Extend the existing service-role admin coverage query with editorial and approved API coverage counts. Do not modify the mobile app repository, its DTOs, or the public RPC contract.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Supabase SSR/RPC, Node test runner via `tsx`.

**Spec:** `docs/superpowers/specs/2026-09-21-dalbit-suwon-subcontent-app-contract-design.md`

## Global Constraints

- Work on `codex/web-subcontent-service-review`; do not commit directly to `main`.
- Preserve the three unrelated modified files under `local_docs/` and never stage them.
- Web remains a public promotional website plus an authenticated admin console. Do not reproduce app-only GPS progress, rewards, or course state on the web.
- Reuse only published/approved RPC and view data. Never expose raw, candidate, visitor-statistics, or unapproved API rows to anonymous users.
- Keep empty/stale/expired public blocks honest. In particular, never call a daily crowd forecast live occupancy and never show bus arrivals after the five-minute contract window.
- Do not add a new secret or expose service-role credentials. `NEXT_PUBLIC_APP_STORE_URL` is optional; without it, the CTA must point to a real support contact rather than a false store link.

## Review Focus

- Visitor: can a first-time visitor understand the night-tour value, find a route, discover a mission/story, reach a map, and know when data is unavailable?
- Operator: can an administrator see which approved APIs actually fill user-facing content, which blocks are empty, and which queues remain before publication?
- Reliability: server-side data fetches fail independently so one optional enrichment failure does not blank the place page.
- Accessibility: keyboard-visible links, meaningful headings, labels for status, and no information conveyed by color alone.

---

## Task 1: Add a typed public-place extras adapter (TDD)

**Files:** `tests/public-place-extras.test.ts`, `src/lib/places/public-extras.ts`, `src/lib/places/queries.ts`

1. Write failing tests for `parsePublicPlaceExtras` covering:
   - mission/couple fields are trimmed and preserved;
   - related, weather, and bus blocks normalize malformed or missing values to empty `items` and `unknown` status;
   - numeric values accept JSON numbers or numeric strings and invalid values become `null`;
   - a `stale` related block remains usable, while expired/empty bus data remains empty.
2. Run `npm test -- --test-name-pattern="public place extras"` and confirm the new tests fail because the adapter does not exist.
3. Implement the pure parser and the `getPublicPlaceExtras(slug)` server query. Try NFC/NFD slug variants, call `public.get_place_by_slug`, and return `{ extras: null, error }` on RPC failure without throwing.
4. Run the focused test and `npm run typecheck`.

## Task 2: Add visitor-facing app continuation and story content (TDD)

**Files:** `tests/public-ux-content.test.ts`, `src/components/public/app-cta.tsx`, `src/components/landing-client.tsx`, `src/app/places/[slug]/page.tsx`

1. Add failing pure assertions for the app CTA URL policy and the weather/bus display predicates (store URL only when it is a valid absolute URL; bus only when it has items and is not expired).
2. Run the focused test and confirm RED.
3. Add the reusable CTA. Use `NEXT_PUBLIC_APP_STORE_URL` when configured; otherwise use a real `mailto:hynjni7890@gmail.com` support link labelled as an app-release inquiry, never as a download link.
4. Add a compact “정조의 밤 4막” story rail on the landing page from published places that already have `shortStory`; link every card to its place detail and keep it hidden when no approved story exists.
5. In the place page, fetch audio, courses, and public extras in parallel. Render, only when populated:
   - mission prompt/couple question with an app-continuation CTA;
   - a weather snapshot with freshness wording;
   - bus arrivals only for fresh/stale non-empty rows, with a five-minute/운영시간 안내;
   - approved related places as “이어서 걸을 곳”.
6. Keep the existing address/map links and all existing empty/error fallbacks. Run focused tests, `npm run typecheck`, and `npm run lint`.

## Task 3: Expose approved-content coverage in the operations console (TDD)

**Files:** `tests/admin-content-coverage.test.ts`, `src/lib/admin/types.ts`, `src/lib/admin/queries.ts`, `src/components/admin/operations-panel.tsx`

1. Write failing tests for a pure coverage mapper that treats mission prompt+type, story, approved related rows, approved photos/wellness, approved bus mappings, and current short-weather rows as separate coverage signals.
2. Run the focused test and confirm RED.
3. Extend the existing `AdminEnrichmentCoverage` shape and `buildEnrichmentCoverage` queries with those approved/public-facing signals. Keep query failures non-fatal to the operations page and retain the existing audio/accessibility/pet cards.
4. Render the cards in the existing Content Coverage section with explicit notes for known zero states (for example, “승인 사진 0건 — 후보 828건은 공개하지 않음”, “수원 교차 두루누비 0건은 정상 보류”). Do not add an operator mutation to this read-only audit.
5. Run focused tests, `npm run typecheck`, and `npm run lint`.

## Task 4: Execute the service-wide verification

**Files:** no production edits expected; record evidence in the final response and, if useful, `docs/superpowers/plans/` only.

1. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
2. Run read-only DB/contract checks: `npm run public:verify`, `npm run data:verify`, `npm run course:verify`, `npm run admin:verify`, and `npm run sync:rpc:verify`. Do not run ingestion or mutation jobs as part of verification.
3. Start the dev server and use the installed browser verification flow for `/`, `/courses`, one published `/places/[slug]`, `/events`, and unauthenticated `/admin`; check mobile-width layout, headings/links, optional-block hiding, and no uncaught console/runtime errors.
4. Review the admin route guard, API ledger, content coverage, course pending queue, bus mapping status, and zero-result APIs from the operator perspective. Treat missing credentials or unavailable external production data as a documented blocker, not as a fabricated success.
5. Perform a manual diff/security review: no `local_docs/` files staged, no secrets in diff, no app-repository changes, no raw table reads in public components, and no destructive migration.

## Task 5: Finish the branch safely

1. Run `git diff --check` and `git status --short`.
2. Commit only the implementation, tests, plan, and documentation files created for this task; leave pre-existing `local_docs/` modifications untouched.
3. Do not merge or push to `main` without a separate explicit request. Report the branch, commit, verification results, production-deployment limitation, and the remaining approved zero-coverage queues.
