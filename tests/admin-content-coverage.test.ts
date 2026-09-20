import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPublicContentCoverage } from '@/lib/admin/content-coverage';

test('public content coverage keeps the operator-facing signals separate', () => {
  const coverage = buildPublicContentCoverage({
    publishedPlaces: 48,
    missionPlaces: 8,
    storyPlaces: 31,
    relatedPlaces: 23,
    relatedItems: 23,
    photoPlaces: 0,
    photoItems: 0,
    wellnessPlaces: 0,
    wellnessItems: 0,
    busPlaces: 37,
    busItems: 129,
    weatherItems: 1432,
  });

  assert.deepEqual(coverage.map((item) => item.key), [
    'missions',
    'stories',
    'related',
    'photos',
    'wellness',
    'bus',
    'weather',
  ]);
  assert.equal(coverage.find((item) => item.key === 'missions')?.places, 8);
  assert.equal(coverage.find((item) => item.key === 'bus')?.items, 129);
  assert.match(coverage.find((item) => item.key === 'photos')?.note ?? '', /공개하지 않음/);
  assert.equal(coverage.find((item) => item.key === 'weather')?.places, 48);
});

test('zero approved enrichments remain explicit instead of looking like a query failure', () => {
  const coverage = buildPublicContentCoverage({
    publishedPlaces: 48,
    missionPlaces: 0,
    storyPlaces: 0,
    relatedPlaces: 0,
    relatedItems: 0,
    photoPlaces: 0,
    photoItems: 0,
    wellnessPlaces: 0,
    wellnessItems: 0,
    busPlaces: 0,
    busItems: 0,
    weatherItems: 0,
  });

  assert.equal(coverage.every((item) => item.places === 0), true);
  assert.match(coverage.find((item) => item.key === 'wellness')?.note ?? '', /공개하지 않음/);
  assert.match(coverage.find((item) => item.key === 'bus')?.note ?? '', /매핑/);
});
