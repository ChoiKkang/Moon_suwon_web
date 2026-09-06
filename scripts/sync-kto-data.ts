import { loadEnvConfig } from '@next/env';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getRequiredServerEnv } from '../src/lib/env/server';
import { KtoApiError, KtoClient } from '../src/lib/kto/client';
import { normalizeImages, normalizePlace } from '../src/lib/kto/normalize';
import type { KtoCrowdForecastItem, KtoImageItem, KtoListItem, KtoPetTourItem } from '../src/lib/kto/types';

loadEnvConfig(process.cwd());

type SyncJob = 'content' | 'crowd' | 'pet';
type SyncPlace = { place_id: string; kto_content_id: string; official_name: string };

type SyncStats = {
  itemsFetched: number;
  itemsUpserted: number;
  errorCount: number;
  zeroResultContentIds: string[];
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

function parseJob(): SyncJob {
  const index = process.argv.indexOf('--job');
  const value = index >= 0 ? process.argv[index + 1] : undefined;

  if (value === 'content' || value === 'crowd' || value === 'pet') {
    return value;
  }

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    writeLine('Usage: npm run sync:data -- --job content|crowd|pet');
    process.exit(0);
  }

  throw new Error('작업을 지정해야 합니다. --job content|crowd|pet 중 하나를 사용하세요.');
}

function createStats(): SyncStats {
  return { itemsFetched: 0, itemsUpserted: 0, errorCount: 0, zeroResultContentIds: [] };
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

function isPetAccessError(error: unknown): boolean {
  if (!(error instanceof KtoApiError)) {
    return false;
  }

  return error.status === 401 || error.status === 403 || error.resultCode === '20' || error.resultCode === '30';
}

async function callRpc<T>(client: SupabaseClient, functionName: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(functionName, params);
  if (error) {
    throw new Error(`${functionName} failed: ${error.message}`);
  }
  return data as T;
}

async function recordSyncError(runId: string, stats: SyncStats, error: unknown, contentId?: string) {
  const details = errorDetails(error);
  stats.errorCount += 1;

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

async function syncContent(runId: string, stats: SyncStats) {
  const attractions = await kto.fetchSuwonAttractions();
  if (attractions.length === 0) {
    throw new Error('KTO areaBasedList2에서 수원 관광지 목록을 받지 못했습니다.');
  }

  stats.itemsFetched = attractions.length;
  writeLine(`content: fetched ${attractions.length}`);

  for (const listItem of attractions) {
    let detail = null;
    let images: KtoImageItem[] = [];

    try {
      detail = await kto.fetchDetail(listItem.contentid);
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, listItem.contentid);
    }

    try {
      images = await kto.fetchImages(listItem.contentid);
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, listItem.contentid);
    }

    try {
      const normalizedPlace = normalizePlace(listItem, detail);
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
      }
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, listItem.contentid);
    }
  }
}

function toIsoDate(value: string): string {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`잘못된 혼잡도 날짜입니다: ${value}`);
  }

  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function toCrowdRows(items: KtoCrowdForecastItem[]) {
  return items.flatMap((item) => {
    const rate = Number(item.cnctrRate);
    if (!Number.isFinite(rate) || !item.areaCd || !item.signguCd || !item.tAtsNm) {
      return [];
    }

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

async function syncCrowd(runId: string, stats: SyncStats) {
  const items = await kto.fetchCrowdForecasts({ areaCode: '41', sigunguCode: '41115' });
  if (items.length === 0) {
    throw new Error('TatsCnctrRateService에서 수원 혼잡도 예보를 받지 못했습니다.');
  }

  const rows = toCrowdRows(items);
  stats.itemsFetched = rows.length;
  if (rows.length === 0) {
    throw new Error('혼잡도 응답에 유효한 예보 행이 없습니다.');
  }

  const matchedCount = await callRpc<number>(supabase, 'sync_kto_crowd_batch', {
    p_run_id: runId,
    p_rows: rows,
  });

  stats.itemsUpserted = Number(matchedCount) || 0;
  writeLine(`crowd: fetched ${stats.itemsFetched}, matched/upserted ${stats.itemsUpserted}`);
}

async function syncPet(runId: string, stats: SyncStats) {
  const places = await callRpc<SyncPlace[]>(supabase, 'sync_list_places', {});
  if (places.length === 0) {
    throw new Error('반려동물 동기화 대상 KTO 장소가 없습니다.');
  }

  stats.itemsFetched = places.length;
  let successfulResults = 0;
  writeLine(`pet: checking ${places.length} places`);

  for (const place of places) {
    let pet: KtoPetTourItem | null;

    try {
      pet = await kto.fetchPetDetail(place.kto_content_id);
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, place.kto_content_id);
      if (isPetAccessError(error)) {
        throw new Error('KorService2 detailPetTour2 사용 권한이 없습니다. 공공데이터포털에서 해당 API 활용신청/승인을 확인하세요.');
      }
      continue;
    }

    if (!pet) {
      stats.zeroResultContentIds.push(place.kto_content_id);
      continue;
    }

    try {
      const upserted = await callRpc<boolean>(supabase, 'sync_kto_pet_item', {
        p_run_id: runId,
        p_content_id: place.kto_content_id,
        p_payload: pet,
      });
      if (upserted) {
        successfulResults += 1;
        stats.itemsUpserted += 1;
      }
    } catch (error: unknown) {
      await recordSyncError(runId, stats, error, place.kto_content_id);
    }
  }

  if (successfulResults === 0) {
    throw new Error('반려동물 API에서 저장할 수 있는 결과가 없습니다. API 승인 상태와 contentId를 확인하세요.');
  }

  writeLine(`pet: fetched ${stats.itemsFetched}, upserted ${stats.itemsUpserted}, zero-result ${stats.zeroResultContentIds.length}`);
}

async function main() {
  const job = parseJob();
  const source = `GitHubActions:${job}`;
  const stats = createStats();
  const runId = await callRpc<string>(supabase, 'sync_run_start', {
    p_source: source,
    p_metadata: { job, runner: 'scripts/sync-kto-data.ts' },
  });

  let fatalError: unknown = null;

  try {
    if (job === 'content') await syncContent(runId, stats);
    if (job === 'crowd') await syncCrowd(runId, stats);
    if (job === 'pet') await syncPet(runId, stats);
  } catch (error: unknown) {
    fatalError = error;
    await recordSyncError(runId, stats, error);
  } finally {
    const status = fatalError ? 'failed' : 'completed';
    try {
      await callRpc(supabase, 'sync_run_finish', {
        p_run_id: runId,
        p_status: status,
        p_items_fetched: stats.itemsFetched,
        p_items_upserted: stats.itemsUpserted,
        p_error_count: stats.errorCount,
        p_metadata: {
          job,
          runner: 'scripts/sync-kto-data.ts',
          zero_result_content_ids: stats.zeroResultContentIds,
        },
      });
    } catch (finishError: unknown) {
      if (!fatalError) fatalError = finishError;
      writeError(`sync run 종료 기록 실패: ${finishError instanceof Error ? finishError.message : String(finishError)}`);
    }
  }

  writeLine(`${source}: ${fatalError ? 'failed' : 'completed'} (fetched=${stats.itemsFetched}, upserted=${stats.itemsUpserted}, errors=${stats.errorCount})`);

  if (fatalError) {
    throw fatalError;
  }
}

void main().catch((error: unknown) => {
  writeError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
