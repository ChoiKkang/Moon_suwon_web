import { assessOpeningHours, formatMinutes } from './opening-hours';

// 야간 행사가 진행되는 기간에는 평소 마감 시간과 무관하게 장소 내부를 방문할 수
// 있다. 화성행궁 야간개장(5/1~11/1, 18:00~21:30)이 대표적이다. 이 정보는
// core.events에 이미 수집되어 있으므로, 코스 검증이 행사 기간을 함께 보고
// 판단하면 운영자가 기간마다 코스를 손보지 않아도 된다.

export type NightEvent = {
  eventName: string;
  startDate: string;
  endDate: string;
  eventPlace: string | null;
  playTime: string | null;
};

export type NightAccess =
  | { kind: 'event_open'; eventName: string; until: string }
  | { kind: 'none' };

function toMinutes(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function parseStart(startTime: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(startTime ?? '').trim());
  if (!match) return null;
  return toMinutes(Number(match[1]), Number(match[2]));
}

function withinDateRange(date: string, start: string, end: string): boolean {
  return start <= date && date <= end;
}

/**
 * Decide whether a night event covers the place at the requested start time.
 * Matching is deliberately narrow: the event venue text must mention the place
 * name (or the reverse) so a city-wide festival does not silently unlock every
 * spot. When the event has no parsable hours we do not claim access.
 */
export function findNightAccess(
  placeName: string,
  startTime: string,
  onDate: string,
  events: NightEvent[],
): NightAccess {
  const startMinutes = parseStart(startTime);
  if (startMinutes === null) return { kind: 'none' };

  const normalizedPlace = placeName.replace(/\s+/g, '').replace(/\(.*?\)/g, '');

  for (const event of events) {
    if (!withinDateRange(onDate, event.startDate, event.endDate)) continue;

    const venue = (event.eventPlace ?? '').replace(/\s+/g, '');
    const title = event.eventName.replace(/\s+/g, '');
    const mentionsPlace = venue.includes(normalizedPlace) || title.includes(normalizedPlace);
    if (!mentionsPlace) continue;

    const hours = assessOpeningHours(event.playTime);
    if (hours.kind !== 'closes_before') continue;
    if (startMinutes >= hours.closingMinutes) continue;

    return { kind: 'event_open', eventName: event.eventName, until: formatMinutes(hours.closingMinutes) };
  }

  return { kind: 'none' };
}
