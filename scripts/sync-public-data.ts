import { createHash } from 'node:crypto';
import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { normalizeBusArrivals, type BusArrivalSourceItem } from '../src/lib/public-data/bus';
import type { PublicApiKey } from '../src/lib/public-data/catalog';
import { PublicDataClient } from '../src/lib/public-data/client';
import { getPublicDataServiceKey } from '../src/lib/env/server';
import { createKtoExtraClient, SUWON_ADMIN_DISTRICT_CODES } from '../src/lib/public-data/kto-extra';
import { matchPublishedPlace, type PlaceMatchCandidate } from '../src/lib/public-data/place-match';
import {
  reviewDurunubiCourse,
  reviewPhotoCandidate,
  reviewRelation,
  reviewTourismCandidate,
  type ReviewStatus,
} from '../src/lib/public-data/review';
import {
  latestMidForecastBase,
  normalizeMidForecast,
  normalizeVillageForecast,
  type NormalizedMidForecast,
  type VillageForecastItem,
} from '../src/lib/public-data/weather';

loadEnvConfig(process.cwd());

export const PUBLIC_DATA_JOBS = [
  'photo', 'wellness', 'local_hub', 'related', 'durunubi', 'visitors',
  'weather_short', 'weather_mid', 'bus_arrival',
] as const;
export type PublicDataJob = typeof PUBLIC_DATA_JOBS[number];

export type SyncCandidate = {
  apiKey: PublicApiKey;
  sourceItemKey: string;
  scopeKey: string;
  payload: Record<string, unknown>;
  payloadHash: string;
  sourceUpdatedAt?: string | null;
  reviewStatus: ReviewStatus;
  reviewNote: string;
  coreDataset?: string;
  corePayload?: Record<string, unknown>;
  publishable?: boolean;
};

export type LoadedPublicDataJob = {
  candidates: SyncCandidate[];
  scopeCounts: Record<string, number>;
  warnings?: string[];
  hold?: boolean;
  zeroResult?: boolean;
};

export type PublicDataRunMetadata = {
  fetched: number;
  unchanged: number;
  changed: number;
  upserted: number;
  published: number;
  errors: number;
  zero_result: boolean;
  scope_counts: Record<string, number>;
  review_counts: Record<string, number>;
  warnings: string[];
  limited: boolean;
};

export interface PublicDataRepository {
  startRun(job: PublicDataJob): Promise<string>;
  saveRaw(runId: string, item: SyncCandidate): Promise<{ changed: boolean }>;
  saveCore(item: SyncCandidate): Promise<void>;
  saveReview(item: SyncCandidate): Promise<void>;
  recordError(runId: string, item: SyncCandidate, error: unknown): Promise<void>;
  finishRun(runId: string, status: 'completed' | 'partial' | 'failed' | 'hold', metadata: PublicDataRunMetadata): Promise<void>;
  listApprovedBusStops?(): Promise<Array<{ stationId: string; stationName: string }>>;
  listPlaceMatchCandidates?(): Promise<PlaceMatchCandidate[]>;
}

type RunOptions = { job: PublicDataJob; dryRun: boolean; limit?: number };
type RunDependencies = {
  repository: PublicDataRepository;
  loadJob: (job: PublicDataJob, limit?: number) => Promise<LoadedPublicDataJob>;
};

function parsePositiveLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('--limit must be a positive integer');
  return parsed;
}

export function parsePublicDataArgs(args = process.argv.slice(2)): RunOptions {
  const jobIndex = args.indexOf('--job');
  const job = jobIndex >= 0 ? args[jobIndex + 1] : undefined;
  if (!PUBLIC_DATA_JOBS.includes(job as PublicDataJob)) {
    throw new Error(`--job must be one of: ${PUBLIC_DATA_JOBS.join(', ')}`);
  }
  const limitIndex = args.indexOf('--limit');
  return {
    job: job as PublicDataJob,
    dryRun: args.includes('--dry-run'),
    limit: parsePositiveLimit(limitIndex >= 0 ? args[limitIndex + 1] : undefined),
  };
}

export async function runPublicDataJob(options: RunOptions, dependencies: RunDependencies): Promise<{
  status: 'completed' | 'partial' | 'failed' | 'hold';
  metadata: PublicDataRunMetadata;
}> {
  const runId = options.dryRun ? null : await dependencies.repository.startRun(options.job);
  let loaded: LoadedPublicDataJob;
  try {
    loaded = await dependencies.loadJob(options.job, options.limit);
  } catch (error) {
    const metadata: PublicDataRunMetadata = {
      fetched: 0, unchanged: 0, changed: 0, upserted: 0, published: 0,
      errors: 1, zero_result: false, scope_counts: {}, review_counts: {},
      warnings: [error instanceof Error ? error.message : String(error)], limited: false,
    };
    if (runId) await dependencies.repository.finishRun(runId, 'failed', metadata);
    throw error;
  }

  const allCandidates = loaded.candidates;
  const candidates = options.limit === undefined ? allCandidates : allCandidates.slice(0, options.limit);
  const metadata: PublicDataRunMetadata = {
    fetched: candidates.length,
    unchanged: 0,
    changed: 0,
    upserted: 0,
    published: 0,
    errors: 0,
    zero_result: loaded.zeroResult ?? candidates.length === 0,
    scope_counts: loaded.scopeCounts,
    review_counts: {},
    warnings: loaded.warnings ?? [],
    limited: options.limit !== undefined && allCandidates.length > candidates.length,
  };

  for (const item of candidates) {
    metadata.review_counts[item.reviewStatus] = (metadata.review_counts[item.reviewStatus] ?? 0) + 1;
    if (item.publishable) metadata.published += 1;
  }

  if (options.dryRun) return { status: loaded.hold ? 'hold' : 'completed', metadata };

  let nextCandidate = 0;
  const writeConcurrency = options.job === 'bus_arrival' ? 8 : 1;
  async function writeNextCandidate() {
    while (true) {
      const index = nextCandidate++;
      if (index >= candidates.length) return;
      const item = candidates[index];
      try {
        const result = await dependencies.repository.saveRaw(runId!, item);
        if (result.changed) {
          metadata.changed += 1;
        } else {
          metadata.unchanged += 1;
        }
        if (item.coreDataset && item.corePayload) {
          await dependencies.repository.saveCore(item);
          metadata.upserted += 1;
        }
        await dependencies.repository.saveReview(item);
      } catch (error) {
        metadata.errors += 1;
        await dependencies.repository.recordError(runId!, item, error);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(writeConcurrency, candidates.length) }, () => writeNextCandidate()));

  const status = loaded.hold
    ? 'hold'
    : metadata.errors > 0
      ? (metadata.errors === candidates.length && candidates.length > 0 ? 'failed' : 'partial')
      : 'completed';
  await dependencies.repository.finishRun(runId!, status, metadata);
  return { status, metadata };
}

function hashPayload(payload: Record<string, unknown>): string {
  const sorted = Object.fromEntries(Object.entries(payload).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

function text(item: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return '';
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

function seoulDateParts(now = new Date()): { date: string; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}${get('month')}${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

function latestVillageBase(now = new Date()): { baseDate: string; baseTime: string; issuedAt: string } {
  const local = seoulDateParts(now);
  const cycles = [2, 5, 8, 11, 14, 17, 20, 23];
  const available = cycles.filter((hour) => hour < local.hour || (hour === local.hour && local.minute >= 10));
  if (available.length > 0) {
    const hour = available.at(-1)!;
    return { baseDate: local.date, baseTime: `${String(hour).padStart(2, '0')}00`, issuedAt: `${local.date.slice(0, 4)}-${local.date.slice(4, 6)}-${local.date.slice(6, 8)}T${String(hour).padStart(2, '0')}:00:00+09:00` };
  }
  const yesterday = new Date(`${local.date.slice(0, 4)}-${local.date.slice(4, 6)}-${local.date.slice(6, 8)}T00:00:00+09:00`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(yesterday).replaceAll('-', '');
  return { baseDate: date, baseTime: '2300', issuedAt: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T23:00:00+09:00` };
}

function previousMonthRange(now = new Date()): { startDate: string; endDate: string } {
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [year, month] = localDate.split('-').map(Number);
  const end = new Date(Date.UTC(year, month - 1, 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const compact = (date: Date) => date.toISOString().slice(0, 10).replaceAll('-', '');
  return { startDate: compact(start), endDate: compact(end) };
}

function makeCandidate(input: Omit<SyncCandidate, 'payloadHash'>): SyncCandidate {
  return { ...input, payloadHash: hashPayload(input.payload) };
}

export function applyOptionalLimit<T>(items: T[], limit?: number): T[] {
  return limit === undefined ? items : items.slice(0, limit);
}

export function buildMidForecastCandidates(forecasts: NormalizedMidForecast[]): SyncCandidate[] {
  return forecasts.flatMap((forecast) => {
    const payload = forecast as unknown as Record<string, unknown>;
    const forecastAt = `${forecast.forecastDate}T00:00:00+09:00`;
    const values: Array<{
      category: 'WF_AM' | 'WF_PM' | 'TMN' | 'TMX';
      valueText: string | null;
      valueNumber: number | null;
      unit: string | null;
    }> = [
      { category: 'WF_AM', valueText: forecast.weatherAm, valueNumber: null, unit: null },
      { category: 'WF_PM', valueText: forecast.weatherPm, valueNumber: null, unit: null },
      { category: 'TMN', valueText: null, valueNumber: forecast.minTemperatureC, unit: '℃' },
      { category: 'TMX', valueText: null, valueNumber: forecast.maxTemperatureC, unit: '℃' },
    ];

    return values.map(({ category, valueText, valueNumber, unit }) => makeCandidate({
      apiKey: 'kma_mid',
      sourceItemKey: `${forecast.forecastDate}:${category}`,
      scopeKey: '11B00000:11B10101',
      payload,
      reviewStatus: 'approved',
      reviewNote: 'automatic_official_forecast',
      coreDataset: 'weather',
      corePayload: {
        forecast_kind: 'mid',
        scope_key: '11B00000:11B10101',
        issued_at: forecast.issuedAt,
        forecast_at: forecastAt,
        category,
        value_text: valueText,
        value_number: valueNumber,
        unit,
        source_payload: forecast,
      },
      publishable: true,
    }));
  });
}

export function buildWellnessCandidate(
  raw: Record<string, unknown>,
  places: readonly PlaceMatchCandidate[] = [],
): SyncCandidate {
  const sourceItemKey = text(raw, 'contentId', 'contentid', 'title');
  const baseAddress = text(raw, 'baseAddr', 'addr1');
  const detailAddress = text(raw, 'detailAddr', 'addr2');
  const address = [baseAddress, detailAddress].filter(Boolean).join(' ') || null;
  const lat = numberOrNull(raw.mapY ?? raw.mapy);
  const lng = numberOrNull(raw.mapX ?? raw.mapx);
  const contentId = text(raw, 'contentId', 'contentid') || null;
  const match = matchPublishedPlace({ contentId, names: [text(raw, 'title')] }, places);
  const decision = reviewTourismCandidate({
    sourceId: sourceItemKey,
    address,
    lat,
    lng,
    matchedPlaceId: match.placeId,
  });

  return makeCandidate({
    apiKey: 'kto_wellness',
    sourceItemKey,
    scopeKey: 'suwon:20000m',
    payload: raw,
    reviewStatus: decision.status,
    reviewNote: decision.reasons.join(','),
    coreDataset: 'wellness',
    corePayload: {
      source_item_key: sourceItemKey,
      place_id: match.placeId,
      name: text(raw, 'title') || sourceItemKey,
      address_full: address,
      lat,
      lng,
      tags: text(raw, 'tagName', 'wellnessTag', 'wellnessThemaCd')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      source_payload: raw,
    },
    publishable: decision.status === 'approved',
  });
}

export function buildPhotoCandidate(
  raw: Record<string, unknown>,
  places: readonly PlaceMatchCandidate[] = [],
): SyncCandidate {
  const sourceItemKey = text(raw, 'galContentId', 'galContentid');
  const title = text(raw, 'galTitle') || sourceItemKey;
  const address = text(raw, 'galPhotographyLocation', 'addr1') || null;
  const imageUrl = text(raw, 'galWebImageUrl', 'galWebImageUrl2') || null;
  const match = matchPublishedPlace({ names: [title, address] }, places);
  const decision = reviewPhotoCandidate({
    sourceId: sourceItemKey,
    address,
    imageUrl,
    copyrightCode: text(raw, 'cpyrhtDivCd', 'galCopyright') || null,
    sourceUrl: sourceItemKey
      ? `https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=${encodeURIComponent(sourceItemKey)}`
      : null,
    matchedPlaceId: match.placeId,
  });

  return makeCandidate({
    apiKey: 'kto_photo',
    sourceItemKey,
    scopeKey: 'keyword:수원',
    payload: raw,
    reviewStatus: decision.status,
    reviewNote: decision.reasons.join(','),
    coreDataset: 'photo',
    corePayload: {
      source_item_key: sourceItemKey,
      place_id: match.placeId,
      title,
      address_full: address,
      image_url: imageUrl,
      thumbnail_url: text(raw, 'galWebImageUrl2') || null,
      copyright_code: text(raw, 'cpyrhtDivCd', 'galCopyright') || null,
      photographer: text(raw, 'galPhotographer') || null,
      source_url: sourceItemKey
        ? `https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=${encodeURIComponent(sourceItemKey)}`
        : null,
    },
    publishable: decision.status === 'approved',
  });
}

export function buildLocalHubCandidate(
  raw: Record<string, unknown>,
  baseMonth: string,
  districtCode: string,
  places: readonly PlaceMatchCandidate[] = [],
): SyncCandidate {
  const sourceItemKey = text(raw, 'hubTatsCd', 'contentid', 'hubTatsNm');
  const title = text(raw, 'hubTatsNm', 'title') || sourceItemKey;
  const match = matchPublishedPlace({ names: [title] }, places);
  return makeCandidate({
    apiKey: 'kto_local_hub',
    sourceItemKey,
    scopeKey: `${baseMonth}:${districtCode}`,
    payload: raw,
    reviewStatus: match.placeId ? 'approved' : 'hold',
    reviewNote: match.placeId ? '' : match.reason,
    coreDataset: 'local_hub',
    corePayload: {
      source_item_key: sourceItemKey,
      base_month: baseMonth,
      district_code: districtCode,
      place_id: match.placeId,
      title,
      source_payload: raw,
    },
    publishable: match.placeId !== null,
  });
}

export function buildRelatedCandidate(
  raw: Record<string, unknown>,
  baseMonth: string,
  districtCode: string,
  places: readonly PlaceMatchCandidate[] = [],
): SyncCandidate {
  const origin = text(raw, 'tAtsCd', 'originId', 'tAtsNm');
  const related = text(raw, 'rlteTatsCd', 'relatedId', 'rlteTatsNm');
  const originMatch = matchPublishedPlace({ names: [text(raw, 'tAtsNm')] }, places);
  const relatedMatch = matchPublishedPlace({ names: [text(raw, 'rlteTatsNm')] }, places);
  const relationScore = numberOrNull(raw.rlteRank ?? raw.relationScore);
  const decision = reviewRelation({
    originPlaceId: originMatch.placeId,
    relatedPlaceId: relatedMatch.placeId,
    originPublished: originMatch.placeId !== null,
    relatedPublished: relatedMatch.placeId !== null,
    score: relationScore,
  });

  return makeCandidate({
    apiKey: 'kto_related',
    sourceItemKey: `${origin}:${related}`,
    scopeKey: `${baseMonth}:${districtCode}`,
    payload: raw,
    reviewStatus: decision.status,
    reviewNote: decision.reasons.join(','),
    coreDataset: 'related',
    corePayload: {
      origin_source_key: origin,
      related_source_key: related,
      base_month: baseMonth,
      district_code: districtCode,
      origin_place_id: originMatch.placeId,
      related_place_id: relatedMatch.placeId,
      relation_score: relationScore,
      source_payload: raw,
    },
    publishable: decision.status === 'approved',
  });
}

function suwonCoordinate(item: Record<string, unknown>): boolean {
  const lat = numberOrNull(item.lat ?? item.mapy ?? item.startY);
  const lng = numberOrNull(item.lng ?? item.mapx ?? item.startX);
  return lat !== null && lng !== null && lat >= 37.18 && lat <= 37.35 && lng >= 126.9 && lng <= 127.15;
}

async function loadDefaultJob(job: PublicDataJob, limit: number | undefined, repository: PublicDataRepository): Promise<LoadedPublicDataJob> {
  const kto = createKtoExtraClient(getPublicDataServiceKey('kto'));
  const places = ['photo', 'wellness', 'local_hub', 'related'].includes(job)
    ? await repository.listPlaceMatchCandidates?.() ?? []
    : [];
  if (job === 'photo') {
    const items = await kto.fetchPhotos({ keyword: '수원', limit });
    return {
      scopeCounts: { suwon_keyword: items.length },
      candidates: items.map((raw) => buildPhotoCandidate(raw as Record<string, unknown>, places)),
    };
  }

  if (job === 'wellness') {
    const items = await kto.fetchWellness({ mapX: 127.0095, mapY: 37.2818, radiusM: 20_000, limit });
    return {
      scopeCounts: { suwon_20km: items.length },
      candidates: items.map((raw) => buildWellnessCandidate(raw as Record<string, unknown>, places)),
    };
  }

  if (job === 'local_hub' || job === 'related') {
    const baseMonth = previousMonthRange().endDate.slice(0, 6);
    const result = job === 'local_hub'
      ? await kto.fetchLocalHub({ baseMonth, limit })
      : await kto.fetchRelated({ baseMonth, limit });
    return {
      scopeCounts: result.scopeCounts,
      warnings: result.zeroDistricts.map((code) => `zero district: ${code}`),
      candidates: result.items.map((raw) => {
        const item = raw as Record<string, unknown>;
        const districtCode = text(item, 'signguCd', 'signguCode') || 'unknown';
        if (job === 'local_hub') {
          return buildLocalHubCandidate(item, baseMonth, districtCode, places);
        }
        return buildRelatedCandidate(item, baseMonth, districtCode, places);
      }),
    };
  }

  if (job === 'durunubi') {
    const items = await kto.fetchDurunubi({ limit });
    const candidates = items.map((raw) => {
      const item = raw as Record<string, unknown>;
      const sourceItemKey = text(item, 'crsIdx', 'crsNo', 'crsKorNm');
      const intersectsSuwon = /수원/.test(text(item, 'crsKorNm', 'crsDstnc', 'sigun')) || suwonCoordinate(item);
      const decision = reviewDurunubiCourse({ sourceId: sourceItemKey, intersectsSuwon, sourceUrl: 'https://www.durunubi.kr/' });
      return makeCandidate({
        apiKey: 'durunubi', sourceItemKey, scopeKey: 'nationwide', payload: item,
        reviewStatus: decision.status, reviewNote: decision.reasons.join(','),
        coreDataset: 'durunubi', corePayload: { source_item_key: sourceItemKey, title: text(item, 'crsKorNm') || sourceItemKey, address_full: text(item, 'crsContents') || null, lat: numberOrNull(item.startY), lng: numberOrNull(item.startX), course_path: [], intersects_suwon: intersectsSuwon, source_payload: item },
        publishable: decision.status === 'approved',
      });
    });
    const suwonCount = candidates.filter((item) => item.publishable).length;
    return { candidates, scopeCounts: { nationwide: items.length, suwon: suwonCount }, warnings: suwonCount === 0 ? ['healthy zero: no reviewed Suwon course'] : [], zeroResult: suwonCount === 0 };
  }

  if (job === 'visitors') {
    const range = previousMonthRange();
    const items = await kto.fetchRegionalVisitors({
      ...range,
      districtCodes: SUWON_ADMIN_DISTRICT_CODES,
      limit,
    });
    return {
      scopeCounts: Object.fromEntries(SUWON_ADMIN_DISTRICT_CODES.map((code) => [code, items.filter((item) => item.signguCode === code).length])),
      candidates: items.map((raw) => {
        const item = raw as Record<string, unknown>;
        return makeCandidate({
          apiKey: 'kto_visitors', sourceItemKey: raw.sourceItemKey, scopeKey: range.endDate.slice(0, 6), payload: item,
          reviewStatus: 'approved', reviewNote: 'internal_analysis_only', coreDataset: 'visitors',
          corePayload: { stat_date: `${raw.baseYmd.slice(0, 4)}-${raw.baseYmd.slice(4, 6)}-${raw.baseYmd.slice(6, 8)}`, district_code: raw.signguCode, visitor_type: raw.touDivNm, visitor_count: numberOrNull(item.touNum ?? item.visitorCount) ?? 0, source_payload: item },
        });
      }),
    };
  }

  if (job === 'weather_short') {
    const base = latestVillageBase();
    const client = new PublicDataClient({ baseUrl: 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0', serviceKey: getPublicDataServiceKey('kma'), commonParams: { dataType: 'JSON' } });
    const page = await client.requestPage<VillageForecastItem>('getVilageFcst', { base_date: base.baseDate, base_time: base.baseTime, nx: '60', ny: '121', pageNo: '1', numOfRows: '1000' });
    const forecasts = normalizeVillageForecast(page.items, base.issuedAt);
    const candidates = forecasts.flatMap((forecast) => [
      ['TMP', forecast.temperatureC, '℃'], ['POP', forecast.precipitationProbability, '%'],
      ['PTY', forecast.precipitationType, null], ['PCP', forecast.precipitationAmountMm, 'mm'],
      ['WSD', forecast.windSpeedMps, 'm/s'], ['SKY', forecast.skyCode, null],
    ].map(([category, value, unit]) => makeCandidate({
      apiKey: 'kma_short', sourceItemKey: `${forecast.forecastAt}:${category}`, scopeKey: '60:121', payload: forecast as unknown as Record<string, unknown>,
      reviewStatus: 'approved', reviewNote: 'automatic_official_forecast', coreDataset: 'weather',
      corePayload: { forecast_kind: 'short', scope_key: '60:121', issued_at: forecast.issuedAt, forecast_at: forecast.forecastAt, category, value_text: category === 'PCP' ? forecast.precipitationText : null, value_number: value, unit, source_payload: forecast },
      publishable: true,
    })));
    return { candidates: limit ? candidates.slice(0, limit) : candidates, scopeCounts: { '60:121': forecasts.length } };
  }

  if (job === 'weather_mid') {
    const client = new PublicDataClient({ baseUrl: 'https://apis.data.go.kr/1360000/MidFcstInfoService', serviceKey: getPublicDataServiceKey('kma'), commonParams: { dataType: 'JSON' } });
    const tmFc = latestMidForecastBase();
    const [land, temperature] = await Promise.all([
      client.requestPage<Record<string, string>>('getMidLandFcst', { regId: '11B00000', tmFc, pageNo: '1', numOfRows: '10' }),
      client.requestPage<Record<string, string>>('getMidTa', { regId: '11B10101', tmFc, pageNo: '1', numOfRows: '10' }),
    ]);
    const issuedAt = `${tmFc.slice(0, 4)}-${tmFc.slice(4, 6)}-${tmFc.slice(6, 8)}T${tmFc.slice(8, 10)}:00:00+09:00`;
    const forecasts = normalizeMidForecast(land.items[0] ?? {}, temperature.items[0] ?? {}, issuedAt);
    const candidates = buildMidForecastCandidates(forecasts);
    return { candidates: applyOptionalLimit(candidates, limit), scopeCounts: { capital_region: forecasts.length } };
  }

  const stops = await repository.listApprovedBusStops?.() ?? [];
  if (stops.length === 0) return { candidates: [], scopeCounts: { mapped_stations: 0 }, warnings: ['no reviewed station mapping'], hold: true };
  const key = getPublicDataServiceKey('gyeonggi');
  const candidates: SyncCandidate[] = [];
  for (const stop of applyOptionalLimit(stops, limit)) {
    const url = new URL('https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2');
    url.searchParams.set('serviceKey', key);
    url.searchParams.set('stationId', stop.stationId);
    url.searchParams.set('format', 'json');
    let response: Response | null = null;
    let lastFetchError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!([408, 429, 500, 502, 503, 504] as number[]).includes(response.status) || attempt === 3) break;
      } catch (error) {
        lastFetchError = error;
        if (attempt === 3) throw error;
      } finally {
        clearTimeout(timeout);
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
    if (!response) throw lastFetchError instanceof Error ? lastFetchError : new Error('Bus arrival request failed');
    const payload = await response.json() as { response?: { msgHeader?: { resultCode?: number }; msgBody?: { busArrivalList?: BusArrivalSourceItem | BusArrivalSourceItem[] } } };
    const resultCode = Number(payload.response?.msgHeader?.resultCode ?? -1);
    if (!response.ok || (resultCode !== 0 && resultCode !== 4)) throw new Error(`Bus arrival request failed for reviewed station ${stop.stationId}`);
    if (resultCode === 4) continue;
    const raw = payload.response?.msgBody?.busArrivalList;
    const items = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    const fetchedAt = new Date().toISOString();
    for (const arrival of normalizeBusArrivals(items.map((item) => ({ ...item, stationId: item.stationId || stop.stationId })), fetchedAt)) {
      const itemPayload = arrival as unknown as Record<string, unknown>;
      candidates.push(makeCandidate({
        apiKey: 'gg_bus_arrival', sourceItemKey: `${arrival.stationId}:${arrival.routeId}:${arrival.arrivalOrder}`, scopeKey: arrival.stationId,
        payload: itemPayload, reviewStatus: 'approved', reviewNote: 'reviewed_station_mapping', publishable: true,
        coreDataset: 'bus_arrival', corePayload: { station_id: arrival.stationId, route_id: arrival.routeId, route_name: arrival.routeName, arrival_order: arrival.arrivalOrder, arrival_seconds: arrival.arrivalSeconds, remaining_stops: arrival.remainingStops, fetched_at: arrival.fetchedAt, source_payload: itemPayload },
      }));
    }
  }
  return { candidates, scopeCounts: { mapped_stations: stops.length } };
}

function createSupabaseRepository(client: SupabaseClient): PublicDataRepository {
  return {
    async startRun(job) {
      const { data, error } = await client.rpc('sync_run_start', { p_source: `GitHubActions:${job}`, p_metadata: { public_data: true } });
      if (error || typeof data !== 'string') throw new Error(`sync_run_start failed: ${error?.message ?? 'missing run id'}`);
      return data;
    },
    async saveRaw(runId, item) {
      const { data, error } = await client.rpc('sync_public_api_item', {
        p_run_id: runId, p_api_key: item.apiKey, p_source_item_key: item.sourceItemKey,
        p_scope_key: item.scopeKey, p_payload: item.payload, p_payload_hash: item.payloadHash,
        p_source_updated_at: item.sourceUpdatedAt ?? null,
      });
      if (error) throw new Error(error.message);
      return { changed: Boolean((data as { changed?: unknown } | null)?.changed) };
    },
    async saveCore(item) {
      const { error } = await client.rpc('sync_public_api_core', { p_dataset: item.coreDataset, p_payload: item.corePayload });
      if (error) throw new Error(error.message);
    },
    async saveReview(item) {
      const { error } = await client.rpc('sync_public_api_review', {
        p_api_key: item.apiKey, p_source_item_key: item.sourceItemKey,
        p_scope_key: item.scopeKey, p_review_status: item.reviewStatus,
        p_review_note: item.reviewNote || null,
      });
      if (error) throw new Error(error.message);
    },
    async recordError(runId, item, error) {
      await client.rpc('sync_run_error', {
        p_run_id: runId, p_endpoint: item.apiKey, p_content_id: item.sourceItemKey,
        p_error_code: error instanceof Error ? error.name : 'UNKNOWN',
        p_message: error instanceof Error ? error.message : String(error),
      });
    },
    async finishRun(runId, status, metadata) {
      const { error } = await client.rpc('sync_run_finish', {
        p_run_id: runId,
        p_status: status === 'hold' ? 'completed' : status,
        p_items_fetched: metadata.fetched,
        p_items_upserted: metadata.upserted,
        p_error_count: metadata.errors,
        p_metadata: { ...metadata, operational_status: status },
      });
      if (error) throw new Error(`sync_run_finish failed: ${error.message}`);
    },
    async listApprovedBusStops() {
      const { data, error } = await client.schema('core').from('place_bus_stops').select('station_id, station_name').eq('review_status', 'approved');
      if (error) throw new Error(error.message);
      const unique = new Map<string, { stationId: string; stationName: string }>();
      for (const row of data ?? []) {
        const stationId = String(row.station_id);
        if (!unique.has(stationId)) unique.set(stationId, { stationId, stationName: String(row.station_name) });
      }
      return [...unique.values()];
    },
    async listPlaceMatchCandidates() {
      const [placesResult, sourcesResult, statesResult, copyResult] = await Promise.all([
        client.schema('core').from('places').select('id, official_name').eq('is_active', true),
        client.schema('core').from('place_sources').select('place_id, kto_content_id'),
        client.schema('editorial').from('place_publish_state').select('place_id, is_published'),
        client.schema('editorial').from('place_copy').select('place_id, display_name'),
      ]);
      const error = placesResult.error ?? sourcesResult.error ?? statesResult.error ?? copyResult.error;
      if (error) throw new Error(`place matching lookup failed: ${error.message}`);
      const sourceByPlace = new Map((sourcesResult.data ?? []).map((row) => [String(row.place_id), String(row.kto_content_id)]));
      const publishedByPlace = new Map((statesResult.data ?? []).map((row) => [String(row.place_id), row.is_published === true]));
      const displayNameByPlace = new Map((copyResult.data ?? []).map((row) => [String(row.place_id), row.display_name ? String(row.display_name) : null]));
      return (placesResult.data ?? []).map((row) => {
        const placeId = String(row.id);
        return {
          placeId,
          officialName: String(row.official_name),
          displayName: displayNameByPlace.get(placeId) ?? null,
          ktoContentId: sourceByPlace.get(placeId) ?? null,
          isPublished: publishedByPlace.get(placeId) === true,
        };
      });
    },
  };
}

async function main() {
  const options = parsePublicDataArgs();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const repository = createSupabaseRepository(createClient(url, serviceKey, { auth: { persistSession: false } }));
  const result = await runPublicDataJob(options, {
    repository,
    loadJob: (job, limit) => loadDefaultJob(job, limit, repository),
  });
  console.log(JSON.stringify({ job: options.job, status: result.status, ...result.metadata }));
  if (result.status === 'failed') process.exitCode = 1;
}

if (process.argv[1]?.endsWith('sync-public-data.ts')) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
