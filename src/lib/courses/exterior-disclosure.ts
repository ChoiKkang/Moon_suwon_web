// 야간에 내부 관람이 끝난 장소를 코스에 넣을 때는 사용자가 헛걸음하지 않도록
// 코스 문구에서 "외관 관람"이라는 성격을 밝혀야 한다. scripts/verify-course-serving.ts가
// 배포 후에 이 규칙을 검사하는데, 같은 규칙을 공개 시점에 적용해 운영자가
// 실수로 공개하는 것을 먼저 막는다.

const DISCLOSURE_PATTERN = /외관|외부|밖에서|야경을 감상|바깥/;

/** 코스 문구가 외부 관람 성격을 밝히고 있는지 확인한다. */
export function disclosesExteriorViewing(...copyParts: Array<string | null | undefined>): boolean {
  return DISCLOSURE_PATTERN.test(copyParts.filter(Boolean).join(' '));
}

export const EXTERIOR_DISCLOSURE_MESSAGE =
  '이 코스에는 야간에 내부 관람이 끝난 장소가 있습니다. 부제나 동선 요약에 외관·외부 야경 관람이라는 점을 밝혀야 공개할 수 있습니다.';
