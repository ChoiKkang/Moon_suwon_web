# 달빛수원 공개 웹 인터랙션 설계

## 목표

3D/WebGL이나 무거운 모션 라이브러리 없이, 달빛수원의 공공데이터·야경·코스 콘텐츠를 더 잘 탐색하게 만드는 2D 인터랙션을 공개 웹에 적용한다.

참고한 방향은 Awwwards/Godly의 몰입형 히어로, Land-book/Lapa Ninja의 섹션 구성, React Bits/Aceternity의 선택적 카드·이미지 효과다. 구현은 현재 Next.js 16 + Tailwind CSS 구조에 맞춰 CSS와 작은 React 컴포넌트로 소유한다.

## 사용자 흐름

```text
첫 화면의 야경 메시지
        ↓
오늘의 혼잡도 상태를 빠르게 확인
        ↓
가로 스크롤 코스 카드에서 관심 동선 선택
        ↓
장소 카드의 이미지·야간 포인트 확인
        ↓
상세 페이지에서 주소·좌표·연락처·코스 이동
```

## 컴포넌트 설계

### 1. Editorial hero

- 배경 이미지는 전체 화면을 채우되 낮은 대비의 그라디언트로 텍스트 가독성을 확보한다.
- 제목의 핵심 단어만 골드로 강조한다.
- `scroll-reveal`과 `hero-shimmer`는 CSS keyframe으로 처리한다.
- 첫 화면에 데이터 숫자를 과하게 배치하지 않고 실제 장소 수·예보 수만 작은 meta line으로 표시한다.

### 2. Image reveal card

- 장소·코스 카드의 이미지에 `group-hover:scale-105`와 어두운 overlay를 사용한다.
- 카드 하단에 제목·운영 문구·상태를 겹쳐 보여준다.
- 이미지가 없으면 동일한 aspect ratio의 neutral placeholder를 사용해 레이아웃이 흔들리지 않게 한다.
- `prefers-reduced-motion: reduce`에서는 transform과 keyframe을 끈다.

### 3. Scroll rail

- 코스와 혼잡도 후보는 데스크톱 그리드와 모바일 가로 scroll-snap을 함께 지원한다.
- 카드가 화면 밖에 있음을 알려주는 subtle edge gradient를 사용하되, 자동 이동은 하지 않는다.
- 키보드 사용자는 일반 링크와 버튼 순서로 이동할 수 있어야 한다.

### 4. Crowd status pill

- `여유`, `보통`, `혼잡`, `예보 확인 중`을 색상만으로 구분하지 않고 텍스트와 아이콘을 함께 사용한다.
- 점수는 보조 정보로 표시하고, 공개 웹은 운영자가 계산한 `v_now_good_spot_candidates` 결과만 렌더링한다.
- 최신성이 확인되지 않으면 `예보 준비 중`을 표시한다.

### 5. Detail progress rail

- 장소 상세의 방문 정보 섹션을 sticky 목차처럼 보이게 한다.
- 주소·좌표·연락처·최종 확인·공공데이터 기준을 작은 정보 카드로 분리한다.
- DB에 없는 코스 정보나 문구를 고정 문장으로 단정하지 않는다.

## 페이지별 적용

### `/`

- hero에 reveal/shimmer
- 공개 코스는 카드 hover + 모바일 scroll rail
- 혼잡도는 상태 pill + 카드 image reveal
- KTO 스팟은 실제 장소 수와 빈 상태를 유지
- 모든 링크는 `/courses`, `/places/[slug]`, `#kto-spots` 같은 실제 목적지를 사용

### `/courses`

- 카드 이미지 reveal
- 코스 메타를 pill로 묶고 장소 순서를 작은 route rail로 표시
- 빈 상태와 오류 상태는 동일한 시각 언어를 사용

### `/places/[slug]`

- hero 이미지 mask/reveal
- 방문 정보 카드의 staggered entrance는 CSS로만 처리
- 현재 코스 연결이 DB에서 확인되지 않으면 일반적인 `공개 코스 보기` CTA만 표시

## 성능·접근성 제약

- WebGL, canvas 3D, 자동 재생 영상, 무한 marquee, 스크롤 가로채기, custom cursor는 사용하지 않는다.
- 새 animation package는 추가하지 않는다.
- 이미지 URL은 기존 DB 값을 사용하고, 이미지가 없는 경우 fallback을 렌더링한다.
- `prefers-reduced-motion`, `:focus-visible`, `aria-label`, 충분한 명도 대비를 기본값으로 둔다.
- 장식용 pseudo-element는 pointer event를 차단하지 않는다.

## 디자인 토큰

- background: `#0b1326`
- surface: `#171f33`
- elevated surface: `#1e293b`
- primary moonlight: `#ffd700`
- text: `#fff6df`, `#dae2fd`, `#d0c6ab`
- success: `#6ee7b7`
- warning: `#fcd34d`
- error: `#fda4af`
- radius: 16–32px for public cards, 8–16px for metadata pills

## 출시 기준

1. 홈·코스·상세 페이지에서 신규 인터랙션이 실제 DB 콘텐츠를 가리지 않는다.
2. 모션을 끈 환경에서도 모든 정보와 링크를 사용할 수 있다.
3. 모바일 390px 폭에서 가로 overflow가 페이지 전체를 밀어내지 않는다.
4. 이미지가 없는 장소·코스도 동일한 카드 높이를 유지한다.
5. console error 없이 홈, 코스, 공개 상세, 비공개 상세 404를 렌더링한다.
6. webpack build와 production browser smoke test가 통과한다.
