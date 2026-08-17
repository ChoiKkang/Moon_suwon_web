# 달빛수원 서비스 준비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unsupported login behavior, make public places and published courses DB-driven, eliminate misleading demo metrics, and leave a verified service-ready local build.

**Architecture:** Keep Supabase as the source of truth. Public places come from `public.v_imported_places`; published courses are composed from `core.courses`, `core.course_places`, `editorial.course_copy`, and `editorial.course_publish_state`. Next.js Server Components fetch data through focused query adapters, while the client UI only renders returned records and explicit empty/error states.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `@supabase/ssr`, Supabase Postgres/Data API, Next Server Actions, Tailwind CSS.

## Global Constraints

- Do not commit `.env.local`, Apple `.p8` keys, or generated Apple JWTs.
- Do not overwrite remote course rows or friend-owned migrations; code must tolerate empty course tables.
- Only Kakao and Apple login buttons may be exposed.
- Public UI must not display fabricated visitor counts, ratings, or a hardcoded DB row limit.
- Use webpack for local `dev` and production `build` because Turbopack currently exhausts this 8GB Mac's process resources.

### Task 1: Restore local Apple inputs and remove Naver login

**Files:**
- Modify: `.env.local` (ignored local file; never stage)
- Modify: `src/app/actions/auth.ts`
- Modify: `src/components/auth/social-login-buttons.tsx`
- Test: Supabase Auth authorize endpoints and `npm run typecheck`

**Interfaces:**
- `SupportedProvider` becomes `'kakao' | 'apple'`.
- `signInWithOAuth(provider)` remains the single Server Action entry point.

- [ ] **Step 1: Add the four Apple generator variables to `.env.local` using the values already documented in `docs/apple-signin-setup-runbook.md`; keep the file ignored.**
- [ ] **Step 2: Remove `naver` from the provider type, provider scope map, UI type assertions, and Naver button.**
- [ ] **Step 3: Run `npm run apple:secret` without printing the JWT; confirm it exits successfully and report the manual Supabase Dashboard Secret Key step.**
- [ ] **Step 4: Run a read-only provider smoke check: Kakao must return HTTP 302, Apple must be rechecked after the user registers the generated JWT, and no Naver UI reference may remain.**

### Task 2: Make place data complete and freshness-aware

**Files:**
- Modify: `src/lib/places/types.ts`
- Modify: `src/lib/places/queries.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/places/[slug]/page.tsx`
- Modify: `src/app/admin/page.tsx`
- Test: `npm run kto:verify`, route smoke tests, TypeScript

**Interfaces:**
- `ImportedPlace` includes `id`, `heroThumbnailUrl`, and `sourceModifiedAt`.
- `getImportedPlaces()` returns all active rows from `public.v_imported_places` without `.limit(12)`.
- `getImportedPlaceBySlug()` returns the same expanded shape.

- [ ] **Step 1: Add the new view columns to the row type and select list.**
- [ ] **Step 2: Remove the fixed 12-row limit and preserve deterministic display ordering.**
- [ ] **Step 3: Render missing image/description/contact fields as explicit neutral states and show `sourceModifiedAt` as a `최종 확인` value in the detail and admin views when present.**
- [ ] **Step 4: Verify the current remote view returns all 13 rows and the home/admin/detail routes render without errors.**

### Task 3: Replace hardcoded courses with a published-course query adapter

**Files:**
- Create: `src/lib/courses/queries.ts`
- Modify: `src/lib/courses/types.ts`
- Modify: `src/app/courses/page.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/components/landing-client.tsx`
- Retire: `src/lib/courses/catalog.ts` after all imports are removed
- Test: `npm run typecheck`, `npm run build`, and `npm run kto:verify` against the current remote DB; add a focused `scripts/verify-course-serving.ts` smoke script for published-course row mapping

**Interfaces:**
- `getPublishedCourses()` returns `{ courses, error }`.
- A course is public only when its publish row has `is_published = true` and its copy row exists.
- Course place ordering comes from `core.course_places.order_index`; place content comes from the expanded `ImportedPlace` map.

- [ ] **Step 1: Implement parallel reads for course metadata, editorial copy, publish state, and ordered place links through the appropriate Supabase schemas.**
- [ ] **Step 2: Map rows into a UI-safe `ServiceCourse` shape and drop unpublished or missing-copy rows.**
- [ ] **Step 3: Replace `getServiceCourses()` calls with `getPublishedCourses()` and add an honest empty state because the current DB has zero courses.**
- [ ] **Step 4: Remove the hardcoded three-course catalog once no code imports it.**
- [ ] **Step 5: Create `scripts/verify-course-serving.ts` to print the number of published courses and their ordered place counts, then run it against the remote DB.**

### Task 4: Remove misleading hardcoded operational metrics and unsupported UI

**Files:**
- Modify: `src/components/landing-client.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/components/admin/kto-import-panel.tsx`
- Test: lint and rendered HTML marker checks

- [ ] **Step 1: Replace the hardcoded `12개 스팟` badge with the actual returned place count.**
- [ ] **Step 2: Replace `50k+` and `4.9/5` with truthful DB-derived counts or neutral product facts.**
- [ ] **Step 3: Keep intentional brand narrative and static design assets, but remove copy that claims unverified adoption or rating data.**
- [ ] **Step 4: Ensure empty/error states are visible and do not claim data is live when the DB is empty.**

### Task 5: Stabilize local scripts and document external release gates

**Files:**
- Modify: `package.json`
- Modify: `.env.local.example`
- Modify: `docs/apple-signin-setup-runbook.md`
- Create: `docs/superpowers/plans/2026-08-17-service-readiness-plan.md` (this plan)
- Test: `npm run typecheck`, `npm run lint`, `npm run build -- --webpack`

- [ ] **Step 1: Set `dev` and `build` scripts to use webpack explicitly.**
- [ ] **Step 2: Keep the Apple variables documented without adding any secret value to the example file.**
- [ ] **Step 3: Document the manual Apple Dashboard registration and production environment requirements.**
- [ ] **Step 4: Record that remote Supabase migrations are ahead of this repository and must be synchronized by the DB owner before deployment.**

### Task 6: End-to-end verification and handoff

- [ ] **Step 1: Run `npm run kto:verify` and confirm the current public DB row count.**
- [ ] **Step 2: Run `npm run typecheck`, `npm run lint`, and `npm run build`.**
- [ ] **Step 3: Start `npm run dev`, smoke-test `/`, `/courses`, `/places/banghwasuryujeong`, `/privacy`, `/terms`, `/account`, and `/admin`.**
- [ ] **Step 4: Recheck Supabase Auth provider status and report Apple Dashboard registration as the only external manual blocker if it remains.**
- [ ] **Step 5: Verify `git status` and summarize changed files, remaining DB/security advisor issues, and release steps.**
