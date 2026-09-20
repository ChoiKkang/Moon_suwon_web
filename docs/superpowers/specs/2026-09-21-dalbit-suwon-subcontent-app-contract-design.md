# 달빛수원 서브콘텐츠와 모바일 앱 계약 연동 설계

## 상태와 검토 범위

- 상태: 설계 검토용 초안
- 작성일: 2026-09-21
- 웹/DB 저장소: `moon_suwon` `main`
- 앱 검토 대상: `ChoiKkang/MoonSuwonApp` `develop` 브랜치, 커밋 `4a2ee4c`
- 검토 방법: Flutter/Dart 소스, Supabase migration, 앱 설계 문서와 웹 DB/API 계약을 정적으로 대조
- 제외: `flutter run`, iOS/Android 시뮬레이터, 앱 저장소 코드·마이그레이션 수정

이 문서는 달빛수원의 핵심 콘셉트(한국관광공사 OpenAPI + 혼잡도 예측 + 정조 스토리 기반 야간 동선)를 앱이 실제로 소비할 수 있는 형태로 정리한다. 웹은 홍보·운영 콘솔이고 앱이 주 사용자 경험이므로, 앱에 이미 존재하는 계약을 우선 재사용하고 새 계약은 additive(기존 키 삭제·이름 변경 없음) 원칙으로 제한한다.

## 1. 앱 정적 검토 결과

### 1.1 앱에서 이미 호출하는 공개 RPC

| 기능 | RPC | 앱 위치 | 앱에서 쓰는 핵심 필드 |
|---|---|---|---|
| 홈 추천 코스 | `public.get_home_courses(p_limit)` | `CourseRepositorySupabase` → `HomeCourseDto` | `slug`, `theme_tags`, `estimated_duration_min`, `walking_distance_km`, `recommended_start_time`, `pet_ready_flag`, `hero_title`, `subtitle`, `route_summary`, `spot_count`, `hero_image_url` |
| 코스 상세 | `public.get_course_detail(p_course_id)` | `CourseRepositorySupabase` → `CourseDetailDto` | 코스 메타 + 순서가 있는 `places[]`; 장소의 좌표, `mission_radius_m`, `mission_prompt`, 야간 하이라이트, 포토팁, 짧은 스토리, 대표 이미지 |
| 장소 상세 | `public.get_place_by_slug(p_slug)` | `SpotRepositorySupabase` → `PlaceBySlugDto` | 장소 식별자·좌표·이미지·`mission_type`, `mission_prompt`, `couple_question`, `short_story`, 반려동물, 접근성, 오디오 해설 |
| 지금 가기 좋은 스팟 | `public.get_now_good_spots(p_lat, p_lng, p_limit)` | 홈/전체보기 카드 | 혼잡 예측 여부·레벨, 거리, 야간 적합도 기반 추천 사유 |
| 내 주변 | `public.get_nearby_places(...)` | 지도 + 리스트 | 좌표·거리·혼잡 레벨·추천 점수·야간 적합도 |
| 장소별 날짜 예측 | `public.get_place_crowd_forecast(p_place_id)` | 장소 상세 | 오늘부터 최대 7일의 `forecast_date`, `forecast_score`, `crowd_level`, `data_status` |
| 코스 진행 | `start_course_progress`, `checkin_place`, `complete_course_progress` 등 | 코스 진행/마이페이지 | 로그인 사용자의 진행·체크인, 비회원은 로컬 진행 |

### 1.2 앱에서 이미 보이는 서브콘텐츠

- `night_highlight`, `photo_tip`: 장소 상세의 하이라이트 카드
- `couple_question`: 장소 상세의 “낭만적인 순간” 카드
- `mission_prompt`: 코스 상세에서 장소별 미션으로 전달되고, 진행 화면의 도착 모달/현재 장소 카드에 노출
- `short_story`: 코스 장소 요약의 우선 값이며 장소 상세에서는 `short_description`이 비어 있을 때만 소개문으로 사용
- `audio_stories`: 장소 상세의 오디오 재생/스크립트 카드
- `access_*`: 장소 상세의 확인된 접근성 정보 카드
- `pet_policy`, `pet_note`: 장소 상세와 코스 타임라인의 반려동물 안내
- `crowd_forecast`: 별도 날짜 시리즈 RPC로 예측 카드를 구성하며 실시간으로 표현하지 않음
- 좌표: 장소 상세의 외부 지도 선택 시트에서 카카오·네이버·구글·Apple 지도 딥링크/웹 폴백에 사용

### 1.3 앱 계약상 아직 보이지 않는 값

다음 값은 DB에 채워도 현재 앱 화면에는 자동으로 나타나지 않는다.

1. `mission_title`, `mission_body`: 현재 `get_place_by_slug`와 `get_course_detail` 반환 JSON에 없고, 앱 DTO에도 없다. 기존 DB 컬럼을 채우는 것만으로는 앱에 노출되지 않는다.
2. `mission_type`: `PlaceBySlugDto`가 파싱하지만 `SpotDetail` 도메인 모델과 위젯으로 전달하지 않는다.
3. 장소 상세의 `mission_prompt`: `SpotDetail`까지 매핑되지만 `spot_detail_page.dart`에는 미션 카드가 없다. 코스 진행 화면으로 들어왔을 때만 사용자가 본다.
4. `short_story`: 별도 스토리 섹션이 없고 소개문 fallback 또는 코스 장소 요약으로만 소비된다.
5. `approved_photos`, `wellness_tags`, `related_places`, `weather_summary`, `mid_weather_summary`, `nearby_bus_arrivals`: 웹 공개 계약에는 있으나 앱 DTO/화면/RPC 호출 코드에는 현재 연결되어 있지 않다.
6. `core.local_spots`와 리워드/쿠폰: 앱 저장소에는 Supabase 로컬 상권 feature나 reward 계약이 없다. `LocalSpot`은 현재 장소 상세 Mock 구조체일 뿐이다.
7. 코스 전체 경로선/도보 구간: 앱은 순서가 있는 장소 좌표와 외부 지도 목적지 링크만 사용한다. 다중 경유지 polyline 또는 구간별 실제 도보시간 계약은 없다.

이 차이는 누락이라기보다 현재 앱의 범위다. 따라서 이번 웹/DB 콘텐츠 채움 작업은 기존 앱 계약을 깨지 않도록 하고, 위 값들을 쓰기 위한 앱 변경은 별도 명시적 작업으로 분리한다.

## 2. 달빛수원 콘셉트에 맞춘 콘텐츠 패키지

### 2.1 정조 스토리 아크: `정조의 밤길`

앱 계약을 바꾸지 않는 1차 버전은 새 컬럼 대신 코스 카피와 기존 장소 필드를 조합한다.

| 막 | 거점 | 노출 위치 | 기존 필드 |
|---|---|---|---|
| 1. 행궁의 명령 | 화성행궁 | 코스 제목/소개 + 장소 소개 | `hero_title`, `subtitle`, `route_summary`, `short_story` |
| 2. 북쪽 관문 | 장안문 | 장소 하이라이트 + 촬영 미션 | `night_highlight`, `photo_tip`, `mission_type`, `mission_prompt` |
| 3. 물과 달빛 | 화홍문·방화수류정 | 낭만 질문 + 오디오/짧은 이야기 | `couple_question`, `short_story`, `audio_stories` |
| 4. 훈련과 귀환 | 연무대·창룡문·서장대 | 코스 후반 미션 + 귀환 안내 | `mission_prompt`, `photo_tip`, `route_summary` |

운영자가 작성하는 문구는 역사적 사실과 창작 안내를 분리한다. 공공 원문은 근거 자료로 보관하고, 앱에 노출하는 야간 큐레이션은 `editorial` 승인 상태를 거친다.

### 2.2 미션 패키지

현재 앱에서 즉시 사용할 수 있는 최소 계약은 장소별 `mission_type` + `mission_prompt` + `mission_radius_m`이다.

- `mission_type`: `photo`, `look`, `listen`, `walk` 중 하나로 통일한다.
- `mission_prompt`: 한 번에 수행할 수 있는 행동 문장 1개로 작성한다.
- `mission_radius_m`: 현장 GPS 오차를 고려해 장소별로 60~120m 범위에서 검수한다.
- `couple_question`: 체크인 뒤 대화를 유도하는 한 문장이다.
- `mission_title/body`: 웹·관리자용 초안 필드로 채울 수 있지만, 앱에서 쓰려면 추후 RPC 키 추가와 DTO/UI 변경이 필요하다.

따라서 1차 DB 채움의 성공 기준은 `mission_prompt`가 게시 장소의 코스 진행 화면에서 보이는 것이다. 제목/긴 본문을 먼저 채워 앱에 보일 것으로 가정하지 않는다.

### 2.3 혼잡 분산 콘텐츠

현재 앱에는 이미 두 개의 분산 장치가 있다.

- 홈 `get_now_good_spots`: 날짜별 예측과 야간 적합도를 조합해 “지금 가기 좋은 스팟”을 추천한다.
- `get_nearby_places`: 위치·반경·정렬·혼잡 레벨 필터로 사용자가 덜 붐비는 주변 장소를 탐색한다.

DB/웹 작업에서는 `crowd_level`을 실시간 인원으로 표현하지 않고, 데이터가 없거나 오래되면 카드/배지를 숨기거나 “예측 지연”으로 표시한다. 코스 전체를 실시간 재계산하는 새 알고리즘은 1차 범위에서 만들지 않는다.

### 2.4 오디오·무장애·반려동물

- 오디오: 장소별 스크립트가 있으면 앱에서 읽을 수 있고, `audio_url`이 있는 항목만 재생한다. 스크립트 없는 빈 카드는 만들지 않는다.
- 무장애: 확인된 항목만 앱에 표시하며, 등급화·추정 문구를 추가하지 않는다.
- 반려동물: `allowed`, `partial`, `not_allowed`, `unknown` 어휘를 유지한다. `unknown`을 가능으로 표시하지 않는다.

이 세 영역은 이미 앱에 연결되어 있으므로, 웹/DB에서는 승인 상태·출처 시각·빈 값 처리만 품질 관리한다.

### 2.5 지역 상권·주간 확장

`core.local_spots` 계층은 존재하지만 현재 데이터가 0건이며 앱 기능도 없다. 그러므로 다음 순서로 분리한다.

1. 웹 관리자에서 행궁동 카페·수원통닭거리·전통시장 등 5개 안팎의 검증된 후보를 운영 데이터로 등록한다.
2. 장소-상권 연결과 영업시간/휴무/공식 링크를 검수한다.
3. 쿠폰·포인트·리워드는 제휴 확인 전에는 노출하지 않는다.
4. 앱에서 보이게 할 때만 `get_local_spots` 계열 RPC, DTO, 카드, 딥링크를 별도 설계한다.

날씨·행사·웰니스도 같은 원칙으로 웹/운영 콘솔에서 먼저 검증하고, 앱 노출은 별도 additive 계약으로 진행한다.

## 3. 제안하는 데이터/API 경계

### 3.1 1차: 기존 계약만 사용

1차 구현은 앱 저장소를 수정하지 않고 다음 경계를 지킨다.

```text
KTO/기상/버스 수집 → raw → core 정규화 → editorial 승인
                                      ↓
                         serving view / public RPC
                                      ↓
                            Flutter 앱·홍보 웹
```

- 앱과 웹은 TourAPI·기상청·경기버스 원본을 직접 호출하지 않는다.
- 원본 키는 서버/Edge Function Secret에만 둔다.
- 모바일은 `public.*` RPC만 호출한다. raw/core/editorial 직접 조회를 추가하지 않는다.
- 기존 RPC 응답 키는 삭제·이름 변경하지 않는다.
- 새 블록은 빈 배열 + `data_status`로 반환해 구버전 앱이 무시할 수 있게 한다.

### 3.2 2차: 앱에 스토리/상권을 노출할 때의 additive 계약

앱 작업을 승인할 때에만 다음 키를 추가한다.

```json
{
  "story_arc": {
    "items": [{
      "id": "act-02",
      "title": "북쪽 관문",
      "body": "장안문에서 ...",
      "order": 2
    }],
    "data_status": "fresh",
    "source_updated_at": null,
    "fetched_at": "2026-09-21T00:00:00+09:00"
  },
  "local_spots": {
    "items": [{
      "id": "...",
      "name": "검수된 매장명",
      "spot_type": "cafe",
      "summary": "야간 마무리 안내",
      "distance_m": 420,
      "official_url": "https://...",
      "business_status": "open"
    }],
    "data_status": "fresh",
    "source_updated_at": null,
    "fetched_at": "2026-09-21T00:00:00+09:00"
  }
}
```

이 계약은 예시이며, 앱 구현을 시작할 때 실제 컬럼·출처·RLS·캐시 TTL을 다시 확정한다. `mission_title/body`를 단순히 추가하는 것보다 스토리와 상권을 블록으로 감싸는 이유는 빈 값, 신선도, 운영 승인 상태를 앱이 안전하게 처리할 수 있기 때문이다.

### 3.3 코스 길찾기

현재 앱의 길찾기는 장소 하나를 외부 지도 앱에 넘기는 방식이다. 코스 전체 길찾기는 다음 단계에서 선택한다.

- MVP: 코스 상세에 순서와 좌표를 유지하고 각 장소 상세의 길찾기를 사용한다.
- 후속: `course_legs[]`(출발/도착 place ID, 거리, 도보 예상분, 검수 시각)를 RPC에 additive로 추가한다.
- 외부 지도 앱 연동은 앱에서 다중 경유지 지원 여부를 확인한 뒤 Kakao/Naver/Google/Apple별로 별도 어댑터를 둔다.
- DB의 `walking_distance_km`와 화면 문구는 라우팅 검수 결과가 있을 때만 갱신한다. 선언 거리와 실제 도보 경로가 크게 다르면 게시 전 운영 경고를 낸다.

## 4. 운영·검수 규칙

### 게시 전 체크

- 장소: 활성 장소 + 게시 승인 + 대표 이미지 + 짧은 소개 + 야간 포인트
- 미션: `mission_type`과 `mission_prompt`가 함께 있고, 반경이 좌표·현장 동선과 맞음
- 코스: 모든 stop이 게시 장소이고 순서 중복 없음; 대략 거리/시간이 실제 지도 경로와 크게 어긋나지 않음
- 혼잡: 오늘 이후 예측이 있으면 `fresh/stale` 상태를 함께 표시하고, 없으면 혼잡 문구를 만들지 않음
- 반려동물/무장애: 원문 출처와 확인 시각이 있고 모르는 값은 숨김 또는 확인 필요로 표시
- 오디오: 스크립트 또는 재생 URL 중 하나가 있고, 노출 장소와 좌표 매칭이 맞음
- 상권: 공식 링크·영업 상태·위치가 검증되기 전에는 추천/쿠폰 문구를 게시하지 않음

### 정적 계약 검증

앱 실행 없이도 다음을 자동 점검할 수 있다.

1. DB: 게시 장소/코스의 필수 컬럼 커버리지와 빈 블록 비율
2. RPC: 익명 키로 응답 키·타입·빈 데이터 상태를 확인하되 키 값은 출력하지 않음
3. 앱 코드: DTO가 기존 키를 읽고, 새 키가 없어도 기본값으로 렌더링하는지 grep/정적 테스트
4. 코스: stop 좌표와 라우팅 거리 비교, 중복 코스·중복 stop 탐지
5. 보안: raw/core/editorial 직접 조회 권한이 공개 role에 남아 있지 않은지 Supabase advisor와 권한 쿼리로 확인

## 5. 단계별 실행안

### Phase 1 — 지금 바로 가능한 웹/DB 작업

- 기존 8개 핵심 장소의 `mission_prompt`, `mission_type`, `couple_question`, `short_story` 품질을 우선 보완
- `mission_title/body`는 관리자 검수용으로만 채우고 앱 노출을 약속하지 않음
- 정조 4막 코스 카피와 미션을 기존 `course_copy`/`place_copy`에 연결
- 혼잡 추천 문구·예측 지연 표시를 검수하고 코스/스팟의 실제 지도 경로를 재검증
- 오디오·무장애·반려동물은 현재 RPC와 앱 위젯에 맞게 빈 값/출처 상태를 정리
- 앱 저장소와 앱 계약은 변경하지 않음

### Phase 2 — 앱에 사용자 경험을 확장할 때

- 장소 상세에 미션 카드와 짧은 스토리 섹션을 추가
- `mission_type`을 도메인 모델까지 전달하고 미션 타입별 아이콘/안내를 제공
- `get_place_by_slug`/`get_course_detail`에 필요한 additive 블록을 추가하고 DTO·위젯·HTTP 경계 테스트 작성
- 코스 전체 경로선/구간 길찾기는 실제 지도 검수 후 `course_legs[]`로 설계

### Phase 3 — 지역 상생·주간 플랫폼

- 검증된 `local_spots`와 연결/공식 링크를 공개 RPC에 추가
- 제휴가 확인된 뒤 쿠폰·포인트·리워드 원장과 사용자 상태를 별도 설계
- 날씨·행사·웰니스·버스는 현재 공개 계약의 상태 블록을 재사용해 앱에 필요한 카드만 단계적으로 추가
- 주간 추천은 야간 점수와 분리된 editorial/추천 정책으로 운영

## 6. 완료 기준

이번 설계 단계의 완료 기준은 다음과 같다.

- 앱 `develop`의 실제 RPC/DTO/UI 소비 범위를 문서로 확인했다.
- DB 컬럼을 채우기만 해서는 앱에 보이지 않는 필드를 식별했다.
- Phase 1에서 앱 수정 없이 가능한 콘텐츠와 Phase 2 이후 앱 작업을 분리했다.
- 공개 RPC는 additive·상태 블록·서빙 계층 원칙을 유지한다.
- 시뮬레이터를 실행하지 않고 코드/문서 기준으로 검토했다.

이 문서 승인 후에만 구현 계획을 작성하고, 그 다음 웹/DB 변경을 단계별로 진행한다. 앱 저장소 변경은 별도 요청과 별도 PR로 다룬다.
