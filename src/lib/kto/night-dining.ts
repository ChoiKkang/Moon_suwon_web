import { assessOpeningHours, formatMinutes } from '@/lib/courses/opening-hours';

/**
 * 야간 코스 마무리 지점으로 쓸 음식점을 고르는 규칙.
 *
 * 수원시 음식점은 KTO에 186곳 있다. 전부 수집하면 예전에 쇼핑(38) 타입이
 * 스타필드 입점 매장 18건으로 검수함을 채웠던 일이 되풀이된다. 달빛수원이
 * 필요한 것은 성곽 야경을 걷고 나서 들를 수 있는 곳이므로, 수집 단계에서
 * 거리와 영업 종료 시각으로 좁힌다.
 */

/** 화성행궁 기준 좌표. 성곽 산책 동선의 중심으로 삼는다. */
export const FORTRESS_CENTER = { lat: 37.2816, lng: 127.0128 } as const;

/** 성곽 일대를 걸어서 이동할 수 있는 범위. */
export const NIGHT_DINING_RADIUS_M = 1500;

/**
 * 코스가 끝나는 시각. 권장 시작 19:00에 두 시간 산책을 더한 기준이며, 이
 * 시각까지 문을 여는 곳만 마무리 후보가 된다.
 */
export const NIGHT_DINING_MIN_CLOSE_MINUTES = 21 * 60;

export type NightDiningAssessment =
  | { eligible: true; closesAt: string | null; reason: null }
  | { eligible: false; closesAt: string | null; reason: string };

/**
 * KTO 음식점 영업시간 원문으로 야간 방문 가능 여부를 판정한다.
 *
 * opentimefood는 "- 11:30~22:00<BR>- 마지막 주문 21:30"이나 평일·주말을 나눠
 * 쓴 형태로 온다. 시간 범위를 모두 읽되 가장 이른 마감을 택하는 기존 해석을
 * 그대로 쓴다. 늦게까지 여는 요일이 있어도 보수적으로 판단해야 방문자가 닫힌
 * 가게 앞에 서는 일을 막는다.
 */
export function assessNightDining(
  openTimeRaw: string | null | undefined,
  now: Date = new Date(),
): NightDiningAssessment {
  const assessment = assessOpeningHours(openTimeRaw, now);

  if (assessment.kind === 'always_open') {
    return { eligible: true, closesAt: null, reason: null };
  }

  if (assessment.kind === 'unknown') {
    return { eligible: false, closesAt: null, reason: assessment.reason };
  }

  const closesAt = formatMinutes(assessment.closingMinutes);
  if (assessment.closingMinutes < NIGHT_DINING_MIN_CLOSE_MINUTES) {
    return {
      eligible: false,
      closesAt,
      reason: `${closesAt}에 마감해 야간 코스 시간과 맞지 않습니다.`,
    };
  }

  return { eligible: true, closesAt, reason: null };
}

/**
 * 두 좌표 사이 거리(m). 성곽 일대는 반경이 좁아 지구를 구로 보는 근사로 충분하다.
 * 실제 도보 거리가 아니라 직선거리라는 점은 코스 검증 단계에서 사람이 판단한다.
 */
export function distanceInMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const earthRadiusM = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const midLat = toRadians((from.lat + to.lat) / 2);

  const x = deltaLng * Math.cos(midLat);
  return Math.round(Math.sqrt(deltaLat * deltaLat + x * x) * earthRadiusM);
}

/** 성곽 중심에서 걸어갈 수 있는 거리인지. */
export function isWithinFortressWalk(
  place: { lat: number; lng: number },
  radiusM = NIGHT_DINING_RADIUS_M,
): boolean {
  return distanceInMeters(FORTRESS_CENTER, place) <= radiusM;
}
