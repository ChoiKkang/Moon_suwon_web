// 코스 초안이 문 닫은 장소를 야간 코스로 추천하지 않도록 KTO 운영시간 원문을
// 보수적으로 해석한다.
//
// KTO usetime 표기는 자유 형식이다. "상시 개방", "하절기(3~10월) 09:00~18:00",
// "09:40~17:00", "가게별 상이"가 모두 나온다. 따라서 확실히 판정할 수 있는
// 경우에만 결론을 내고, 애매하면 unknown으로 남겨 사람이 보게 한다.

export type OpeningAssessment =
  | { kind: 'always_open' }
  | { kind: 'closes_before'; closingMinutes: number }
  | { kind: 'open_late'; closingMinutes: number }
  | { kind: 'unknown'; reason: string };

const ALWAYS_OPEN_PATTERN = /상시|24시간|연중\s*무휴\s*개방|제한\s*없음/;
const VARIES_PATTERN = /상이|문의|참조|참고|홈페이지/;

function toMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

// KTO lists seasonal ranges such as "하절기(3월~10월) 09:00~18:00동절기(11월~2월)
// 09:00~17:00". Splitting on the season labels lets us apply the range that
// actually governs the requested date instead of always assuming the shortest
// one, which would wrongly reject a summer evening at 17:30.
const SUMMER_LABEL = /하절기|여름|3월\s*~\s*10월|3\s*~\s*10월/;
const WINTER_LABEL = /동절기|겨울|11월\s*~\s*2월|11\s*~\s*2월/;

type SeasonalRange = { season: 'summer' | 'winter' | 'any'; closingMinutes: number };

function collectRanges(text: string): SeasonalRange[] {
  const pattern = /(\d{1,2}):(\d{2})\s*[~\-–]\s*(\d{1,2}):(\d{2})/g;
  const ranges: SeasonalRange[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const hour = Number(match[3]);
    const minute = Number(match[4]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    if (hour > 47 || minute > 59) continue;

    // Season labels precede their range in KTO text, so look at the segment
    // between the previous match and this one.
    const prefixStart = ranges.length === 0 ? 0 : Math.max(0, match.index - 40);
    const prefix = text.slice(prefixStart, match.index);
    const season: SeasonalRange['season'] = WINTER_LABEL.test(prefix)
      ? 'winter'
      : SUMMER_LABEL.test(prefix)
        ? 'summer'
        : 'any';
    ranges.push({ season, closingMinutes: toMinutes(hour, minute) });
  }
  return ranges;
}

function seasonOf(date: Date): 'summer' | 'winter' {
  const month = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', month: 'numeric' }).format(date),
  );
  return month >= 3 && month <= 10 ? 'summer' : 'winter';
}

export function assessOpeningHours(
  raw: string | null | undefined,
  now: Date = new Date(),
): OpeningAssessment {
  const text = String(raw ?? '').trim();
  if (text.length === 0) return { kind: 'unknown', reason: '운영시간 정보가 없습니다.' };

  const ranges = collectRanges(text);

  // "상시 개방" 과 구체적 시간이 함께 적힌 경우는 시간 쪽을 신뢰한다.
  if (ranges.length === 0) {
    if (ALWAYS_OPEN_PATTERN.test(text)) return { kind: 'always_open' };
    if (VARIES_PATTERN.test(text)) return { kind: 'unknown', reason: '장소별로 운영시간이 다릅니다.' };
    return { kind: 'unknown', reason: '운영시간 표기를 해석할 수 없습니다.' };
  }

  const season = seasonOf(now);
  const seasonal = ranges.filter((range) => range.season === season);
  const applicable = seasonal.length > 0 ? seasonal : ranges.filter((range) => range.season === 'any');
  const pool = applicable.length > 0 ? applicable : ranges;
  return { kind: 'closes_before', closingMinutes: Math.min(...pool.map((range) => range.closingMinutes)) };
}

/**
 * Decide whether a place is visitable at the recommended course start time.
 * Returns null when the data cannot support a decision so callers can surface a
 * review item instead of silently passing or failing.
 */
export function isOpenAtStart(
  raw: string | null | undefined,
  startTime: string,
  now: Date = new Date(),
): { open: boolean | null; closingMinutes: number | null; reason: string | null } {
  const startMatch = /^(\d{1,2}):(\d{2})/.exec(String(startTime ?? '').trim());
  if (!startMatch) return { open: null, closingMinutes: null, reason: '권장 시작 시간을 해석할 수 없습니다.' };
  const startMinutes = toMinutes(Number(startMatch[1]), Number(startMatch[2]));

  const assessment = assessOpeningHours(raw, now);
  if (assessment.kind === 'always_open') return { open: true, closingMinutes: null, reason: null };
  if (assessment.kind === 'unknown') return { open: null, closingMinutes: null, reason: assessment.reason };

  const closing = assessment.closingMinutes;
  return {
    open: startMinutes < closing,
    closingMinutes: closing,
    reason: startMinutes < closing ? null : `${formatMinutes(closing)}에 마감합니다.`,
  };
}

export function formatMinutes(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
