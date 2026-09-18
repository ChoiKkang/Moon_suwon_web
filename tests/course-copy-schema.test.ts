import assert from 'node:assert/strict';
import test from 'node:test';
import { DeterministicCourseCopyProvider, generateSafeCourseCopy } from '../src/lib/courses/ai-drafter';
import { validateCourseCopy, type ValidatedCourseCandidate } from '../src/lib/courses/course-copy-schema';

const candidate: ValidatedCourseCandidate = {
  theme: '달빛 사진',
  placeIds: ['place-a', 'place-b'],
  stops: [
    { placeId: 'place-a', displayName: '장소 A', evidence: ['야간 적합도 90'], petPolicy: 'allowed' },
    { placeId: 'place-b', displayName: '장소 B', evidence: ['공개·활성 장소 후보'], petPolicy: 'allowed' },
  ],
  distanceKm: 2.4,
  distanceKind: 'straight_line_estimate',
  petReadyFlag: true,
};

test('accepts deterministic evidence-linked copy', async () => {
  const output = await new DeterministicCourseCopyProvider().generate(candidate);
  assert.equal(validateCourseCopy(candidate, output).valid, true);
});

test('rejects unknown ids, altered facts, and unsupported pet claims', () => {
  const result = validateCourseCopy(candidate, {
    title: '코스',
    subtitle: '부제',
    summary: '10km 코스',
    stopReasons: [{ placeId: 'unknown', text: '반려동물에게 완벽합니다.' }],
    warnings: ['주의'],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('unknown place id')));
  assert.ok(result.errors.some((error) => error.includes('unsupported numeric fact')));
  assert.ok(result.errors.some((error) => error.includes('missing stop reason')));
});

test('falls back to deterministic copy when a provider emits invalid output', async () => {
  const output = await generateSafeCourseCopy(candidate, { generate: async () => ({ title: '', subtitle: '', summary: '', stopReasons: [], warnings: [] }) });
  assert.equal(output.stopReasons.length, 2);
  assert.match(output.warnings[0] ?? '', /직선거리/);
});

