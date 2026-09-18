import { loadEnvConfig } from '@next/env';
import { appendFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRequiredServerEnv } from '../src/lib/env/server';
import { KtoApiError, KtoClient } from '../src/lib/kto/client';
import {
  classifySyncStatus,
  paginatePetCandidates,
  type PetDiscoveryConfig,
  type PetEnrichmentRow,
} from '../src/lib/kto/pet-sync';
import { isSuwonFestival, normalizeFestival, normalizeImages, normalizePlace } from '../src/lib/kto/normalize';
import type {
  KtoCrowdForecastItem,
  KtoFestivalItem,
  KtoImageItem,
  KtoListItem,
  KtoPetTourItem,
} from '../src/lib/kto/types';

loadEnvConfig(process.cwd());

export type SyncJob = 'content' | 'events' | 'crowd' | 'pet';
type SyncPlace = PetEnrichmentRow & { place_id: string };
type RunnerOptions = { job: SyncJob; dryRun: boolean; limit: number | null };

export type SyncStats = {
  itemsFetched: number;
  itemsUpserted: number;
  errorCount: number;
  zeroResultContentIds: string[];
  candidatesDiscovered: number;
  staleMarked: number;
  detailsAttempted: number;
};

const PET_CONCURRENCY = 3;
// 수원시 4개 구. 혼잡도 예측은 구 단위로만 조회할 수 있어 전 구를 순회해야
// 팔달구 밖 공개 장소(장안공원 등)까지 예측이 붙는다.
const SUWON_SIGUNGU_CODES = ['41111', '41113', '41115', '41117'] as const;
const PET_DISCOVERY: PetDiscoveryConfig = {
  areaCode: '41',
  sigunguCodes: ['111', '113', '115', '117'],
  // Content type 38 (쇼핑) returns mall tenants such as individual Starfield
  // brand floors, which are not night-walk destinations and buried the real
  // heritage candidates in the admin review queue. 달빛수원 curates 야간 산책
  // 코스, so pet discovery stays on 관광지(12), 문화시설(14), 행사(15),
  // 레포츠(28), 숙박(32), 음식점(39).
  contentTypeIds: ['12', '14', '15', '28', '32', '39'],
  pageSize: 100,
};

const supabase = createClient(
  getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const kto = new KtoClient({
  serviceKey: getRequiredServerEnv('KTO_SERVICE_KEY'),
});

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function writeError(message: string) {
  process.stderr.write(`${message}\n`);
}

function writeGithubOutput(stats: SyncStats, status: 'completed' | 'partial' | 'failed') {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  appendFileSync(
    outputPath,
    `status=${status}\nitems_fetched=${stats.itemsFetched}\nitems_upserted=${stats.itemsUpserted}\nerror_count=${stats.errorCount}\n`,
  );
}

function parseOptions(): RunnerOptions {
  const jobIndex = process.argv.indexOf('--job');
  const jobValue = jobIndex >= 0 ? process.argv[jobIndex + 1] : undefined;
  const limitIndex = process.argv.indexOf('--limit');
  const limitValue = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : null;

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    writeLine('Usage: npm run sync:data -- --job content|events|crowd|pet [--dry-run] [--limit N]');
    process.exit(0);
  }

  if (jobValue !== 'content' && jobValue !== 'events' && jobValue !== 'crowd' && jobValue !== 'pet') {
    throw new Error('작업을 지정해야 합니다. --job content|events|crowd|pet 중 하나를 사용하세요.');
  }

  if (limitValue !== null && (!Number.isInteger(limitValue) || limitValue < 0)) {
    throw new Error('--limit은 0 이상의 정수여야 합니다.');
  }

  return { job: jobValue, dryRun: process.argv.includes('--dry-run'), limit: limitValue };
}

function createStats(): SyncStats {
  return {
    itemsFetched: 0,
    itemsUpserted: 0,
    errorCount: 0,
    zeroResultContentIds: [],
    candidatesDiscovered: 0,
    staleMarked: 0,
    detailsAttempted: 0,
  };
}

function errorDetails(error: unknown): { endpoint: string; code: string | null; message: string } {
  if (error instanceof KtoApiError) {
    return {
      endpoint: error.endpoint,
      code: error.resultCode ?? (error.status ? `HTTP_${error.status}` : null),
      message: error.message,
    };
  }

  return {
    endpoint: 'sync',
    code: null,
    message: error instanceof Error ? error.message : String(error),
  };
}

async function callRpc<T>(client: SupabaseClient, functionName: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(functionName, params);
  if (error) throw new Error(`${functionName} failed: ${error.message}`);
  return data as T;
}

async function recordSyncError(runId: string, stats: SyncStats, error: unknown, contentId?: string, persist = true) {
  const details = errorDetails(error);
  stats.errorCount += 1;

  if (persist && runId !== 'dry-run') {
    try {
      await callRpc(supabase, 'sync_run_error', {
        p_run_id: runId,
        p_endpoint: details.endpoint,
        p_content_id: contentId ?? null,
        p_error_code: details.code,
        p_message: details.message,
      });
    } catch (recordError: unknown) {
      writeError(`sync error 기록 실패: ${recordError instanceof Error ? recordError.message : String(recordError)}`);
    }
  }

  writeError(`${details.endpoint}${contentId ? ` (${contentId})` : ''}: ${details.message}`);
}

function toImageRows(listItem: KtoListItem, imageItems: KtoImageItem[]) {
  const normalized = normalizeImages('sync-place-id', listItem, imageItems);
  const rawBySourceId = new Map<string, KtoImageItem>();

  for (const [index, item] of imageItems.entries()) {
    if (!item.originimgurl) continue;
    rawBySourceId.set(item.serialnum || `${item.contentid}:image:${index}`, item);
  }

  return normalized.map((image) => ({
    ...image,
    payload_json: rawBySourceId.get(image.source_image_id) ?? listItem,
  }));
}

async function syncContent(runId: string, stats: SyncStats, options: RunnerOptions): Promise<'completed' | 'partial'> {
  const attractions = await kto.fetchSuwonAttractions();
  if (attractions.length === 0) throw new Error('KTO areaBasedList2에서 수원 관광지 목록을 받지 못했습니다.');

  stats.itemsFetched = attractions.length;
  writeLine(`content: fetched ${attractions.length}`);

  for (const listItem of attractions) {
    let detail = null;
    let images: KtoImageItem[] = [];

    try {
      detail = await kto.fetchDetail(listItem.contentid);
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, listItem.contentid, !options.dryRun);
    }

    try {
      images = await kto.fetchImages(listItem.contentid);
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, listItem.contentid, !options.dryRun);
    }

    let intro: Awaited<ReturnType<typeof kto.fetchIntro>> = null;
    try {
      intro = await kto.fetchIntro(listItem.contentid, listItem.contenttypeid);
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, listItem.contentid, !options.dryRun);
    }

    try {
      const normalizedPlace = normalizePlace(listItem, detail);
      if (!options.dryRun) {
        const placeId = await callRpc<string>(supabase, 'sync_kto_content_item', {
          p_run_id: runId,
          p_content_id: listItem.contentid,
          p_content_type_id: listItem.contenttypeid,
          p_list_payload: listItem,
          p_detail_payload: detail ?? {},
          p_normalized_place: normalizedPlace,
          p_images: toImageRows(listItem, images),
        });
        if (placeId) {
          stats.itemsUpserted += 1;
          // Operating hours live outside the existing RPC contract so the
          // mobile app's sync payload stays unchanged. Store the raw KTO text
          // and let the course verifier interpret it conservatively.
          const useTime = cleanIntroText(intro?.usetime);
          const restDay = cleanIntroText(intro?.restdate);
          if (useTime || restDay) {
            const { error: hoursError } = await supabase
              .schema('core')
              .from('places')
              .update({
                operating_hours_raw: useTime,
                rest_day_raw: restDay,
                operating_hours_updated_at: new Date().toISOString(),
              })
              .eq('id', placeId);
            if (hoursError) {
              await recordSyncError(runId, stats, new Error(hoursError.message), listItem.contentid, true);
            }
          }
        }
      } else {
        stats.itemsUpserted += 1;
      }
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, listItem.contentid, !options.dryRun);
    }
  }

  return stats.errorCount > 0 ? 'partial' : 'completed';
}

function cleanIntroText(value?: string): string | null {
  if (!value) return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text.slice(0, 1000) : null;
}

function toIsoDate(value: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error(`잘못된 혼잡도 날짜입니다: ${value}`);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function toCrowdRows(items: KtoCrowdForecastItem[]) {
  return items.flatMap((item) => {
    const rate = Number(item.cnctrRate);
    if (!Number.isFinite(rate) || !item.areaCd || !item.signguCd || !item.tAtsNm) return [];
    return [{
      area_code: item.areaCd,
      sigungu_code: item.signguCd,
      tourist_attraction_name: item.tAtsNm,
      forecast_date: toIsoDate(item.baseYmd),
      concentration_rate: rate,
      payload_json: item,
    }];
  });
}

async function syncCrowd(runId: string, stats: SyncStats, options: RunnerOptions): Promise<'completed' | 'partial'> {
  // 구 하나만 조회하면 그 구 밖의 공개 장소는 영구히 예측이 비어 있다. 한 구가
  // 실패해도 나머지 구의 예측은 살리고 오류만 기록한다.
  const items: Awaited<ReturnType<typeof kto.fetchCrowdForecasts>> = [];
  let failedDistricts = 0;
  for (const sigunguCode of SUWON_SIGUNGU_CODES) {
    try {
      items.push(...(await kto.fetchCrowdForecasts({ areaCode: '41', sigunguCode })));
    } catch (error: unknown) {
      failedDistricts += 1;
      await recordSyncError(runId, stats, error, sigunguCode, !options.dryRun);
    }
  }

  if (failedDistricts === SUWON_SIGUNGU_CODES.length) {
    writeLine('crowd: every district request failed');
    return 'partial';
  }

  if (items.length === 0) {
    writeLine('crowd: valid zero-result response');
    return 'completed';
  }

  const rows = toCrowdRows(items);
  stats.itemsFetched = rows.length;
  if (rows.length === 0) {
    writeLine('crowd: response contained no valid rows');
    return 'partial';
  }

  if (!options.dryRun) {
    const matchedCount = await callRpc<number>(supabase, 'sync_kto_crowd_batch', { p_run_id: runId, p_rows: rows });
    stats.itemsUpserted = Number(matchedCount) || 0;
  } else {
    stats.itemsUpserted = rows.length;
  }

  writeLine(`crowd: fetched ${stats.itemsFetched}, matched/upserted ${stats.itemsUpserted}`);
  return stats.errorCount > 0 ? 'partial' : 'completed';
}

function seoulDate(offsetDays = 0): string {
  const seoul = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  seoul.setDate(seoul.getDate() + offsetDays);
  return `${seoul.getFullYear()}${String(seoul.getMonth() + 1).padStart(2, '0')}${String(seoul.getDate()).padStart(2, '0')}`;
}

async function paginateFestivalItems(options: { startDate: string; endDate: string; limit: number | null }): Promise<KtoFestivalItem[]> {
  const items: KtoFestivalItem[] = [];
  const seen = new Set<string>();
  const pageSize = 100;
  let pageNo = 1;

  while (true) {
    const page = await kto.fetchSuwonFestivals({ eventStartDate: options.startDate, eventEndDate: options.endDate, pageNo, numOfRows: pageSize });
    for (const item of page.items) {
      if (!item.contentid || seen.has(item.contentid)) continue;
      if (!isSuwonFestival(item)) continue;
      seen.add(item.contentid);
      items.push(item);
      if (options.limit !== null && items.length >= options.limit) return items;
    }
    const rowsPerPage = page.numOfRows || pageSize;
    if (page.items.length === 0 || pageNo * rowsPerPage >= (page.totalCount || page.items.length)) break;
    pageNo += 1;
  }
  return items;
}

async function syncEvents(runId: string, stats: SyncStats, options: RunnerOptions): Promise<'completed' | 'partial'> {
  const items = await paginateFestivalItems({ startDate: seoulDate(), endDate: seoulDate(120), limit: options.limit });
  stats.itemsFetched = items.length;
  if (items.length === 0) {
    writeLine('events: valid zero-result response');
    return 'completed';
  }

  for (const item of items) {
    try {
      // searchFestival2 list rows omit eventplace/playtime/program, so the
      // detail call is required to know when a festival actually runs. The
      // course verifier uses these hours to decide whether an evening course
      // can enter a venue that is otherwise closed.
      let enriched = item;
      try {
        // Festival content type is 15 in the KTO taxonomy.
        const intro = await kto.fetchIntro(item.contentid, '15');
        if (intro) {
          enriched = {
            ...item,
            eventplace: item.eventplace || (intro as Record<string, string>).eventplace,
            playtime: item.playtime || (intro as Record<string, string>).playtime,
            usetimefestival: item.usetimefestival || (intro as Record<string, string>).usetimefestival,
            program: item.program || (intro as Record<string, string>).program,
          };
        }
      } catch (error: unknown) {
        await recordSyncError(runId, stats, error, item.contentid, !options.dryRun);
      }

      const normalizedEvent = normalizeFestival(enriched);
      if (!options.dryRun) {
        const eventId = await callRpc<string>(supabase, 'sync_kto_event_item', {
          p_run_id: runId,
          p_content_id: item.contentid,
          p_payload: enriched,
          p_normalized_event: normalizedEvent,
        });
        if (eventId) stats.itemsUpserted += 1;
      } else {
        stats.itemsUpserted += 1;
      }
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, item.contentid, !options.dryRun);
    }
  }

  writeLine(`events: fetched ${stats.itemsFetched}, upserted ${stats.itemsUpserted}`);
  return stats.errorCount > 0 ? 'partial' : 'completed';
}

async function syncPet(runId: string, stats: SyncStats, options: RunnerOptions): Promise<'completed' | 'partial' | 'failed'> {
  const discovery = await paginatePetCandidates(kto, { ...PET_DISCOVERY, limit: options.limit ?? undefined });
  stats.itemsFetched = discovery.length;
  stats.candidatesDiscovered = discovery.length;
  if (discovery.length === 0) {
    writeLine('pet: valid zero-result discovery response');
    return 'completed';
  }

  const localEnrichment: SyncPlace[] = [];
  for (const candidate of discovery) {
    try {
      const normalizedPlace = normalizePlace(candidate, null);
      if (!options.dryRun) {
        const source = candidate as KtoListItem & { __areaCode?: string; __sigunguCode?: string };
        await callRpc<string | null>(supabase, 'sync_kto_pet_candidate', {
          p_run_id: runId,
          p_content_id: candidate.contentid,
          p_content_type_id: candidate.contenttypeid,
          p_payload: candidate,
          p_normalized_place: normalizedPlace,
          p_area_code: source.__areaCode ?? PET_DISCOVERY.areaCode,
          p_sigungu_code: source.__sigunguCode ?? '',
        });
      }
      localEnrichment.push({
        place_id: '',
        kto_content_id: candidate.contentid,
        source_modified_at: normalizedPlace.source_modified_at,
        source_updated_at: null,
        last_pet_checked_at: null,
        data_status: 'unknown',
      });
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, candidate.contentid, !options.dryRun);
    }
  }

  const enrichment = options.dryRun
    ? localEnrichment
    : await callRpc<SyncPlace[]>(supabase, 'sync_list_pet_enrichment', { p_limit: options.limit ?? 250 });
  stats.detailsAttempted = enrichment.length;
  writeLine(`pet: discovered ${discovery.length}, enriching ${enrichment.length}`);

  for (let offset = 0; offset < enrichment.length; offset += PET_CONCURRENCY) {
    const batch = enrichment.slice(offset, offset + PET_CONCURRENCY);
    await Promise.all(batch.map(async (place) => {
      let pet: KtoPetTourItem | null;
      try {
        pet = await kto.fetchPetDetail(place.kto_content_id);
      } catch (error: unknown) {
        await recordSyncError(runId, stats, error, place.kto_content_id, !options.dryRun);
        return;
      }

      if (!pet) {
        stats.zeroResultContentIds.push(place.kto_content_id);
        if (!options.dryRun) {
          try {
            await callRpc<boolean>(supabase, 'sync_mark_pet_check', {
              p_run_id: runId,
              p_content_id: place.kto_content_id,
              p_status: 'unavailable',
              p_payload: {},
            });
          } catch (error: unknown) {
            await recordSyncError(runId, stats, error, place.kto_content_id, true);
          }
        }
        return;
      }

      if (!options.dryRun) {
        try {
          const upserted = await callRpc<boolean>(supabase, 'sync_kto_pet_item', {
            p_run_id: runId,
            p_content_id: place.kto_content_id,
            p_payload: pet,
          });
          if (upserted) stats.itemsUpserted += 1;
        } catch (error: unknown) {
          await recordSyncError(runId, stats, error, place.kto_content_id, true);
        }
      } else {
        stats.itemsUpserted += 1;
      }
    }));
  }

  if (!options.dryRun) {
    try {
      stats.staleMarked = Number(await callRpc<number>(supabase, 'sync_finalize_pet_discovery', { p_run_id: runId })) || 0;
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, undefined, true);
    }
  }

  writeLine(`pet: discovered ${stats.candidatesDiscovered}, attempted ${stats.detailsAttempted}, upserted ${stats.itemsUpserted}, zero-result ${stats.zeroResultContentIds.length}, stale ${stats.staleMarked}`);
  return classifySyncStatus({ listRequestFailed: false, itemErrors: stats.errorCount, itemsAttempted: stats.detailsAttempted, validEmpty: stats.zeroResultContentIds.length });
}

async function main() {
  const options = parseOptions();
  const source = `GitHubActions:${options.job}`;
  const stats = createStats();
  const shouldPersist = !options.dryRun;
  if (options.dryRun) writeLine(`dry-run: ${source}`);

  if (shouldPersist) {
    try {
      const reconciled = await callRpc<number>(supabase, 'sync_reconcile_stale_runs', { p_max_age_minutes: 90 });
      if (Number(reconciled) > 0) writeLine(`reconciled ${Number(reconciled)} stale sync run(s)`);
    } catch (error: unknown) {
      writeError(`stale sync run reconciliation skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const runId = options.dryRun
    ? 'dry-run'
    : await callRpc<string>(supabase, 'sync_run_start', {
        p_source: source,
        p_metadata: { job: options.job, runner: 'scripts/sync-kto-data.ts', dry_run: false, limit: options.limit },
      });

  let fatalError: unknown = null;
  let status: 'completed' | 'partial' | 'failed' = 'completed';
  try {
    if (options.job === 'content') status = await syncContent(runId, stats, options);
    if (options.job === 'events') status = await syncEvents(runId, stats, options);
    if (options.job === 'crowd') status = await syncCrowd(runId, stats, options);
    if (options.job === 'pet') status = await syncPet(runId, stats, options);
  } catch (error: unknown) {
    fatalError = error;
    status = 'failed';
    await recordSyncError(runId, stats, error, undefined, shouldPersist);
  } finally {
    if (shouldPersist) {
      try {
        await callRpc(supabase, 'sync_run_finish', {
          p_run_id: runId,
          p_status: status,
          p_items_fetched: stats.itemsFetched,
          p_items_upserted: stats.itemsUpserted,
          p_error_count: stats.errorCount,
          p_metadata: {
            job: options.job,
            runner: 'scripts/sync-kto-data.ts',
            zero_result_content_ids: stats.zeroResultContentIds,
            candidates_discovered: stats.candidatesDiscovered,
            details_attempted: stats.detailsAttempted,
            stale_marked: stats.staleMarked,
          },
        });
      } catch (finishError: unknown) {
        if (!fatalError) fatalError = finishError;
        status = 'failed';
        writeError(`sync run 종료 기록 실패: ${finishError instanceof Error ? finishError.message : String(finishError)}`);
      }
    }
  }

  writeLine(`${source}: ${fatalError ? 'failed' : status} (fetched=${stats.itemsFetched}, upserted=${stats.itemsUpserted}, errors=${stats.errorCount})`);
  writeGithubOutput(stats, fatalError ? 'failed' : status);
  if (fatalError) throw fatalError;
  if (status === 'failed') process.exitCode = 1;
}

void main().catch((error: unknown) => {
  writeError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
