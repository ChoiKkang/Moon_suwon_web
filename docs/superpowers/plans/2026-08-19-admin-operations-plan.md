# Admin Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공개 상태, editorial 문구, 코스, 혼잡도, sync 이력, 행사를 실제 Supabase 데이터로 운영할 수 있는 관리자 콘솔을 만든다.

**Architecture:** `src/lib/admin/server.ts`가 인증·권한·service-role 경계를 담당하고, `src/lib/admin/queries.ts`가 운영 화면에 필요한 정규화 데이터를 반환한다. `src/app/actions/admin.ts`의 Server Action은 서버에서 입력을 검증한 뒤 core/editorial 테이블을 갱신하고 공개·관리자 경로를 재검증한다. 운영 UI는 업무별 route와 Client Component로 나눈다.

**Tech Stack:** Next.js 16 App Router, React 19 Server Actions, TypeScript, Tailwind CSS v4, Lucide, Supabase SSR + service-role client.

**Spec:** `docs/superpowers/specs/2026-08-19-admin-operations-design.md`

## Global Constraints

- 관리자 판정은 `public.profiles.role`을 대소문자에 안전하게 비교하며 앱에서 role을 자동 승격하지 않는다.
- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용 파일과 Server Action에서만 사용하고 클라이언트 props·반환값에 넣지 않는다.
- 모든 Server Action은 `requireAdmin()`과 서버 입력 검증을 수행한다.
- 새 UI 프레임워크, 차트 라이브러리, 모션 라이브러리를 추가하지 않는다.
- raw sync 테이블은 운영 화면에서 읽기 전용이다.
- 코스 새 생성은 비공개로 시작하며 공개 장소만 코스 연결 후보로 제공한다.
- 성공 주장 전에는 `npm run typecheck`, `npm run lint`, `npm run build`, read/write smoke test를 새로 실행한다.

## Execution Status (2026-08-19)

- [x] 관리자 인증 경계, 장소·코스·행사 action, 다섯 개 운영 route를 구현했다.
- [x] `npm run typecheck`, `npm run lint`(0 errors, existing 4 image warnings), `npm run build`를 통과했다.
- [x] 익명 admin route는 `/`로 307 redirect되는 것을 확인했다.
- [x] 원격 `profiles.role`을 `USER`/`ADMIN` 계약으로 정규화하는 migration을 적용하고 check constraint를 확인했다.
- [ ] 실제 ADMIN 세션의 create/update/delete smoke는 현재 원격 프로필 2개가 모두 `USER`라 첫 관리자 지정 후 재검증해야 한다.
- [ ] `npm run admin:verify`는 로컬 `.env.local`에 서버 전용 service-role key가 없어 실행하지 못했다. 원격 read-only count는 Supabase MCP로 확인했다.

---

### Task 1: Create the admin server boundary and normalized types

**Files:**
- Create: `src/lib/admin/types.ts`
- Create: `src/lib/admin/server.ts`
- Create: `src/lib/admin/queries.ts`
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/app/actions/kto.ts`

**Interfaces:**
- `requireAdmin(): Promise<{ user: User; adminClient: SupabaseClient }>` throws an authorization error for anonymous or non-admin users.
- `getAdminDashboardData(): Promise<AdminDashboardData>` returns places, courses, events, crowd summary, recent sync runs, and sync errors.
- `getAdminPlaces()`, `getAdminCourses()`, `getAdminEvents()`, and `getAdminOperations()` return only serializable view models.

- [ ] **Step 1: Define serializable admin view models and action result types.**

Create `src/lib/admin/types.ts` with `AdminPlace`, `AdminPlaceCopy`, `AdminCourse`, `AdminCoursePlace`, `AdminEvent`, `AdminCrowdSummary`, `AdminSyncRun`, `AdminSyncError`, `AdminDashboardData`, and:

```ts
export type AdminActionResult =
  | { success: true; message: string }
  | { success: false; error: string; field?: string };
```

Every numeric database value is converted to `number` and every timestamp remains an ISO string before returning to a component.

- [ ] **Step 2: Implement `requireAdmin()` and `getAdminClient()`.**

Read the signed-in user through `createClient()` from `src/lib/supabase/server.ts`, read `profiles.role`, and accept only:

```ts
String(profile.role ?? '').toUpperCase() === 'ADMIN'
```

Create the service client with `persistSession: false`. Do not export the service client from a file imported by a Client Component.

- [ ] **Step 3: Implement read queries against the remote schema contracts.**

Use the service client after `requireAdmin()` and query:

```ts
core.places
editorial.place_publish_state
editorial.place_copy
core.courses
core.course_places
editorial.course_copy
editorial.course_publish_state
core.events
core.place_crowd_forecasts
raw.sync_runs
raw.sync_errors
```

Merge rows by UUID in TypeScript. For operations, query the latest 30 runs and latest 50 errors ordered by their timestamp. Mark a forecast stale when the latest source timestamp is older than 36 hours or the latest forecast date is before today in `Asia/Seoul`.

- [ ] **Step 4: Gate the admin layout with the shared guard.**

Replace the layout's login-only check with `await requireAdmin()`. Keep unauthenticated users redirected to `/`; redirect authenticated non-admin users to `/?auth-error=true` so they are not shown an admin screen.

- [ ] **Step 5: Reuse the guard in the KTO import action.**

Remove the local lower-case role comparison from `src/app/actions/kto.ts` and import `requireAdmin` and `getAdminClient` from the shared server module. Preserve the current KTO API behavior and return shape.

- [ ] **Step 6: Run the first type boundary check.**

Run: `npm run typecheck`

Expected: exit code 0. If the remote view types are not yet used by this task, keep the new admin query functions unreferenced but type-safe until the route tasks wire them in.

### Task 2: Add validated admin mutations

**Files:**
- Create: `src/app/actions/admin.ts`
- Modify: `src/lib/admin/types.ts`

**Interfaces:**
- `updatePlacePublishStateAction(input: PlacePublishInput): Promise<AdminActionResult>`
- `updatePlaceCopyAction(input: PlaceCopyInput): Promise<AdminActionResult>`
- `saveCourseAction(input: CourseInput): Promise<AdminActionResult & { courseId?: string }>`
- `saveEventAction(input: EventInput): Promise<AdminActionResult & { eventId?: string }>`
- `deleteEventAction(eventId: string): Promise<AdminActionResult>`

- [ ] **Step 1: Add shared input validators.**

Reject empty IDs, strings over their documented field limits, non-finite numbers, scores outside `0..100`, negative priorities, and invalid dates. The course validator must reject duplicate place IDs and fewer than one place. The event validator must reject `startDate > endDate`.

- [ ] **Step 2: Implement place publish state upsert.**

Use `editorial.place_publish_state.upsert(..., { onConflict: 'place_id' })` with the current admin user as `updated_by`. Set `published_at` to the current timestamp when publishing and `null` when unpublishing. Revalidate `/`, `/courses`, `/admin`, `/admin/places`, and the affected detail route after the write.

- [ ] **Step 3: Implement editorial copy upsert.**

Upsert `editorial.place_copy` by `place_id` with only the allowed fields. Never accept `updated_by` or arbitrary table names from the client. Revalidate the affected `/places/[slug]`, `/`, and admin routes.

- [ ] **Step 4: Implement course save with ordered links.**

For a new course, insert `core.courses` and retain its generated ID. For an existing course, update by ID. Upsert `editorial.course_copy` and `editorial.course_publish_state` using that ID; force `is_published: false` for new courses. Delete the course's current `core.course_places` rows and insert the validated ordered list with `order_index` starting at 0. If a write fails, return a user-safe message and do not expose database details.

- [ ] **Step 5: Implement event save and delete.**

Use `event_content_id` as the conflict key for save. Allow `manual-<slug>` IDs for new records, preserve KTO IDs for imported records, and revalidate `/admin/events`, `/admin`, and any public event route if one exists. Delete only after `requireAdmin()` and a valid UUID check.

- [ ] **Step 6: Run action type checks.**

Run: `npm run typecheck`

Expected: exit code 0 with no `any` introduced in the new action module.

### Task 3: Replace the admin shell and dashboard

**Files:**
- Modify: `src/app/admin/layout.tsx`
- Modify: `src/app/admin/page.tsx`
- Create: `src/components/admin/admin-status-badge.tsx`

**Interfaces:**
- Dashboard page consumes `getAdminDashboardData()`.
- Sidebar links point to `/admin`, `/admin/places`, `/admin/courses`, `/admin/operations`, and `/admin/events`.

- [ ] **Step 1: Build a real navigation shell.**

Keep the existing 280px desktop sidebar and add a compact mobile top navigation with the same destinations. Replace the misleading “새 코스 추가” link to public `/courses` with `/admin/courses?new=1`.

- [ ] **Step 2: Render live dashboard KPIs.**

Show counts for total active places, published places, published courses, current/upcoming events, stale crowd rows, and recent sync errors. Each KPI links to the owning admin route and uses `AdminStatusBadge` for status.

- [ ] **Step 3: Add recent operational activity cards.**

Render the five latest sync runs, the five newest errors, and a list of places missing hero/copy data. Use explicit empty/error states instead of fabricated values.

- [ ] **Step 4: Correct stale copy.**

Replace `public.v_imported_places 기준` on the published KPI with the actual source description and remove any label that claims every public place has an editorial copy.

- [ ] **Step 5: Run route type checks.**

Run: `npm run typecheck`

Expected: exit code 0.

### Task 4: Build the place publishing and editorial manager

**Files:**
- Create: `src/app/admin/places/page.tsx`
- Create: `src/components/admin/place-manager.tsx`
- Create: `src/components/admin/place-preview-drawer.tsx`
- Modify: `src/app/admin/layout.tsx`

**Interfaces:**
- `PlaceManager` receives `AdminPlace[]` and invokes the two place actions.
- The drawer receives one `AdminPlace` and displays public preview data without service credentials.

- [ ] **Step 1: Add filters and status summary.**

Provide all/published/unpublished/missing-copy filters, a search input, and a summary row with counts. Keep filtering client-side over the already authorized serializable dataset.

- [ ] **Step 2: Add publish and recommendation controls.**

Each row shows the current public status, numeric display priority, and a button to toggle `is_published` plus `is_now_good_enabled`. Submit only the ID and changed values to the action and disable the row controls during the transition.

- [ ] **Step 3: Add the editorial form.**

Use labeled inputs/textareas for `display_name`, `short_description`, `night_highlight`, `photo_tip`, `mission_title`, `mission_body`, `mission_prompt`, `couple_question`, and `short_story`. Keep the original KTO fields read-only beside the form.

- [ ] **Step 4: Add a preview drawer and feedback.**

The preview must show hero fallback, public title, one-line description, night highlight, and publish status. Announce save success/failure in an `aria-live` region and refresh the server-rendered list after success.

- [ ] **Step 5: Verify the place route statically.**

Run: `npm run typecheck && npm run lint`

Expected: exit code 0. Existing raw `<img>` warnings may remain until the KTO panel is handled; no new lint errors are allowed.

### Task 5: Build the course manager

**Files:**
- Create: `src/app/admin/courses/page.tsx`
- Create: `src/components/admin/course-manager.tsx`
- Modify: `src/lib/admin/queries.ts`

**Interfaces:**
- `CourseManager` receives `AdminCourse[]` and active `AdminPlace[]`.
- The form maps to `CourseInput` and saves through `saveCourseAction`.

- [ ] **Step 1: Add course list and create state.**

Render all courses with public/private status, place count, priority, and updated timestamp. A `?new=1` query opens a blank form with publication disabled.

- [ ] **Step 2: Add course metadata and editorial fields.**

Collect slug, theme tags, duration, distance, recommended start time, pet-ready flag, hero title, subtitle, route summary, OG title, OG description, and OG image URL. Mark slug and title required.

- [ ] **Step 3: Add ordered place selection.**

Only show active places in the selector. Use accessible add/remove buttons and up/down controls; prevent duplicates and prevent saving an empty route.

- [ ] **Step 4: Add publication controls.**

Show `is_published`, `display_priority`, and operations memo. A course can only be published when it has copy and at least one place. Make the validation message visible before submit and enforce it again in the action.

- [ ] **Step 5: Verify course mapping.**

Run: `npm run course:verify && npm run typecheck`

Expected: the existing two remote courses print their ordered place counts and TypeScript passes.

### Task 6: Build operations and event management screens

**Files:**
- Create: `src/app/admin/operations/page.tsx`
- Create: `src/components/admin/operations-panel.tsx`
- Create: `src/app/admin/events/page.tsx`
- Create: `src/components/admin/event-manager.tsx`
- Modify: `src/lib/admin/queries.ts`

**Interfaces:**
- `OperationsPanel` consumes `AdminCrowdSummary`, `AdminSyncRun[]`, and `AdminSyncError[]`.
- `EventManager` consumes `AdminEvent[]` and invokes `saveEventAction`/`deleteEventAction`.

- [ ] **Step 1: Render crowd health.**

Show latest forecast date, latest source update, total rows, counts by crowd level, stale badge, and a table of public places missing today’s forecast. Do not allow direct forecast editing from this page.

- [ ] **Step 2: Render sync runs and errors.**

Use tabs or sections for runs/errors. Show status badge, source, fetched/upserted/error counts, timestamps, endpoint, content ID, code, and a collapsible full message. Include an explicit “원천 API 재실행은 수집 파이프라인에서 처리” note.

- [ ] **Step 3: Render event filters and form.**

Filter current/upcoming/ended events, display date range and source. The form covers every non-system column in `core.events`; keep `id`, `created_at`, `updated_at` read-only.

- [ ] **Step 4: Add event create/update/delete feedback.**

Use `startTransition`, disable submit/delete while pending, require confirmation for delete, and refresh the event list after a successful action.

- [ ] **Step 5: Run type and lint checks.**

Run: `npm run typecheck && npm run lint`

Expected: exit code 0 except for the already-known image optimization warnings.

### Task 7: Add admin data smoke verification and documentation

**Files:**
- Create: `scripts/verify-admin-serving.ts`
- Modify: `docs/database-guide-for-web.md`
- Modify: `docs/supabase-database-audit-2026-08-17.md`

- [ ] **Step 1: Add a read-only admin data verification script.**

Load `.env.local` through `@next/env`, create a service client, and print counts for places/publish states/copy/courses/course links/events/forecasts/sync runs/errors. Exit non-zero when any required table query fails; never print keys or user emails.

- [ ] **Step 2: Document the new routes and manual admin role gate.**

Add the five admin screens, action behavior, current uppercase role contract, and the exact manual prerequisite that one trusted profile must be set to `ADMIN` by the DB owner.

- [ ] **Step 3: Run data verification.**

Run: `npm run admin:verify`

Expected: current remote counts include 13 places, 2 courses, 6 events, 224 forecasts, 7 sync runs, and 6 sync errors, subject to concurrent ingestion changes.

### Task 8: End-to-end verification

**Files:**
- Modify: `package.json` only if the verification script needs a new `admin:verify` entry

- [ ] **Step 1: Run static checks.**

Run: `npm run typecheck && npm run lint && npm run build`

Expected: all commands exit 0. Record warnings separately from errors.

- [ ] **Step 2: Run the production server.**

Run: `npm run start -- -p 3001` after the build, then verify `/`, `/courses`, `/admin`, `/admin/places`, `/admin/courses`, `/admin/operations`, and `/admin/events` respond. Anonymous admin routes must redirect.

- [ ] **Step 3: Run browser verification.**

Use `agent-browser open http://localhost:3001`, wait for network idle, inspect the snapshot, evaluate the absence of `[data-nextjs-dialog]`, and verify the home page contains meaningful content. Close the browser after the check.

- [ ] **Step 4: Run the final diff and status audit.**

Run: `git diff --check && git status --short`

Expected: no whitespace errors, only intended tracked files plus the pre-existing untracked `jira_docs/` directory.
