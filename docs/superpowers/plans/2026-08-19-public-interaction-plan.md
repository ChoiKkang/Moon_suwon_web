# Public Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 실데이터 공개 웹에 가볍고 접근 가능한 이미지·스크롤·상태 인터랙션을 추가해 탐색성을 높인다.

**Architecture:** 새 애니메이션 패키지 없이 `globals.css`에 모션 토큰과 reduced-motion 규칙을 추가하고, 공개 카드에 재사용 가능한 CSS class를 적용한다. Server Component의 DB 조회와 데이터 계약은 유지하고, Client Component는 시각 상태와 링크 탐색만 담당한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, CSS keyframes, Lucide.

**Spec:** `docs/superpowers/specs/2026-08-19-public-interaction-design.md`

## Global Constraints

- WebGL, 3D, canvas, 자동재생 영상, 무한 marquee, scroll hijacking, custom cursor를 추가하지 않는다.
- 공개 콘텐츠는 `public.v_published_places`, `public.v_home_courses`, `public.v_now_good_spot_candidates`에서 받은 값만 사용한다.
- 이미지가 없는 레코드는 aspect ratio를 유지하는 placeholder를 사용한다.
- `prefers-reduced-motion: reduce`에서 모든 장식 모션을 비활성화한다.
- 모바일 390px 폭에서 body-level horizontal overflow를 만들지 않는다.
- 공개 웹의 숫자·평점·코스 정보는 하드코딩하지 않는다.

## Execution Status (2026-08-19)

- [x] CSS-only reveal, ambient glow, image reveal, responsive scroll rail, crowd status pill을 추가했다.
- [x] 홈·코스·장소 상세에서 실제 DB 코스 2개·공개 스팟 7개·예보 7개가 렌더링되는 것을 Chrome/Orca accessibility snapshot으로 확인했다.
- [x] `npm run kto:verify`, `npm run course:verify`, `npm run typecheck`, `npm run lint`, `npm run build`를 통과했다.
- [x] production route smoke: `/` 200, `/courses` 200, published detail 200, unpublished detail 404.
- [ ] `agent-browser` 실행 파일이 환경에 없어 Chrome/Orca computer-use를 fallback으로 사용했다. 별도 390px viewport 자동 검증은 아직 남아 있다.

---

### Task 1: Add the motion and surface utility layer

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- CSS utilities: `.motion-reveal`, `.image-reveal`, `.ambient-glow`, `.scroll-rail`, `.status-pulse`.

- [ ] **Step 1: Add scoped motion keyframes and utility classes.**

Define opacity/translate reveal, subtle image scale, gold shimmer, and ambient radial utilities. Use class names that do not affect admin surfaces unless explicitly applied.

- [ ] **Step 2: Add reduced-motion and focus-visible rules.**

Set transitions/animations to none under `@media (prefers-reduced-motion: reduce)` and add a visible gold focus ring for links, buttons, and form controls.

- [ ] **Step 3: Add shared CSS variables for public cards.**

Keep the existing palette and add variables for card border, muted text, success, warning, error, and surface overlay. Do not introduce a second color system.

- [ ] **Step 4: Run the baseline CSS check.**

Run: `npm run typecheck`

Expected: exit code 0 because this task changes only CSS/layout classes.

### Task 2: Add reusable public visual components

**Files:**
- Create: `src/components/public/section-heading.tsx`
- Create: `src/components/public/media-card.tsx`
- Create: `src/components/public/status-pill.tsx`
- Create: `src/components/public/scroll-rail.tsx`

**Interfaces:**
- `SectionHeading({ eyebrow, title, description, action })`
- `MediaCard({ href, title, description, imageUrl, eyebrow, meta, children })`
- `StatusPill({ level, label })`
- `ScrollRail({ children, label })`

- [ ] **Step 1: Implement `SectionHeading` as a server-safe presentational component.**

Render heading hierarchy, optional description, and an accessible action link without client state.

- [ ] **Step 2: Implement `MediaCard` with stable image fallback.**

Use a `div` background image only when an image URL exists, otherwise render a neutral placeholder. Apply `image-reveal` classes and preserve a stable aspect ratio. The entire card must remain a normal link.

- [ ] **Step 3: Implement `StatusPill` with text plus color.**

Map crowd levels to `여유`, `보통`, `혼잡`, and `예보 확인 중`. Add `aria-label` and avoid color-only meaning.

- [ ] **Step 4: Implement `ScrollRail` with CSS scroll snap.**

Use a semantic list wrapper with `overflow-x-auto`, `snap-x`, and a responsive desktop grid class. Do not auto-scroll or use a client hook.

- [ ] **Step 5: Run component checks.**

Run: `npm run typecheck && npm run lint`

Expected: exit code 0 with no new warnings.

### Task 3: Refresh the landing page interactions

**Files:**
- Modify: `src/components/landing-client.tsx`
- Modify: `src/app/page.tsx` only if a missing presentation prop must be added

- [ ] **Step 1: Apply the editorial hero treatment.**

Add a layered ambient backdrop, one-time reveal classes, a compact live data line, and a visible primary CTA. Keep the existing login behavior and actual place count.

- [ ] **Step 2: Replace repeated card markup with `MediaCard`.**

Use the component for course cards, crowd cards, and KTO place cards while preserving each card’s actual href and text. Keep explicit loading/error/empty states.

- [ ] **Step 3: Add the crowd `StatusPill` and score treatment.**

Use `StatusPill` for each `NowGoodSpot`. Render the numeric forecast score only when present and label it as a supporting forecast value.

- [ ] **Step 4: Add the course and crowd scroll rails.**

Use `ScrollRail` on narrow screens and keep the existing desktop grid. Add an edge fade that is decorative only and does not capture pointer events.

- [ ] **Step 5: Add subtle section reveal classes.**

Apply staggered classes to section headings/cards without JavaScript intersection observers. The content must be visible if animation CSS is unavailable.

- [ ] **Step 6: Run landing checks.**

Run: `npm run typecheck && npm run lint`

Expected: exit code 0. Existing `<img>` optimization warnings should not increase.

### Task 4: Refresh courses and place detail pages

**Files:**
- Modify: `src/app/courses/page.tsx`
- Modify: `src/app/places/[slug]/page.tsx`
- Modify: `src/lib/courses/queries.ts` only if the detail data contract needs a safe fallback

- [ ] **Step 1: Apply the course page visual system.**

Use `SectionHeading`, `MediaCard`, route metadata pills, and a responsive card rail. Keep live DB titles, place order, and honest empty/error states.

- [ ] **Step 2: Remove the hardcoded course claim from place detail.**

Replace the sentence claiming every place belongs to “성곽 야경 입문 코스” with a generic CTA or a DB-derived course list. Do not claim a relation that is not returned by Supabase.

- [ ] **Step 3: Add detail image reveal and information hierarchy.**

Apply hero reveal, focus-visible link styles, and compact info cards while preserving all address/coordinate/contact/freshness fields.

- [ ] **Step 4: Verify public content markers.**

Run: `npm run course:verify && npm run typecheck && npm run lint`

Expected: the two current remote courses and their place counts print correctly, and static checks pass.

### Task 5: Verify responsive rendering and release safety

**Files:**
- Modify: `docs/database-guide-for-web.md` only if public component behavior needs documentation

- [ ] **Step 1: Run production build.**

Run: `npm run build`

Expected: webpack build exits 0.

- [ ] **Step 2: Start the production server and check routes.**

Run: `npm run start -- -p 3001`, then request `/`, `/courses`, a published `/places/[slug]`, and an unpublished slug. Expected: 200, 200, 200, and 404 respectively.

- [ ] **Step 3: Run browser verification.**

Use `agent-browser open http://localhost:3001`, wait for network idle, take an annotated screenshot, inspect interactive elements, evaluate the absence of `[data-nextjs-dialog]`, and verify `document.body.innerText.trim().length > 0`.

- [ ] **Step 4: Check mobile overflow and motion preference.**

Use browser evaluation at a 390px viewport to confirm `document.documentElement.scrollWidth <= window.innerWidth + 1`. Add a temporary reduced-motion emulation only if supported by the tool and verify the page remains readable.

- [ ] **Step 5: Run final diff checks.**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intended files plus pre-existing `jira_docs/` appear.
