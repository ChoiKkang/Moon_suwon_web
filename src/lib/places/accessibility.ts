/**
 * 무장애 여행 정보 표시 규칙.
 *
 * KTO는 접근성을 자유 문장으로 보낸다. "출입구까지 완만한 경사로가 설치되어
 * 있음"처럼 서술형이라 등급으로 환산하면 사실이 왜곡된다. 원문을 그대로 보여주고
 * 값이 없는 항목은 아예 감춘다. 반려동물 정보와 같은 정책이다.
 */

export type AccessibilityFacts = {
  route: string | null;
  exit: string | null;
  elevator: string | null;
  parking: string | null;
  publicTransport: string | null;
  wheelchair: string | null;
  brailleBlock: string | null;
  braillePromotion: string | null;
  audioGuide: string | null;
  bigPrint: string | null;
  helpDog: string | null;
  restroom: string | null;
  lactationRoom: string | null;
  stroller: string | null;
  infantsFamily: string | null;
  etc: string | null;
  sourceUpdatedAt: string | null;
};

export type AccessibilityGroup = {
  /** 화면에 쓰는 그룹 제목. */
  title: string;
  items: { label: string; value: string }[];
};

/**
 * 항목을 세 갈래로 묶는다. 방문자가 찾는 순서가 이동 가능 여부, 안내 수단,
 * 현장 편의라서 그 순서대로 배치한다.
 */
export function groupAccessibility(facts: AccessibilityFacts): AccessibilityGroup[] {
  const groups: AccessibilityGroup[] = [
    {
      title: '이동과 주차',
      items: pick([
        ['출입 동선', facts.route],
        ['출입구', facts.exit],
        ['엘리베이터', facts.elevator],
        ['주차', facts.parking],
        ['대중교통', facts.publicTransport],
        ['휠체어', facts.wheelchair],
      ]),
    },
    {
      title: '안내와 보조',
      items: pick([
        ['점자블록', facts.brailleBlock],
        ['점자 안내', facts.braillePromotion],
        ['오디오 안내', facts.audioGuide],
        ['큰 활자', facts.bigPrint],
        ['안내견', facts.helpDog],
      ]),
    },
    {
      title: '현장 편의',
      items: pick([
        ['화장실', facts.restroom],
        ['수유실', facts.lactationRoom],
        ['유아차', facts.stroller],
        ['영유아', facts.infantsFamily],
        ['기타', facts.etc],
      ]),
    },
  ];

  return groups.filter((group) => group.items.length > 0);
}

function pick(entries: [string, string | null][]): { label: string; value: string }[] {
  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1] && entry[1].trim().length > 0))
    .map(([label, value]) => ({ label, value: value.trim() }));
}

/** 표시할 항목이 하나라도 있는지. 없으면 카드를 렌더하지 않는다. */
export function hasAccessibilityInfo(facts: AccessibilityFacts): boolean {
  return groupAccessibility(facts).length > 0;
}

/**
 * 값이 전부 비어 있는 접근성 정보.
 *
 * 코스 상세는 정차지 요약만 보여주고 접근성은 장소 상세에서 확인하게 한다.
 * 코스 RPC에 접근성 컬럼을 추가하면 모바일 앱이 읽는 계약이 바뀌므로, 코스
 * 경로에서는 빈 값을 쓰고 필요한 화면에서만 조회한다.
 */
export const EMPTY_ACCESSIBILITY: AccessibilityFacts = {
  route: null,
  exit: null,
  elevator: null,
  parking: null,
  publicTransport: null,
  wheelchair: null,
  brailleBlock: null,
  braillePromotion: null,
  audioGuide: null,
  bigPrint: null,
  helpDog: null,
  restroom: null,
  lactationRoom: null,
  stroller: null,
  infantsFamily: null,
  etc: null,
  sourceUpdatedAt: null,
};
