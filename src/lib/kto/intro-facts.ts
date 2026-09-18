import type { KtoIntroItem } from './types';

/**
 * detailIntro2는 같은 사실을 콘텐츠 타입마다 다른 이름으로 보낸다.
 *
 * 관광지는 usetime, 문화시설은 usetimeculture, 음식점은 opentimefood, 레포츠는
 * usetimeleports를 쓴다. 수집 코드가 usetime만 읽던 동안 문화시설 19곳과
 * 레포츠는 운영시간이 전부 비어 있었다. 원본에는 값이 있었고 읽지 않았을 뿐이다.
 *
 * 숙박(32)은 하루 운영시간이라는 개념이 없고 체크인·체크아웃만 준다. 야간 코스
 * 마감 판정에 쓸 값이 아니므로 운영시간으로 옮기지 않는다.
 */
export type IntroFacts = {
  operatingHours: string | null;
  restDay: string | null;
  infoPhone: string | null;
};

const HOURS_KEYS = ['usetime', 'usetimeculture', 'opentimefood', 'usetimeleports'] as const;
const REST_KEYS = ['restdate', 'restdateculture', 'restdatefood', 'restdateleports'] as const;
const PHONE_KEYS = [
  'infocenter',
  'infocenterculture',
  'infocenterfood',
  'infocenterleports',
  'infocenterlodging',
] as const;

function firstFilled(intro: KtoIntroItem | null | undefined, keys: readonly string[]): string | null {
  if (!intro) return null;
  const record = intro as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return null;
}

/** 타입에 상관없이 운영시간·휴무일·안내 전화를 꺼낸다. */
export function readIntroFacts(intro: KtoIntroItem | null | undefined): IntroFacts {
  return {
    operatingHours: firstFilled(intro, HOURS_KEYS),
    restDay: firstFilled(intro, REST_KEYS),
    infoPhone: firstFilled(intro, PHONE_KEYS),
  };
}
