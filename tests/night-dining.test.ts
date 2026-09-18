import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORTRESS_CENTER,
  assessNightDining,
  distanceInMeters,
  isWithinFortressWalk,
} from '../src/lib/kto/night-dining';

test('accepts food places that stay open through the night course', () => {
  // 실제 KTO opentimefood 원문 형식.
  const open = assessNightDining('- 11:30~22:00<BR>- 마지막 주문 21:30');
  assert.equal(open.eligible, true);
  assert.equal(open.closesAt, '22:00');

  const late = assessNightDining('- 09:00~24:00');
  assert.equal(late.eligible, true);
});

test('rejects food places that close before the course ends', () => {
  const early = assessNightDining('- 09:00~20:00<br>- 마지막 주문 19:00');
  assert.equal(early.eligible, false);
  assert.equal(early.closesAt, '20:00');
  assert.match(early.reason ?? '', /야간 코스/);
});

test('takes the earliest close when weekday and weekend hours differ', () => {
  // 평일 20시, 주말 22시면 보수적으로 20시를 기준한다. 방문자가 닫힌 가게
  // 앞에 서는 것보다 후보에서 빠지는 편이 낫다.
  const mixed = assessNightDining('[평일]<br>- 10:00~20:00<br>[주말]<br>- 10:00~22:00');
  assert.equal(mixed.eligible, false);
  assert.equal(mixed.closesAt, '20:00');
});

test('leaves unreadable hours out instead of guessing', () => {
  const missing = assessNightDining(null);
  assert.equal(missing.eligible, false);

  const varies = assessNightDining('가게별 상이');
  assert.equal(varies.eligible, false);
});

test('treats always-open places as eligible', () => {
  const always = assessNightDining('24시간 영업');
  assert.equal(always.eligible, true);
  assert.equal(always.closesAt, null);
});

test('measures walking range from the fortress center', () => {
  assert.equal(distanceInMeters(FORTRESS_CENTER, FORTRESS_CENTER), 0);

  // 행궁동 일대는 반경 안, 광교호수공원은 밖.
  assert.equal(isWithinFortressWalk({ lat: 37.2816, lng: 127.0128 }), true);
  assert.equal(isWithinFortressWalk({ lat: 37.2881, lng: 127.0567 }), false);
});
