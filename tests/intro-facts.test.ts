import assert from 'node:assert/strict';
import test from 'node:test';
import { readIntroFacts } from '../src/lib/kto/intro-facts';

test('reads 관광지 intro fields', () => {
  const facts = readIntroFacts({
    contentid: '1',
    usetime: '09:00~18:00',
    restdate: '연중무휴',
    infocenter: '수원시 관광과 031-228-3034',
  });
  assert.equal(facts.operatingHours, '09:00~18:00');
  assert.equal(facts.restDay, '연중무휴');
  assert.equal(facts.infoPhone, '수원시 관광과 031-228-3034');
});

test('reads 문화시설 intro fields, which use their own suffix', () => {
  // 이 필드를 읽지 않아 문화시설 19곳의 운영시간이 전부 비어 있었다.
  const facts = readIntroFacts({
    contentid: '2',
    usetimeculture: '- 평일 09:00~18:00',
    restdateculture: '매주 월요일 / 공휴일',
    infocenterculture: '031-249-0400',
  });
  assert.equal(facts.operatingHours, '- 평일 09:00~18:00');
  assert.equal(facts.restDay, '매주 월요일 / 공휴일');
  assert.equal(facts.infoPhone, '031-249-0400');
});

test('reads 음식점 intro fields', () => {
  const facts = readIntroFacts({
    contentid: '3',
    opentimefood: '- 11:30~22:00',
    restdatefood: '연중무휴',
    infocenterfood: '031-000-0000',
  });
  assert.equal(facts.operatingHours, '- 11:30~22:00');
  assert.equal(facts.restDay, '연중무휴');
  assert.equal(facts.infoPhone, '031-000-0000');
});

test('does not turn 숙박 check-in times into operating hours', () => {
  // 체크인 15:00을 운영시간으로 옮기면 "15시에 마감"으로 해석돼 코스 검증이
  // 엉뚱한 판정을 내린다. 안내 전화만 가져온다.
  const facts = readIntroFacts({
    contentid: '4',
    checkintime: '15:00',
    checkouttime: '12:00',
    infocenterlodging: '031-111-2222',
  });
  assert.equal(facts.operatingHours, null);
  assert.equal(facts.restDay, null);
  assert.equal(facts.infoPhone, '031-111-2222');
});

test('ignores blank strings and missing intro', () => {
  assert.deepEqual(readIntroFacts(null), { operatingHours: null, restDay: null, infoPhone: null });
  assert.equal(readIntroFacts({ contentid: '5', usetime: '   ' }).operatingHours, null);
});
