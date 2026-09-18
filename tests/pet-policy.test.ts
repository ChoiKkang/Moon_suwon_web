import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPetNote,
  freshnessFromCheckedAt,
  normalizePetPolicy,
} from '@/lib/pet/policy';

test('normalizes explicit pet policy text', () => {
  assert.equal(normalizePetPolicy('가능', '반려동물 동반 가능'), 'allowed');
  assert.equal(normalizePetPolicy('제한', '일부 구역만 가능'), 'partial');
  assert.equal(normalizePetPolicy('', '불가'), 'not_allowed');
});

test('prioritizes a prohibition over permissive text', () => {
  assert.equal(normalizePetPolicy('가능', '가능하나 일부 시설은 불가'), 'not_allowed');
});

test('does not turn unknown pet data into partial', () => {
  assert.equal(normalizePetPolicy(null, null), 'unknown');
  assert.equal(normalizePetPolicy('', ''), 'unknown');
});

test('builds a stable note from all supported KTO fields', () => {
  const note = buildPetNote({
    acmpyPsblCpam: '소형견 가능',
    acmpyNeedMtr: '목줄 필요',
    etcAcmpyInfo: '방문 전 문의',
    acmpyTypeCd: '동반 유형 확인',
    relaRntlPrdlst: '유모차 대여',
    relaFrnshPrdlst: '물품 제공',
    relaPurcPrdlst: '용품 구매 가능',
    relaAcdntRiskMtr: '안전 주의',
    relaPosesFclty: '반려동물 편의시설',
  });

  assert.match(note ?? '', /소형견 가능/);
  assert.match(note ?? '', /안전 주의/);
  assert.match(note ?? '', /반려동물 편의시설/);
  assert.ok((note ?? '').indexOf('소형견 가능') < (note ?? '').indexOf('안전 주의'));
});

test('caps display notes at 240 characters', () => {
  const note = buildPetNote({ acmpyPsblCpam: '가'.repeat(400) });
  assert.equal(note?.length, 240);
});

test('classifies freshness from checked timestamps', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  assert.equal(freshnessFromCheckedAt('2026-09-18T11:00:00.000Z', now), 'fresh');
  assert.equal(freshnessFromCheckedAt('2026-09-16T11:00:00.000Z', now), 'stale');
  assert.equal(freshnessFromCheckedAt(null, now), 'unknown');
  assert.equal(freshnessFromCheckedAt('not-a-date', now), 'unknown');
});
