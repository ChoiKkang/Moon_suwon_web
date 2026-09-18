import assert from 'node:assert/strict';
import test from 'node:test';
import { assessOpeningHours, isOpenAtStart } from '../src/lib/courses/opening-hours';

test('treats 상시 개방 as always open', () => {
  assert.deepEqual(assessOpeningHours('상시 개방'), { kind: 'always_open' });
  assert.equal(isOpenAtStart('상시 개방', '19:00').open, true);
});

test('applies the seasonal range that governs the date', () => {
  // 화성행궁: 하절기(3~10월) 18:00, 동절기(11~2월) 17:00.
  const raw = '- 하절기(3월~10월) 09:00~18:00- 동절기(11월~2월) 09:00~17:00';
  const summer = new Date('2026-09-18T12:00:00+09:00');
  const winter = new Date('2026-12-18T12:00:00+09:00');

  const summerAssessment = assessOpeningHours(raw, summer);
  assert.equal(summerAssessment.kind === 'closes_before' ? summerAssessment.closingMinutes : null, 18 * 60);
  const winterAssessment = assessOpeningHours(raw, winter);
  assert.equal(winterAssessment.kind === 'closes_before' ? winterAssessment.closingMinutes : null, 17 * 60);

  // 17:30 출발은 여름에는 가능하고 겨울에는 마감 이후다.
  assert.equal(isOpenAtStart(raw, '17:30', summer).open, true);
  assert.equal(isOpenAtStart(raw, '17:30', winter).open, false);
  // 19:00 출발은 어느 계절이든 마감 이후다.
  assert.equal(isOpenAtStart(raw, '19:00', summer).open, false);
  assert.match(String(isOpenAtStart(raw, '19:00', summer).reason), /18:00/);
});

test('flags a course start after closing time', () => {
  assert.equal(isOpenAtStart('09:40~17:00', '19:00').open, false);
  assert.equal(isOpenAtStart('10:00~15:30', '19:00').open, false);
});

test('accepts a start time before closing', () => {
  assert.equal(isOpenAtStart('09:00~22:00', '19:00').open, true);
  assert.equal(isOpenAtStart('09:00~18:00', '17:30').open, true);
});

test('returns unknown instead of guessing', () => {
  assert.equal(isOpenAtStart('가게별 상이', '19:00').open, null);
  assert.equal(isOpenAtStart('', '19:00').open, null);
  assert.equal(isOpenAtStart(null, '19:00').open, null);
  assert.equal(isOpenAtStart('09:00~18:00', 'evening').open, null);
});
