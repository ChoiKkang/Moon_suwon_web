import assert from 'node:assert/strict';
import test from 'node:test';

import { getPublicApiDefinition } from '@/lib/public-data/catalog';
import { evaluateApiHealth, type ApiRunHealth, type DatasetHealthStats } from '@/lib/public-data/health';

const now = new Date('2026-09-20T12:00:00Z');

function run(overrides: Partial<ApiRunHealth> = {}): ApiRunHealth {
  return {
    status: 'completed',
    itemsFetched: 10,
    itemsUpserted: 10,
    errorCount: 0,
    completedAt: '2026-09-20T11:00:00Z',
    metadata: {},
    ...overrides,
  };
}

const emptyStats: DatasetHealthStats = { rawCount: 0, publicCount: 0 };

test('active API without a run fails health', () => {
  const result = evaluateApiHealth(getPublicApiDefinition('kto_photo'), null, null, emptyStats, now);
  assert.equal(result.status, 'failed');
  assert.ok(result.findings.some((finding) => finding.code === 'missing_run'));
});

test('Durunubi completed zero is healthy for Suwon', () => {
  const result = evaluateApiHealth(
    getPublicApiDefinition('durunubi'),
    run({ itemsFetched: 0, itemsUpserted: 0, metadata: { zero_result: true } }),
    null,
    emptyStats,
    now,
  );
  assert.equal(result.status, 'healthy');
});

test('photo count dropping by ninety percent is a warning', () => {
  const result = evaluateApiHealth(
    getPublicApiDefinition('kto_photo'),
    run({ itemsFetched: 9 }),
    run({ itemsFetched: 100 }),
    { rawCount: 9, publicCount: 2, missingProvenanceCount: 0 },
    now,
  );
  assert.equal(result.status, 'warning');
  assert.ok(result.findings.some((finding) => finding.code === 'sudden_drop'));
});

test('one missing Suwon district is a warning', () => {
  const result = evaluateApiHealth(
    getPublicApiDefinition('kto_local_hub'),
    run(),
    null,
    { rawCount: 10, publicCount: 0, scopeCounts: { '41111': 2, '41113': 3, '41115': 5 } },
    now,
  );
  assert.equal(result.status, 'warning');
  assert.ok(result.findings.some((finding) => finding.code === 'district_incomplete'));
});

test('expired short weather forecast fails', () => {
  const result = evaluateApiHealth(
    getPublicApiDefinition('kma_short'),
    run(),
    null,
    { rawCount: 20, publicCount: 20, latestForecastAt: '2026-09-20T10:00:00Z' },
    new Date('2026-09-21T12:00:00Z'),
  );
  assert.equal(result.status, 'failed');
  assert.ok(result.findings.some((finding) => finding.code === 'forecast_expired'));
});

test('pet run with no changed rows remains healthy', () => {
  const result = evaluateApiHealth(
    getPublicApiDefinition('kto_pet'),
    run({ itemsFetched: 8, itemsUpserted: 0, metadata: { unchanged_count: 8, detail_success_count: 8 } }),
    null,
    { rawCount: 8, publicCount: 8 },
    now,
  );
  assert.equal(result.status, 'healthy');
});

test('public rows can never exceed raw source rows', () => {
  const result = evaluateApiHealth(
    getPublicApiDefinition('kto_related'),
    run(),
    null,
    { rawCount: 4, publicCount: 5, invalidRelationCount: 0 },
    now,
  );
  assert.equal(result.status, 'failed');
  assert.ok(result.findings.some((finding) => finding.code === 'count_inversion'));
});

test('audio allows one source story to link to several published places', () => {
  const result = evaluateApiHealth(
    getPublicApiDefinition('kto_audio'),
    run(),
    null,
    { rawCount: 32, publicCount: 55 },
    now,
  );
  assert.equal(result.status, 'healthy');
});
