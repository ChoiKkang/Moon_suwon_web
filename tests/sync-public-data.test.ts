import assert from 'node:assert/strict';
import test from 'node:test';
import * as publicDataSync from '../scripts/sync-public-data';
import {
  buildLocalHubCandidate,
  buildPhotoCandidate,
  buildRelatedCandidate,
  buildWellnessCandidate,
  parsePublicDataArgs,
  runPublicDataJob,
  type PublicDataRepository,
  type SyncCandidate,
} from '../scripts/sync-public-data';
import type { PlaceMatchCandidate } from '../src/lib/public-data/place-match';

const publishedPlaces: PlaceMatchCandidate[] = [
  {
    placeId: '11111111-1111-4111-8111-111111111111',
    officialName: '화성행궁',
    displayName: '화성행궁',
    ktoContentId: '126508',
    isPublished: true,
  },
  {
    placeId: '22222222-2222-4222-8222-222222222222',
    officialName: '수원화성박물관',
    displayName: null,
    ktoContentId: '129643',
    isPublished: true,
  },
];

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

test('unchanged raw items still refresh derived core and review state', async () => {
  const fake = fakeRepository({ unchanged: ['1'] });
  const result = await runPublicDataJob(
    { job: 'photo', dryRun: false },
    { repository: fake.repository, loadJob: async () => ({ candidates: [candidate('1')], scopeCounts: {} }) },
  );
  assert.equal(result.metadata.unchanged, 1);
  assert.equal(result.metadata.changed, 0);
  assert.equal(result.metadata.upserted, 1);
  assert.deepEqual(fake.writes, ['raw:1', 'core:1', 'review:1']);
});

test('mid-range forecasts become normalized core weather rows', () => {
  const buildMidForecastCandidates = (publicDataSync as Record<string, unknown>).buildMidForecastCandidates;
  assert.equal(typeof buildMidForecastCandidates, 'function');

  const candidates = (buildMidForecastCandidates as (rows: Array<Record<string, unknown>>) => SyncCandidate[])([{
    dayOffset: 4,
    forecastDate: '2026-09-24',
    weatherAm: '맑음',
    weatherPm: '구름많음',
    minTemperatureC: 15,
    maxTemperatureC: 25,
    issuedAt: '2026-09-20T06:00:00+09:00',
  }]);

  assert.deepEqual(candidates.map((item) => item.sourceItemKey), [
    '2026-09-24:WF_AM',
    '2026-09-24:WF_PM',
    '2026-09-24:TMN',
    '2026-09-24:TMX',
  ]);
  assert.deepEqual(candidates.map((item) => item.corePayload?.category), ['WF_AM', 'WF_PM', 'TMN', 'TMX']);
  assert.deepEqual(candidates.map((item) => item.corePayload?.value_text), ['맑음', '구름많음', null, null]);
  assert.deepEqual(candidates.map((item) => item.corePayload?.value_number), [null, null, 15, 25]);
  assert.ok(candidates.every((item) => item.coreDataset === 'weather'));
  assert.ok(candidates.every((item) => item.reviewStatus === 'approved'));
});

test('an omitted limit keeps every reviewed bus stop', () => {
  const applyOptionalLimit = (publicDataSync as Record<string, unknown>).applyOptionalLimit;
  assert.equal(typeof applyOptionalLimit, 'function');
  const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
  assert.deepEqual((applyOptionalLimit as (items: typeof rows, limit?: number) => typeof rows)(rows), rows);
  assert.deepEqual((applyOptionalLimit as (items: typeof rows, limit?: number) => typeof rows)(rows, 2), rows.slice(0, 2));
});

test('wellness normalization reads the provider casing used by live responses', () => {
  const candidate = buildWellnessCandidate({
    contentId: '126508',
    title: '화성행궁',
    baseAddr: '경기도 수원시 팔달구 정조로 1',
    mapX: '127.0100',
    mapY: '37.2800',
    wellnessThemaCd: '01',
  }, publishedPlaces);

  assert.equal(candidate.sourceItemKey, '126508');
  assert.equal(candidate.corePayload?.address_full, '경기도 수원시 팔달구 정조로 1');
  assert.equal(candidate.corePayload?.lng, 127.01);
  assert.equal(candidate.corePayload?.lat, 37.28);
  assert.equal(candidate.corePayload?.place_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(candidate.reviewStatus, 'approved');
  assert.equal(candidate.publishable, true);
});

test('photo approval requires copyright evidence and one published name match', () => {
  const candidate = buildPhotoCandidate({
    galContentId: 'photo-1',
    galTitle: '화성 행궁',
    galPhotographyLocation: '경기도 수원시 팔달구',
    galWebImageUrl: 'https://example.test/photo.jpg',
    cpyrhtDivCd: 'Type1',
  }, publishedPlaces);

  assert.equal(candidate.corePayload?.place_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(candidate.reviewStatus, 'approved');
  assert.equal(candidate.publishable, true);
});

test('local-hub candidates approve only one published normalized-name match', () => {
  const candidate = buildLocalHubCandidate({
    hubTatsCd: 'opaque-hub-id',
    hubTatsNm: '수원 화성 박물관',
  }, '202608', '41111', publishedPlaces);

  assert.equal(candidate.corePayload?.place_id, '22222222-2222-4222-8222-222222222222');
  assert.equal(candidate.reviewStatus, 'approved');
});

test('related candidates publish only when both endpoint names resolve uniquely', () => {
  const candidate = buildRelatedCandidate({
    tAtsCd: 'opaque-origin',
    tAtsNm: '화성행궁',
    rlteTatsCd: 'opaque-related',
    rlteTatsNm: '수원화성박물관',
    rlteRank: '2',
  }, '202608', '41111', publishedPlaces);

  assert.equal(candidate.corePayload?.origin_place_id, '11111111-1111-4111-8111-111111111111');
  assert.equal(candidate.corePayload?.related_place_id, '22222222-2222-4222-8222-222222222222');
  assert.equal(candidate.reviewStatus, 'approved');
  assert.equal(candidate.publishable, true);
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
