import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parsePublicDataArgs,
  runPublicDataJob,
  type PublicDataRepository,
  type SyncCandidate,
} from '../scripts/sync-public-data';

function candidate(id: string): SyncCandidate {
  return {
    apiKey: 'kto_photo',
    sourceItemKey: id,
    scopeKey: '수원',
    payload: { id },
    payloadHash: `hash-${id}`,
    reviewStatus: 'hold',
    reviewNote: 'fixture',
    coreDataset: 'photo',
    corePayload: { source_item_key: id },
  };
}

function fakeRepository(options: { unchanged?: string[]; fail?: string[] } = {}) {
  const writes: string[] = [];
  const finishes: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  const repository: PublicDataRepository = {
    startRun: async () => 'run-1',
    saveRaw: async (_runId, item) => {
      writes.push(`raw:${item.sourceItemKey}`);
      if (options.fail?.includes(item.sourceItemKey)) throw new Error(`failed ${item.sourceItemKey}`);
      return { changed: !options.unchanged?.includes(item.sourceItemKey) };
    },
    saveCore: async (item) => { writes.push(`core:${item.sourceItemKey}`); },
    saveReview: async (item) => { writes.push(`review:${item.sourceItemKey}`); },
    recordError: async (_runId, item) => { errors.push(item.sourceItemKey); },
    finishRun: async (_runId, status, metadata) => { finishes.push({ status, metadata }); },
  };
  return { repository, writes, finishes, errors };
}

test('dry-run and limit process deterministic candidates without writes', async () => {
  const fake = fakeRepository();
  const result = await runPublicDataJob(
    { job: 'photo', dryRun: true, limit: 2 },
    {
      repository: fake.repository,
      loadJob: async () => ({ candidates: [candidate('1'), candidate('2'), candidate('3')], scopeCounts: { suwon: 3 } }),
    },
  );
  assert.equal(result.metadata.fetched, 2);
  assert.equal(result.metadata.limited, true);
  assert.deepEqual(fake.writes, []);
  assert.equal(fake.finishes.length, 0);
});

test('a healthy empty Durunubi run completes with zero_result', async () => {
  const fake = fakeRepository();
  const result = await runPublicDataJob(
    { job: 'durunubi', dryRun: false },
    { repository: fake.repository, loadJob: async () => ({ candidates: [], scopeCounts: { suwon: 0 } }) },
  );
  assert.equal(result.status, 'completed');
  assert.equal(result.metadata.zero_result, true);
  assert.equal(fake.finishes[0].status, 'completed');
});

test('nationwide Durunubi rows still report a healthy Suwon zero', async () => {
  const fake = fakeRepository();
  const outside = { ...candidate('outside'), apiKey: 'durunubi' as const, publishable: false };
  const result = await runPublicDataJob(
    { job: 'durunubi', dryRun: true },
    { repository: fake.repository, loadJob: async () => ({ candidates: [outside], scopeCounts: { nationwide: 1, suwon: 0 }, zeroResult: true }) },
  );
  assert.equal(result.metadata.fetched, 1);
  assert.equal(result.metadata.zero_result, true);
});

test('unchanged items skip core writes and remain successful', async () => {
  const fake = fakeRepository({ unchanged: ['1'] });
  const result = await runPublicDataJob(
    { job: 'photo', dryRun: false },
    { repository: fake.repository, loadJob: async () => ({ candidates: [candidate('1')], scopeCounts: {} }) },
  );
  assert.equal(result.metadata.unchanged, 1);
  assert.equal(result.metadata.changed, 0);
  assert.deepEqual(fake.writes, ['raw:1', 'review:1']);
});

test('one item failure records a partial run and continues', async () => {
  const fake = fakeRepository({ fail: ['2'] });
  const result = await runPublicDataJob(
    { job: 'photo', dryRun: false },
    { repository: fake.repository, loadJob: async () => ({ candidates: [candidate('1'), candidate('2'), candidate('3')], scopeCounts: {} }) },
  );
  assert.equal(result.status, 'partial');
  assert.equal(result.metadata.errors, 1);
  assert.deepEqual(fake.errors, ['2']);
  assert.ok(fake.writes.includes('core:3'));
});

test('partial district coverage is preserved as a warning', async () => {
  const fake = fakeRepository();
  const result = await runPublicDataJob(
    { job: 'local_hub', dryRun: false },
    {
      repository: fake.repository,
      loadJob: async () => ({
        candidates: [candidate('1')],
        scopeCounts: { '41111': 1, '41113': 0, '41115': 2, '41117': 1 },
        warnings: ['zero district: 41113'],
      }),
    },
  );
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.metadata.warnings, ['zero district: 41113']);
});

test('CLI rejects non-positive limits and accepts every public-data job', () => {
  assert.throws(() => parsePublicDataArgs(['--job', 'photo', '--limit', '0']), /positive integer/);
  assert.deepEqual(parsePublicDataArgs(['--job', 'weather_short', '--dry-run', '--limit', '2']), {
    job: 'weather_short', dryRun: true, limit: 2,
  });
});
