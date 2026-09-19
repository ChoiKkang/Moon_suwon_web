import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_API_CATALOG, type PublicApiDefinition } from '../src/lib/public-data/catalog';
import { evaluateApiHealth, type ApiRunHealth, type DatasetHealthStats } from '../src/lib/public-data/health';

loadEnvConfig(process.cwd());

type SyncJob = 'content' | 'events' | 'crowd' | 'pet' | 'access' | 'audio';
type RunRow = {
  source: string;
  status: string;
  items_fetched: number;
  items_upserted: number;
  error_count: number;
  started_at: string;
  completed_at: string | null;
  metadata?: Record<string, unknown> | null;
};

type ForecastHealthRow = {
  forecast_date: string;
  source_updated_at: string | null;
};

const JOBS: SyncJob[] = ['content', 'events', 'crowd', 'pet', 'access', 'audio'];
const MAX_AGE_HOURS: Record<SyncJob, number> = {
  crowd: 36,
  events: 36,
  pet: 24 * 8,
  content: 24 * 40,
  // 주간 실행이라 콘텐츠 수집과 같은 여유를 준다. 접근성 정보는 시설 공사가
  // 아니면 잘 바뀌지 않아 하루 단위 신선도가 필요하지 않다.
  access: 24 * 40,
  // 오디오 해설은 주간 콘텐츠 수집 뒤에 갱신한다. 장소 좌표가 바뀌지 않는
  // 한 매일 새로 받을 필요가 없어 콘텐츠 수집과 같은 주기를 사용한다.
  audio: 24 * 40,
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey || !anonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
}

const serviceClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const publicClient = createClient(url, anonKey, { auth: { persistSession: false } });

function parseJob(): string {
  const index = process.argv.indexOf('--job');
  const value = index >= 0 ? process.argv[index + 1] : 'all';
  const allowed = new Set(['all', ...JOBS, ...PUBLIC_API_CATALOG.map((definition) => definition.syncJob)]);
  if (allowed.has(value)) return value;
  throw new Error(`--job은 all 또는 등록된 작업이어야 합니다: ${[...allowed].join('|')}`);
}

function hoursSince(value: string): number {
  return (Date.now() - Date.parse(value)) / (60 * 60 * 1000);
}

function formatAge(hours: number): string {
  if (!Number.isFinite(hours)) return '알 수 없음';
  if (hours < 24) return `${Math.max(0, hours).toFixed(1)}시간 전`;
  return `${(hours / 24).toFixed(1)}일 전`;
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function checkLatestRun(job: SyncJob, failures: string[], warnings: string[]) {
  const { data, error } = await serviceClient
    .schema('raw')
    .from('sync_runs')
    .select('source, status, items_fetched, items_upserted, error_count, started_at, completed_at')
    .eq('source', `GitHubActions:${job}`)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    failures.push(`${job}: 최근 동기화 이력 조회 실패 (${error.message})`);
    return;
  }

  const run = data as RunRow | null;
  if (!run) {
    failures.push(`${job}: 동기화 이력이 없습니다.`);
    return;
  }

  const completedAt = run.completed_at ?? run.started_at;
  const age = hoursSince(completedAt);
  console.log(`sync ${job}: ${run.status} | fetched=${run.items_fetched} upserted=${run.items_upserted} errors=${run.error_count} | ${formatAge(age)}`);

  if (run.status !== 'completed') {
    failures.push(`${job}: 최근 실행 상태가 ${run.status}입니다.`);
  }
  if (!Number.isFinite(age) || age > MAX_AGE_HOURS[job]) {
    failures.push(`${job}: 마지막 완료 시각이 허용 주기(${MAX_AGE_HOURS[job]}시간)를 넘었습니다.`);
  }
  if (run.error_count > 0) {
    warnings.push(`${job}: 최근 실행에 ${run.error_count}건의 부분 오류가 기록되어 있습니다.`);
  }
}

async function checkPublicServing(failures: string[], warnings: string[]) {
  const [placesResult, coursesResult, detailResult, eventsResult, forecastResult] = await Promise.all([
    publicClient.from('v_published_places').select('id, slug, hero_image_url, short_description, kto_content_id, pet_policy, pet_data_status, crowd_data_status'),
    publicClient.from('v_home_courses').select('id, slug, hero_title, spot_count'),
    publicClient.from('v_course_detail').select('course_id, place_id, place_slug, display_name, pet_policy, pet_data_status'),
    publicClient.from('v_upcoming_events').select('id, event_name, start_date, end_date'),
    serviceClient
      .schema('core')
      .from('place_crowd_forecasts')
      .select('forecast_date, source_updated_at')
      .order('forecast_date', { ascending: false })
      .order('source_updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError = placesResult.error ?? coursesResult.error ?? detailResult.error ?? eventsResult.error ?? forecastResult.error;
  if (firstError) {
    failures.push(`공개 serving view 조회 실패 (${firstError.message})`);
    return;
  }

  const places = placesResult.data ?? [];
  const courses = coursesResult.data ?? [];
  const details = detailResult.data ?? [];
  const placeIds = new Set(places.map((place) => place.id as string));
  const detailsByCourse = new Map<string, Array<{ place_id: string; place_slug: string }>>();

  for (const detail of details) {
    const rows = detailsByCourse.get(detail.course_id as string) ?? [];
    rows.push({ place_id: detail.place_id as string, place_slug: detail.place_slug as string });
    detailsByCourse.set(detail.course_id as string, rows);
  }

  const brokenLinks = courses.flatMap((course) => {
    const rows = detailsByCourse.get(course.id as string) ?? [];
    return rows.filter((row) => !placeIds.has(row.place_id)).map((row) => `${course.slug}/${row.place_slug}`);
  });

  const latestForecast = forecastResult.data as ForecastHealthRow | null;
  const today = todayInSeoul();
  console.log(`public places=${places.length} courses=${courses.length} upcoming-events=${(eventsResult.data ?? []).length}`);
  console.log(`forecast latest-date=${latestForecast?.forecast_date ?? 'none'} | today=${today}`);
  if (!latestForecast) {
    failures.push('혼잡도 정규화 예보가 없습니다.');
  } else if (latestForecast.forecast_date < today) {
    failures.push(`혼잡도 최신 예보 날짜(${latestForecast.forecast_date})가 오늘(${today})보다 이전입니다.`);
  }
  if (brokenLinks.length > 0) {
    failures.push(`공개 코스에 비공개 장소 링크 ${brokenLinks.length}건이 있습니다: ${brokenLinks.join(', ')}`);
  }

  const missingPetContract = places.filter((place) => !place.pet_policy || !place.pet_data_status).map((place) => place.slug as string);
  if (missingPetContract.length > 0) {
    failures.push(`공개 장소 반려동물 데이터 계약이 없는 행 ${missingPetContract.length}건: ${missingPetContract.join(', ')}`);
  }

  const missingCopy = places.filter((place) => !place.short_description).map((place) => place.slug as string);
  if (missingCopy.length > 0) {
    warnings.push(`공개 장소 설명이 없는 행 ${missingCopy.length}건: ${missingCopy.join(', ')}`);
  }

  const httpImages = places.filter((place) => typeof place.hero_image_url === 'string' && /^http:\/\//i.test(place.hero_image_url as string));
  if (httpImages.length > 0) {
    warnings.push(`공개 이미지에 HTTP URL ${httpImages.length}건이 남아 있습니다. 웹 serving adapter가 HTTPS로 보정합니다.`);
  }
}

// 달빛수원은 야간 산책 큐레이션 서비스다. 수집이 관광 목적과 무관한 콘텐츠
// 타입을 끌어오면 검수함이 오염되고 실제 후보가 묻힌다. 예전에 쇼핑(38)
// 타입이 스타필드 입점 매장을 18건 끌어와 유네스코 세계유산 후보 한 건을
// 가렸다. 수집 설정을 좁혀도 재발을 자동으로 감지할 수 있게 검수함을 본다.
const CURATION_CONTENT_TYPES = new Set(['12', '14', '15', '28', '32', '39']);

async function checkReviewQueue(failures: string[], warnings: string[]) {
  const { data, error } = await serviceClient
    .schema('core')
    .from('place_sources')
    .select('place_id, kto_content_type_id, ingestion_status')
    .eq('ingestion_status', 'candidate');

  if (error) {
    warnings.push(`검수 대기 후보 조회 실패 (${error.message})`);
    return;
  }

  const rows = data ?? [];
  const offScope = rows.filter((row) => !CURATION_CONTENT_TYPES.has(String(row.kto_content_type_id)));
  console.log(`review queue: ${rows.length} candidates, ${offScope.length} off-scope content types`);

  if (offScope.length === 0) return;

  const types = [...new Set(offScope.map((row) => String(row.kto_content_type_id)))].sort();
  failures.push(
    `검수 대기에 큐레이션 범위를 벗어난 콘텐츠 타입 ${offScope.length}건이 있습니다(type=${types.join(', ')}). ` +
      '수집 설정을 확인하고 해당 후보를 제외 처리하세요.',
  );
}

function mapRun(row: RunRow): ApiRunHealth {
  return {
    status: row.status,
    itemsFetched: Number(row.items_fetched) || 0,
    itemsUpserted: Number(row.items_upserted) || 0,
    errorCount: Number(row.error_count) || 0,
    completedAt: row.completed_at ?? row.started_at,
    metadata: row.metadata ?? {},
  };
}

async function exactCount(schema: 'raw' | 'core', table: string): Promise<number> {
  const { count, error } = await serviceClient.schema(schema).from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${schema}.${table} 건수 조회 실패: ${error.message}`);
  return count ?? 0;
}

async function loadDatasetStats(definition: PublicApiDefinition): Promise<DatasetHealthStats> {
  if (definition.key === 'kto_korean') {
    const [rawCount, published] = await Promise.all([
      exactCount('raw', 'kto_kor_content'),
      publicClient.from('v_published_places').select('*', { count: 'exact', head: true }),
    ]);
    if (published.error) throw new Error(`국문 관광정보 공개 건수 조회 실패: ${published.error.message}`);
    return { rawCount, publicCount: published.count ?? 0 };
  }
  if (definition.key === 'kto_accessibility') {
    const [rawCount, publicCount] = await Promise.all([
      exactCount('raw', 'kto_with_tour'), exactCount('core', 'place_accessibility'),
    ]);
    return { rawCount, publicCount };
  }
  if (definition.key === 'kto_audio') {
    const [rawCount, publicCount] = await Promise.all([
      exactCount('raw', 'kto_audio_story'), exactCount('core', 'place_audio_stories'),
    ]);
    return { rawCount, publicCount };
  }
  if (definition.key === 'kto_pet') {
    const [rawCount, publicCount] = await Promise.all([
      exactCount('raw', 'kto_pet_tour'), exactCount('core', 'place_pet_policies'),
    ]);
    return { rawCount, publicCount };
  }
  if (definition.key === 'kto_crowd') {
    const [rawCount, publicCount, ...scopeResults] = await Promise.all([
      exactCount('raw', 'kto_crowd_forecast'),
      exactCount('core', 'place_crowd_forecasts'),
      ...['41111', '41113', '41115', '41117'].map((district) => serviceClient
        .schema('raw')
        .from('kto_crowd_forecast')
        .select('*', { count: 'exact', head: true })
        .eq('sigungu_code', district)),
    ]);
    const scopeCounts: Record<string, number> = {};
    for (const [index, result] of scopeResults.entries()) {
      if (result.error) throw new Error(`혼잡도 구별 조회 실패: ${result.error.message}`);
      scopeCounts[['41111', '41113', '41115', '41117'][index]] = result.count ?? 0;
    }
    return { rawCount, publicCount, scopeCounts };
  }

  const { data: rawRows, error: rawError } = await serviceClient
    .schema('raw')
    .from('public_api_items')
    .select('scope_key, review_status')
    .eq('api_key', definition.key);
  if (rawError) throw new Error(`${definition.key} 원본 조회 실패: ${rawError.message}`);
  const rawCount = rawRows?.length ?? 0;

  if (definition.key === 'kto_photo') {
    const { data, error } = await serviceClient.schema('core').from('place_photo_candidates').select('review_status, copyright_code, source_url');
    if (error) throw new Error(`관광사진 조회 실패: ${error.message}`);
    const approved = (data ?? []).filter((row) => row.review_status === 'approved');
    return {
      rawCount,
      publicCount: approved.length,
      missingProvenanceCount: approved.filter((row) => !row.copyright_code || !row.source_url).length,
    };
  }

  if (definition.key === 'kto_wellness') {
    const { data, error } = await serviceClient.schema('core').from('place_wellness').select('review_status');
    if (error) throw new Error(`웰니스 조회 실패: ${error.message}`);
    return { rawCount, publicCount: (data ?? []).filter((row) => row.review_status === 'approved').length };
  }

  if (definition.key === 'kto_local_hub') {
    const { data, error } = await serviceClient.schema('core').from('local_hub_candidates').select('district_code, review_status');
    if (error) throw new Error(`지역 중심 관광지 조회 실패: ${error.message}`);
    const scopeCounts: Record<string, number> = {};
    for (const row of data ?? []) scopeCounts[row.district_code] = (scopeCounts[row.district_code] ?? 0) + 1;
    return { rawCount, publicCount: (data ?? []).filter((row) => row.review_status === 'approved').length, scopeCounts };
  }

  if (definition.key === 'durunubi') {
    const { data, error } = await serviceClient.schema('core').from('durunubi_courses').select('review_status, intersects_suwon');
    if (error) throw new Error(`두루누비 조회 실패: ${error.message}`);
    return { rawCount, publicCount: (data ?? []).filter((row) => row.review_status === 'approved' && row.intersects_suwon).length };
  }

  if (definition.key === 'kto_related') {
    const { data, error } = await serviceClient.schema('core').from('place_relations').select('origin_place_id, related_place_id, review_status');
    if (error) throw new Error(`연관 관광지 조회 실패: ${error.message}`);
    const approved = (data ?? []).filter((row) => row.review_status === 'approved');
    return {
      rawCount,
      publicCount: approved.length,
      invalidRelationCount: approved.filter((row) => !row.origin_place_id || !row.related_place_id || row.origin_place_id === row.related_place_id).length,
    };
  }

  if (definition.key === 'kto_visitors') {
    const { data, error } = await serviceClient.schema('core').from('regional_visitor_stats').select('stat_date, district_code');
    if (error) throw new Error(`방문자 통계 조회 실패: ${error.message}`);
    const rows = data ?? [];
    const latestMonth = rows.map((row) => String(row.stat_date).slice(0, 7)).sort().at(-1);
    const districts = new Set(rows.filter((row) => String(row.stat_date).startsWith(latestMonth ?? '')).map((row) => row.district_code));
    const scopeCounts = Object.fromEntries([...districts].map((district) => [district, 1]));
    return { rawCount, publicCount: rows.length, scopeCounts, visitorMonthComplete: districts.size === 4 };
  }

  if (definition.key === 'kma_short' || definition.key === 'kma_mid') {
    const kind = definition.key === 'kma_short' ? 'short' : 'mid';
    const { data, error } = await serviceClient.schema('core').from('weather_forecasts').select('forecast_at').eq('forecast_kind', kind).order('forecast_at', { ascending: false }).limit(1);
    if (error) throw new Error(`${kind} 예보 조회 실패: ${error.message}`);
    const publicCount = await exactCount('core', 'weather_forecasts');
    return { rawCount, publicCount: Math.min(rawCount, publicCount), latestForecastAt: data?.[0]?.forecast_at ?? null };
  }

  if (definition.key === 'gg_bus_arrival') {
    const { data, error } = await serviceClient.schema('core').from('bus_arrival_snapshots').select('fetched_at').order('fetched_at', { ascending: false }).limit(1);
    if (error) throw new Error(`버스 캐시 조회 실패: ${error.message}`);
    const publicCount = await exactCount('core', 'bus_arrival_snapshots');
    return { rawCount, publicCount, latestBusFetchedAt: data?.[0]?.fetched_at ?? null };
  }

  return { rawCount, publicCount: (rawRows ?? []).filter((row) => row.review_status === 'approved').length };
}

async function checkApprovedApiCatalog(
  requestedJob: string,
  failures: string[],
  warnings: string[],
) {
  const definitions = requestedJob === 'all'
    ? PUBLIC_API_CATALOG
    : PUBLIC_API_CATALOG.filter((definition) => definition.syncJob === requestedJob);

  for (const definition of definitions) {
    const { data, error } = await serviceClient
      .schema('raw')
      .from('sync_runs')
      .select('source, status, items_fetched, items_upserted, error_count, started_at, completed_at, metadata')
      .eq('source', `GitHubActions:${definition.syncJob}`)
      .order('started_at', { ascending: false })
      .limit(2);
    if (error) {
      failures.push(`${definition.key}: 실행 이력 조회 실패 (${error.message})`);
      continue;
    }

    try {
      const rows = (data ?? []) as RunRow[];
      const latest = rows[0] ? mapRun(rows[0]) : null;
      const previous = rows[1] ? mapRun(rows[1]) : null;
      if (!latest) {
        const health = evaluateApiHealth(definition, null, previous, { rawCount: 0, publicCount: 0 });
        console.log(`api ${definition.key}: ${health.status} | never run`);
        for (const finding of health.findings) {
          failures.push(`${definition.key}/${finding.code}: ${finding.message}`);
        }
        continue;
      }
      const dataset = await loadDatasetStats(definition);
      if (latest?.metadata.scope_counts && typeof latest.metadata.scope_counts === 'object' && !dataset.scopeCounts) {
        dataset.scopeCounts = latest.metadata.scope_counts as Record<string, number>;
      }
      const health = evaluateApiHealth(definition, latest, previous, dataset);
      console.log(`api ${definition.key}: ${health.status} | raw=${dataset.rawCount} public=${dataset.publicCount}`);
      for (const finding of health.findings) {
        const message = `${definition.key}/${finding.code}: ${finding.message}`;
        if (finding.severity === 'failed') failures.push(message);
        else warnings.push(message);
      }
    } catch (error: unknown) {
      failures.push(`${definition.key}: 데이터셋 검증 실패 (${error instanceof Error ? error.message : String(error)})`);
    }
  }
}

async function main() {
  const requestedJob = parseJob();
  const jobs = requestedJob === 'all' ? JOBS : JOBS.includes(requestedJob as SyncJob) ? [requestedJob as SyncJob] : [];
  const failures: string[] = [];
  const warnings: string[] = [];

  for (const job of jobs) {
    await checkLatestRun(job, failures, warnings);
  }
  await checkApprovedApiCatalog(requestedJob, failures, warnings);
  if (requestedJob === 'all' || JOBS.includes(requestedJob as SyncJob)) {
    await checkPublicServing(failures, warnings);
    await checkReviewQueue(failures, warnings);
  }

  for (const warning of warnings) console.warn(`WARN ${warning}`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('Data health verification passed.');
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
