import assert from 'node:assert/strict';
import test from 'node:test';
import { findNightAccess, type NightEvent } from '../src/lib/courses/night-events';

const NIGHT_OPENING: NightEvent = {
  eventName: '2026 화성행궁 야간개장',
  startDate: '2026-05-01',
  endDate: '2026-11-01',
  eventPlace: '화성행궁',
  playTime: '18:00~21:30',
};

const CITY_FESTIVAL: NightEvent = {
  eventName: '수원화성문화제',
  startDate: '2026-10-04',
  endDate: '2026-10-11',
  eventPlace: '수원화성 일원',
  playTime: '12:00~21:00',
};

test('unlocks a venue while its night event runs', () => {
  const access = findNightAccess('화성행궁', '19:00', '2026-09-18', [NIGHT_OPENING]);
  assert.equal(access.kind, 'event_open');
  assert.equal(access.kind === 'event_open' ? access.until : null, '21:30');
});

test('does not unlock outside the event date range', () => {
  assert.equal(findNightAccess('화성행궁', '19:00', '2026-12-01', [NIGHT_OPENING]).kind, 'none');
  assert.equal(findNightAccess('화성행궁', '19:00', '2026-04-30', [NIGHT_OPENING]).kind, 'none');
});

test('does not unlock after the event closes', () => {
  assert.equal(findNightAccess('화성행궁', '22:00', '2026-09-18', [NIGHT_OPENING]).kind, 'none');
});

test('does not unlock an unrelated place', () => {
  assert.equal(findNightAccess('장안문', '19:00', '2026-09-18', [NIGHT_OPENING]).kind, 'none');
});

test('matches a place named inside a wider festival venue', () => {
  // "수원화성 일원"은 수원화성을 명시하므로 해당 장소에만 적용한다.
  assert.equal(findNightAccess('수원화성', '19:00', '2026-10-05', [CITY_FESTIVAL]).kind, 'event_open');
  // 성문 개별 이름은 행사 문구에 없으므로 자동 통과시키지 않는다.
  assert.equal(findNightAccess('팔달문', '19:00', '2026-10-05', [CITY_FESTIVAL]).kind, 'none');
});

test('ignores events without parsable hours', () => {
  const vague: NightEvent = { ...NIGHT_OPENING, playTime: '상세 일정 홈페이지 참조' };
  assert.equal(findNightAccess('화성행궁', '19:00', '2026-09-18', [vague]).kind, 'none');
});
