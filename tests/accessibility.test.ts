import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_ACCESSIBILITY, groupAccessibility, hasAccessibilityInfo } from '../src/lib/places/accessibility';

test('groups only the accessibility facts that have a value', () => {
  // 화성행궁 실제 응답 형태.
  const groups = groupAccessibility({
    ...EMPTY_ACCESSIBILITY,
    route: '출입구까지 완만한 경사로가 설치되어 있음',
    parking: '장애인 주차장 있음(4대/화성행궁)',
    wheelchair: '대여 가능(정문 입구 쪽 관광안내소)',
    restroom: '장애인 화장실 있음',
    audioGuide: '오디오 가이드 있음(오디(Odii) 어플 다운로드 후 이용 가능)',
  });

  assert.deepEqual(groups.map((g) => g.title), ['이동과 주차', '안내와 보조', '현장 편의']);
  assert.deepEqual(groups[0]?.items.map((i) => i.label), ['출입 동선', '주차', '휠체어']);
  assert.deepEqual(groups[1]?.items.map((i) => i.label), ['오디오 안내']);
  assert.deepEqual(groups[2]?.items.map((i) => i.label), ['화장실']);
});

test('drops a group when none of its items are filled', () => {
  const groups = groupAccessibility({ ...EMPTY_ACCESSIBILITY, restroom: '장애인 전용 화장실 있음' });
  assert.deepEqual(groups.map((g) => g.title), ['현장 편의']);
});

test('treats blank strings as missing so no empty row renders', () => {
  const groups = groupAccessibility({ ...EMPTY_ACCESSIBILITY, route: '   ', parking: '' });
  assert.equal(groups.length, 0);
  assert.equal(hasAccessibilityInfo({ ...EMPTY_ACCESSIBILITY, route: '  ' }), false);
});

test('reports no info for a place KTO has no accessibility data for', () => {
  assert.equal(hasAccessibilityInfo(EMPTY_ACCESSIBILITY), false);
  assert.deepEqual(groupAccessibility(EMPTY_ACCESSIBILITY), []);
});
