import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_API_CATALOG,
  getPublicApiDefinition,
} from '../src/lib/public-data/catalog';
import { getPublicDataServiceKey } from '../src/lib/env/server';

test('catalog has exactly 14 unique approved APIs', () => {
  assert.equal(PUBLIC_API_CATALOG.length, 14);
  assert.equal(new Set(PUBLIC_API_CATALOG.map((item) => item.key)).size, 14);
  assert.ok(PUBLIC_API_CATALOG.every((item) => item.accountStage === 'production_submitted'));
});

test('catalog preserves approval and expiration dates', () => {
  assert.deepEqual(
    {
      korean: getPublicApiDefinition('kto_korean').approvedAt,
      bus: getPublicApiDefinition('gg_bus_arrival').approvedAt,
      weather: getPublicApiDefinition('kma_short').expiresAt,
    },
    {
      korean: '2026-05-25',
      bus: '2026-09-18',
      weather: '2028-05-29',
    },
  );
});

test('Durunubi stays active but requires review', () => {
  const api = getPublicApiDefinition('durunubi');
  assert.equal(api.implementationStatus, 'active');
  assert.equal(api.reviewPolicy, 'review_before_publish');
});

test('provider-specific service keys override the compatibility key', () => {
  const before = { ...process.env };
  process.env.KTO_SERVICE_KEY = 'fallback';
  process.env.KMA_SERVICE_KEY = 'weather';
  process.env.GG_BUS_SERVICE_KEY = 'bus';

  try {
    assert.equal(getPublicDataServiceKey('kto'), 'fallback');
    assert.equal(getPublicDataServiceKey('kma'), 'weather');
    assert.equal(getPublicDataServiceKey('gyeonggi'), 'bus');
  } finally {
    process.env = before;
  }
});
