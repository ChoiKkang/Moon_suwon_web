# 달빛수원 운영보드 서비스화 설계

## 목표

현재 `/admin`을 공개 데이터의 상태만 보여주는 화면에서, 운영자가 실제 서비스 데이터를 안전하게 검수·편집·공개할 수 있는 운영 콘솔로 확장한다.

운영보드는 장소, 코스, 혼잡도, 동기화, 행사라는 다섯 가지 업무를 한 화면의 거대한 폼으로 섞지 않고, 업무별 화면과 공통 상태 컴포넌트로 분리한다. 공개 웹은 `public` serving view를 계속 읽고, 운영보드의 쓰기는 서버 전용 service-role client를 통해서만 수행한다.

## 현재 DB 계약

- 장소 원본: `core.places`, `core.place_sources`, `core.place_images`
- 장소 운영 문구: `editorial.place_copy`
- 장소 공개 상태: `editorial.place_publish_state`
- 코스 원본 및 순서: `core.courses`, `core.course_places`
- 코스 문구·공개 상태: `editorial.course_copy`, `editorial.course_publish_state`
- 혼잡도 예보: `core.place_crowd_forecasts`
- 행사: `core.events`
- 수집 이력: `raw.sync_runs`, `raw.sync_errors`
- 관리자 계정: `public.profiles.role`의 원격 값은 `USER`/`ADMIN` 대문자다. 기존 로컬 migration의 소문자 가정과 무관하게 앱 판정은 대소문자에 안전하게 만든다.

현재 원격 데이터는 장소 13개, 공개 상태 13개, 장소 문구 5개, 코스 2개, 코스-장소 연결 6개, 행사 6개, 혼잡도 224개, sync run 7개, sync error 6개다. 이 수치는 화면에 고정하지 않고 요청 시 조회한다.

## 접근 제어

1. `/admin` layout은 `auth.getUser()`와 `public.profiles.role`을 모두 확인한다.
2. 모든 Server Action은 UI에서 호출되는지와 무관하게 동일한 `requireAdmin()`을 다시 호출한다.
3. role 비교는 `String(role).toUpperCase() === 'ADMIN'`으로 하되, role을 앱에서 자동 승격하지 않는다. 첫 관리자 지정은 DB 소유자가 별도로 수행한다.
4. service-role key는 `src/lib/admin/server.ts`와 기존 KTO action 내부에서만 읽으며 클라이언트 번들·action 반환값에 포함하지 않는다.
5. Server Action 입력은 ID, 문자열 길이, 숫자 범위, 날짜 순서를 서버에서 검증한다. 클라이언트 폼 검증은 보조 수단일 뿐이다.

## 화면 구조

### `/admin`

운영자가 처음 보는 요약 화면이다.

- 공개 장소 / 비공개 장소 / 공개 코스 / 진행 중 행사 KPI
- 혼잡도 최신 예보 날짜와 stale 상태
- 최근 sync run 5건과 오류 수
- 최근 수정 장소·코스·행사 바로가기
- 각 KPI는 클릭 시 해당 관리 화면으로 이동한다.

### `/admin/places`

장소 공개와 문구를 담당한다.

- 전체 활성 장소를 공개/비공개 필터로 조회
- 공개 상태, 노출 우선순위, 지금 가기 좋은 스팟 활성화 토글
- `display_name`, `short_description`, `night_highlight`, `photo_tip`, `mission_title`, `mission_body`, `mission_prompt`, `couple_question`, `short_story` 편집
- 오른쪽 preview drawer에서 공개 상세 페이지와 카드 표시를 확인
- 원본 KTO 이름·주소·이미지·최종 수정 시각은 읽기 전용으로 표시
- 저장 후 `/`, `/courses`, `/places/[slug]`, `/admin`을 재검증

### `/admin/courses`

코스 생성·수정과 공개 순서를 담당한다.

- slug, 태그, 예상 시간, 거리, 추천 시작 시간, 반려동물 준비 여부 편집
- 코스 제목·부제·동선 요약·OG 문구 편집
- 활성 공개 장소를 선택하고 드래그 대신 위/아래 버튼으로 순서 조정
- 새 코스는 비공개 상태로 생성
- 공개 토글과 홈 노출 우선순위 편집
- 저장 시 course row, copy row, publish state row, course_places를 순서대로 갱신하고 중복 장소·빈 코스를 차단

### `/admin/operations`

혼잡도와 수집 상태를 읽기 쉽게 확인한다.

- 혼잡도: 오늘/최근 예보 수, `여유`·`보통`·`혼잡` 분포, 최신 `source_updated_at`, 24시간 이상 지난 데이터 경고
- 장소별 최신 예보와 공개 여부 매칭
- sync run: source, status, fetched/upserted/error 수, 시작·완료 시간, metadata 요약
- sync error: endpoint, content ID, error code, 메시지, 발생 시간, 연결된 run
- 오류 메시지 원문은 접거나 펼칠 수 있고, service key 미승인 오류는 운영 안내 문구를 함께 표시
- 이 화면은 현재 읽기 전용이다. 원천 수집 재실행은 기존 수집 파이프라인의 책임 범위로 둔다.

### `/admin/events`

`core.events`의 행사 레코드를 관리한다.

- 행사명, 기간, 장소, 주소, 좌표, 대표 이미지, 연락처, 운영 시간, 이용 요금, 프로그램 원문 편집
- `event_content_id`를 기준으로 기존 행사를 수정하고, 새 수동 행사는 `manual-<slug>` 형태의 ID를 사용
- 시작일이 종료일보다 늦으면 저장하지 않음
- 삭제는 확인 단계를 거치며, 삭제 후 공개 이벤트 조회 경로가 있다면 함께 재검증
- 현재/예정/종료 필터와 원본 수정 시각 표시

## 데이터 흐름

```text
Server Component / Client Form
          │
          ▼
      Server Action ── requireAdmin() ── Supabase service-role client
          │                                     │
          │                                     ├─ core
          │                                     ├─ editorial
          │                                     └─ raw (read-only)
          ▼
   revalidatePath(public + admin routes)
```

관리자 조회는 `src/lib/admin/queries.ts`에 모으고, 쓰기 작업은 `src/app/actions/admin.ts`에 모은다. KTO 수집 action은 기존 API 동작을 유지하되 공통 `requireAdmin()`을 사용한다.

## UI 원칙

- 기존 Manrope·달빛 골드·딥 네이비 토큰을 유지한다.
- 테이블, 탭, 상태 badge, preview drawer, inline form을 Tailwind와 Lucide로 직접 구성한다. 새 UI 프레임워크와 큰 애니메이션 의존성은 추가하지 않는다.
- 데이터가 없는 경우 숫자 `0`만 보여주지 않고 원인과 다음 행동을 함께 표시한다.
- 저장 중에는 버튼을 잠그고, 성공·실패 결과를 폼 가까이에 표시한다.
- 키보드 포커스, label 연결, `aria-live`, 모바일 가로 스크롤을 보장한다.
- 운영 화면에서는 호버 효과보다 정보 밀도와 오류 가시성을 우선한다.

## 출시 기준

1. 로그인한 `USER`는 `/admin`과 모든 admin action에서 거부된다.
2. `ADMIN`은 `/admin`, 장소·코스·운영·행사 화면을 볼 수 있다.
3. 장소 공개/비공개 전환과 editorial 저장 결과가 공개 웹에 반영된다.
4. 코스를 생성하고 장소 순서를 바꾼 뒤 공개할 수 있다.
5. 혼잡도와 sync 오류 이력은 원격 DB의 실제 행을 보여준다.
6. 행사 6개를 조회하고 한 건을 수정·복구할 수 있다.
7. typecheck, lint, webpack build, production route smoke test, admin read/write smoke test가 통과한다.

## 범위 밖

- role을 자동으로 ADMIN으로 승격하는 기능
- 원천 KTO sync를 새로 실행하는 스케줄러나 retry worker
- raw 테이블의 데이터 정정·삭제
- Supabase Advisor의 기존 전체 보안 경고 일괄 해결
