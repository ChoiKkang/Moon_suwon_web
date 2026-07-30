# Service Webapp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** KTO 실데이터를 코스 목록, 스팟 상세, 관리자 콘텐츠 대시보드로 연결해 달빛수원을 서비스형 웹앱 형태로 만든다.

**Architecture:** `src/lib/places`에서 Supabase 공개 뷰 조회를 담당하고, `src/lib/courses`에서 서비스 코스 구성을 만든다. App Router 서버 컴포넌트가 데이터를 읽어 클라이언트 표시 컴포넌트로 넘긴다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Supabase REST Data API.

---

### Task 1: Course Data Model

**Files:**
- Create: `src/lib/courses/types.ts`
- Create: `src/lib/courses/catalog.ts`
- Modify: `src/lib/places/types.ts`
- Modify: `src/lib/places/queries.ts`

- [x] **Step 1:** `ImportedPlace`에 `lat`, `lng`, `contactPhone`을 추가한다.
- [x] **Step 2:** `getImportedPlaceBySlug(slug)`를 추가한다.
- [x] **Step 3:** `getServiceCourses(places)`로 3개 코스를 구성한다.
- [x] **Step 4:** `npm run typecheck`를 실행한다.

### Task 2: Courses Page

**Files:**
- Create: `src/app/courses/page.tsx`

- [x] **Step 1:** `getImportedPlaces()`로 실제 스팟을 읽는다.
- [x] **Step 2:** `getServiceCourses()`로 코스 카드를 렌더링한다.
- [x] **Step 3:** 각 KTO 스팟은 `/places/[slug]` 링크로 연결한다.
- [x] **Step 4:** `npm run typecheck`를 실행한다.

### Task 3: Place Detail Page

**Files:**
- Create: `src/app/places/[slug]/page.tsx`

- [x] **Step 1:** `params.slug`로 `getImportedPlaceBySlug()`를 호출한다.
- [x] **Step 2:** 장소가 없으면 `notFound()`를 호출한다.
- [x] **Step 3:** hero 이미지, 주소, 소개, KTO contentId, 코스 CTA를 표시한다.
- [x] **Step 4:** `npm run typecheck`를 실행한다.

### Task 4: Landing Navigation

**Files:**
- Modify: `src/components/landing-client.tsx`

- [x] **Step 1:** `href="#"` 메뉴를 `/courses`, `#kto-spots`, `/admin` 등 실제 목적지로 바꾼다.
- [x] **Step 2:** App Store/Google Play 버튼을 현재 MVP에 맞는 “코스 둘러보기”, “달빛 스팟 보기” CTA로 바꾼다.
- [x] **Step 3:** KTO 섹션에 `id="kto-spots"`를 추가한다.
- [x] **Step 4:** `npm run lint`를 실행한다.

### Task 5: Admin Content Dashboard

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/layout.tsx`

- [x] **Step 1:** 관리자 페이지에서 `getImportedPlaces()`를 호출한다.
- [x] **Step 2:** 하드코딩 KPI를 공개 스팟 수, hero 이미지 보유 수, 주소 보유 수, 운영 문구 보유 수로 교체한다.
- [x] **Step 3:** 하드코딩 활동 피드를 KTO 스팟 상태 리스트로 교체한다.
- [x] **Step 4:** 사이드바 `href="#"`를 실제 라우트 또는 `/courses` 링크로 교체한다.
- [x] **Step 5:** `npm run typecheck`를 실행한다.

### Task 6: Final Verification

**Files:**
- Modify: `docs/kto-content-verification-report.md`

- [x] **Step 1:** 서비스형 웹앱 구현 결과를 문서에 추가한다.
- [ ] **Step 2:** `npm run kto:verify`를 실행한다. (2026-07-30 재검증 미완: 샌드박스에서 tsx IPC 소켓 생성 불가)
- [x] **Step 3:** `npm run typecheck`를 실행한다.
- [x] **Step 4:** `npm run lint`를 실행한다.
- [ ] **Step 5:** `npm run build`를 실행한다. (2026-07-30 재검증 미완: 샌드박스 네트워크 차단으로 Google Fonts 다운로드 실패)
