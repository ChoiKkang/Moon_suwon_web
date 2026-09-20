import 'server-only';

import { getAdminClient, requireAdmin, asNumber, asRecord } from './server';
import type {
  AdminAuditEvent,
  AdminApiLedgerItem,
  AdminCandidate,
  AdminCandidateDetail,
  AdminCourse,
  AdminCoursePlace,
  AdminCrowdSummary,
  AdminDashboardData,
  AdminEnrichmentCoverage,
  AdminEvent,
  AdminPlace,
  AdminPlaceCopy,
  AdminQueryResult,
  AdminSourceHealth,
  AdminSyncError,
  AdminSyncRun,
  CandidateFilter,
  CandidateIngestionStatus,
} from './types';
import { buildAdminApiLedger, mergeBusStopReviewRows, type ApiRegistryRow, type ApiReviewRow, type BusStopReviewRow } from './api-ledger';
import { candidateMatchesFilter, normalizeCandidateFilter } from './review';
import type { DataFreshness, PetPolicy } from '@/lib/pet/policy';

type PlaceRow = {
  id: string;
  slug: string;
  official_name: string;
  address_full: string | null;
  lat: number | string | null;
  lng: number | string | null;
  contact_phone: string | null;
  source_overview_raw: string | null;
  category: string | null;
  is_active: boolean | null;
  source_modified_at: string | null;
  updated_at: string | null;
};

type PlaceSourceRow = {
  place_id: string;
  kto_content_id: string | null;
  kto_content_type_id: string | null;
  ingestion_status: CandidateIngestionStatus | null;
  first_seen_at: string | null;
  last_seen_at: string | null;
};
type PlaceImageRow = { place_id: string; image_url: string; is_hero: boolean | null };
type PlacePetPolicyRow = {
  place_id: string;
  pet_policy: string | null;
  pet_note_short: string | null;
  data_status: string | null;
  source_updated_at: string | null;
  is_manual_override: boolean | null;
};
type PlaceStateRow = {
  place_id: string;
  is_published: boolean | null;
  display_priority: number | null;
  is_now_good_enabled: boolean;
  night_suitability_score: number | string;
  recommended_from: string | null;
  recommended_until: string | null;
  recommendation_boost: number | string;
  ops_memo: string | null;
};
type PlaceCopyRow = {
  place_id: string;
  id: string;
  display_name: string | null;
  short_description: string | null;
  night_highlight: string | null;
  photo_tip: string | null;
  mission_title: string | null;
  mission_body: string | null;
  mission_prompt: string | null;
  couple_question: string | null;
  short_story: string | null;
};

type CourseRow = {
  id: string;
  slug: string;
  theme_tags: string[] | null;
  estimated_duration_min: number;
  walking_distance_km: number | string | null;
  recommended_start_time: string | null;
  pet_ready_flag: boolean | null;
  automation_source: string | null;
  automation_key: string | null;
  automation_metadata: unknown;
  last_automated_at: string | null;
  updated_at: string | null;
};
type CourseStateRow = {
  course_id: string;
  is_published: boolean | null;
  display_priority: number | null;
  ops_memo: string | null;
};
type CourseCopyRow = {
  course_id: string;
  hero_title: string;
  subtitle: string | null;
  route_summary: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
};
type CoursePlaceRow = { course_id: string; place_id: string; order_index: number };

type EventRow = {
  id: string;
  event_content_id: string;
  event_name: string;
  start_date: string;
  end_date: string;
  venue_address: string | null;
  lat: number | string | null;
  lng: number | string | null;
  hero_image_url: string | null;
  contact_phone: string | null;
  event_place: string | null;
  play_time: string | null;
  usage_fee: string | null;
  program_raw: string | null;
  source_modified_at: string | null;
  created_at: string;
  updated_at: string;
};

type CrowdRow = {
  place_id: string;
  forecast_date: string;
  forecast_score: number | string;
  crowd_level: string;
  source_updated_at: string;
};
type SyncRunRow = {
  id: string;
  source: string;
  status: string;
  items_fetched: number;
  items_upserted: number;
  error_count: number;
  metadata: unknown;
  started_at: string;
  completed_at: string | null;
};
type SyncErrorRow = {
  id: string;
  sync_run_id: string;
  endpoint: string;
  content_id: string | null;
  error_code: string | null;
  message: string;
  created_at: string;
};

function firstError(...errors: Array<{ message?: string } | null | undefined>): string | null {
  return errors.find((error) => error?.message)?.message ?? null;
}

function asPetPolicy(value: string | null | undefined): PetPolicy {
  return value === 'allowed' || value === 'partial' || value === 'not_allowed' || value === 'unknown' ? value : 'unknown';
}

function asFreshness(value: string | null | undefined): DataFreshness {
  return value === 'fresh' || value === 'stale' || value === 'unavailable' || value === 'unknown' ? value : 'unknown';
}

function asIngestionStatus(value: string | null | undefined): CandidateIngestionStatus {
  return value === 'candidate' || value === 'approved' || value === 'rejected' || value === 'stale' ? value : 'candidate';
}

function mapAudit(row: {
  id: string;
  actor_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: unknown;
  created_at: string;
}): AdminAuditEvent {
  return {
    id: row.id,
    actorId: row.actor_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    action: row.action,
    metadata: asRecord(row.metadata),
    createdAt: row.created_at,
  };
}

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

type AuditRow = {
  id: string;
  actor_id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  metadata: unknown;
  created_at: string;
};

/**
 * audit.admin_events is deliberately kept out of the PostgREST schema list, so
 * reading it with schema('audit') fails with "Invalid schema: audit".
 *
 * Prefer public.admin_list_audit_events (service-role security definer), then
 * fall back to a direct schema read for environments where that schema is
 * reachable. When neither path works the reader reports unavailable so the
 * console can say the reader is not deployed instead of implying there was no
 * activity. Writes are unaffected; they go through public.admin_record_audit.
 */
async function readAuditEvents(
  adminClient: ReturnType<typeof getAdminClient>,
  entityId: string | null,
  limit: number,
): Promise<{ events: AdminAuditEvent[]; available: boolean }> {
  const viaRpc = await adminClient.rpc('admin_list_audit_events', {
    p_entity_id: entityId,
    p_limit: limit,
  });
  if (!viaRpc.error && Array.isArray(viaRpc.data)) {
    return { events: (viaRpc.data as AuditRow[]).map(mapAudit), available: true };
  }

  let query = adminClient
    .schema('audit')
    .from('admin_events')
    .select('id, actor_id, entity_type, entity_id, action, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (entityId) query = query.eq('entity_id', entityId);

  const viaSchema = await query;
  if (!viaSchema.error && Array.isArray(viaSchema.data)) {
    return { events: (viaSchema.data as AuditRow[]).map(mapAudit), available: true };
  }

  return { events: [], available: false };
}

function mapCopy(row: PlaceCopyRow | undefined): AdminPlaceCopy {
  return {
    id: row?.id ?? null,
    displayName: row?.display_name ?? null,
    shortDescription: row?.short_description ?? null,
    nightHighlight: row?.night_highlight ?? null,
    photoTip: row?.photo_tip ?? null,
    missionTitle: row?.mission_title ?? null,
    missionBody: row?.mission_body ?? null,
    missionPrompt: row?.mission_prompt ?? null,
    coupleQuestion: row?.couple_question ?? null,
    shortStory: row?.short_story ?? null,
  };
}

async function getAdminPlacesForClient(adminClient: ReturnType<typeof getAdminClient>): Promise<AdminQueryResult<AdminPlace[]>> {
  const [placesResult, sourceResult, imageResult, stateResult, copyResult, petResult] = await Promise.all([
    adminClient.schema('core').from('places').select('id, slug, official_name, address_full, lat, lng, contact_phone, source_overview_raw, category, is_active, source_modified_at, updated_at').order('official_name', { ascending: true }),
    adminClient.schema('core').from('place_sources').select('place_id, kto_content_id, kto_content_type_id, ingestion_status, first_seen_at, last_seen_at'),
    adminClient.schema('core').from('place_images').select('place_id, image_url, is_hero').eq('is_hero', true),
    adminClient.schema('editorial').from('place_publish_state').select('place_id, is_published, display_priority, is_now_good_enabled, night_suitability_score, recommended_from, recommended_until, recommendation_boost, ops_memo'),
    adminClient.schema('editorial').from('place_copy').select('id, place_id, display_name, short_description, night_highlight, photo_tip, mission_title, mission_body, mission_prompt, couple_question, short_story'),
    adminClient.schema('core').from('place_pet_policies').select('place_id, pet_policy, pet_note_short, data_status, source_updated_at, is_manual_override'),
  ]);
  const error = firstError(placesResult.error, sourceResult.error, imageResult.error, stateResult.error, copyResult.error, petResult.error);

  if (error) {
    return { data: [], error };
  }

  const sources = new Map((sourceResult.data as PlaceSourceRow[] | null ?? []).map((row) => [row.place_id, row]));
  const heroImages = new Map((imageResult.data as PlaceImageRow[] | null ?? []).map((row) => [row.place_id, row.image_url]));
  const states = new Map((stateResult.data as PlaceStateRow[] | null ?? []).map((row) => [row.place_id, row]));
  const copies = new Map((copyResult.data as PlaceCopyRow[] | null ?? []).map((row) => [row.place_id, row]));
  const pets = new Map((petResult.data as PlacePetPolicyRow[] | null ?? []).map((row) => [row.place_id, row]));

  const places = ((placesResult.data ?? []) as PlaceRow[])
    .filter((place) => place.is_active !== false)
    .map((place): AdminPlace => {
      const state = states.get(place.id);
      const copy = copies.get(place.id);
      const source = sources.get(place.id);
      const pet = pets.get(place.id);
      return {
        id: place.id,
        slug: place.slug,
        officialName: place.official_name,
        displayName: copy?.display_name || place.official_name,
        addressFull: place.address_full,
        lat: asNumber(place.lat),
        lng: asNumber(place.lng),
        contactPhone: place.contact_phone,
        sourceOverviewRaw: place.source_overview_raw,
        category: place.category,
        ktoContentId: source?.kto_content_id ?? null,
        ktoContentTypeId: source?.kto_content_type_id ?? null,
        ingestionStatus: asIngestionStatus(source?.ingestion_status),
        firstSeenAt: source?.first_seen_at ?? null,
        lastSeenAt: source?.last_seen_at ?? null,
        petPolicy: asPetPolicy(pet?.pet_policy),
        petDataStatus: asFreshness(pet?.data_status),
        petNote: pet?.pet_note_short ?? null,
        petSourceUpdatedAt: pet?.source_updated_at ?? null,
        petManualOverride: pet?.is_manual_override === true,
        heroImageUrl: heroImages.get(place.id) ?? null,
        sourceModifiedAt: place.source_modified_at,
        isActive: place.is_active !== false,
        isPublished: state?.is_published === true,
        displayPriority: state?.display_priority ?? 0,
        isNowGoodEnabled: state?.is_now_good_enabled === true,
        nightSuitabilityScore: asNumber(state?.night_suitability_score) ?? 0,
        recommendedFrom: state?.recommended_from ?? null,
        recommendedUntil: state?.recommended_until ?? null,
        recommendationBoost: asNumber(state?.recommendation_boost) ?? 0,
        opsMemo: state?.ops_memo ?? null,
        updatedAt: place.updated_at,
        copy: mapCopy(copy),
      };
    })
    .sort((a, b) => a.displayPriority - b.displayPriority || a.displayName.localeCompare(b.displayName, 'ko'));

  return { data: places, error: null };
}

function mapCandidate(place: AdminPlace): AdminCandidate {
  return {
    placeId: place.id,
    slug: place.slug,
    displayName: place.displayName,
    officialName: place.officialName,
    ktoContentId: place.ktoContentId,
    ktoContentTypeId: place.ktoContentTypeId,
    ingestionStatus: place.ingestionStatus,
    firstSeenAt: place.firstSeenAt,
    lastSeenAt: place.lastSeenAt,
    petPolicy: place.petPolicy,
    petDataStatus: place.petDataStatus,
    petNote: place.petNote,
    petSourceUpdatedAt: place.petSourceUpdatedAt,
    sourceModifiedAt: place.sourceModifiedAt,
    hasCoordinates: place.lat !== null && place.lng !== null,
    hasHeroImage: Boolean(place.heroImageUrl),
    isPublished: place.isPublished,
    isActive: place.isActive,
    addressFull: place.addressFull,
    category: place.category,
  };
}

async function getAdminCandidatesForClient(
  adminClient: ReturnType<typeof getAdminClient>,
  filter?: CandidateFilter,
): Promise<AdminQueryResult<AdminCandidate[]>> {
  const placesResult = await getAdminPlacesForClient(adminClient);
  if (placesResult.error) return { data: [], error: placesResult.error };

  const normalizedFilter = normalizeCandidateFilter(filter);
  return {
    data: placesResult.data
      .map(mapCandidate)
      .filter((candidate) => candidateMatchesFilter(candidate, normalizedFilter))
      .sort((a, b) => {
        const statusOrder = { candidate: 0, stale: 1, approved: 2, rejected: 3 } as const;
        return statusOrder[a.ingestionStatus] - statusOrder[b.ingestionStatus]
          || (a.lastSeenAt ?? '').localeCompare(b.lastSeenAt ?? '')
          || a.displayName.localeCompare(b.displayName, 'ko');
      }),
    error: null,
  };
}

async function getAdminCandidateDetailForClient(
  adminClient: ReturnType<typeof getAdminClient>,
  placeId: string,
): Promise<AdminQueryResult<AdminCandidateDetail | null>> {
  const placesResult = await getAdminPlacesForClient(adminClient);
  if (placesResult.error) return { data: null, error: placesResult.error };
  const place = placesResult.data.find((item) => item.id === placeId);
  if (!place) return { data: null, error: null };

  const { events: auditEvents } = await readAuditEvents(adminClient, placeId, 1);
  const latestAuditRow = auditEvents[0] ?? null;

  return {
    data: {
      ...mapCandidate(place),
      lat: place.lat,
      lng: place.lng,
      contactPhone: place.contactPhone,
      sourceOverview: place.sourceOverviewRaw,
      latestAudit: latestAuditRow,
    },
    error: null,
  };
}

async function getAdminCoursesForClient(
  adminClient: ReturnType<typeof getAdminClient>,
  places: AdminPlace[],
): Promise<AdminQueryResult<AdminCourse[]>> {
  const [coursesResult, stateResult, copyResult, linksResult] = await Promise.all([
    adminClient.schema('core').from('courses').select('id, slug, theme_tags, estimated_duration_min, walking_distance_km, recommended_start_time, pet_ready_flag, automation_source, automation_key, automation_metadata, last_automated_at, updated_at').order('updated_at', { ascending: false }),
    adminClient.schema('editorial').from('course_publish_state').select('course_id, is_published, display_priority, ops_memo'),
    adminClient.schema('editorial').from('course_copy').select('course_id, hero_title, subtitle, route_summary, og_title, og_description, og_image_url'),
    adminClient.schema('core').from('course_places').select('course_id, place_id, order_index').order('order_index', { ascending: true }),
  ]);
  const error = firstError(coursesResult.error, stateResult.error, copyResult.error, linksResult.error);

  if (error) {
    return { data: [], error };
  }

  const stateByCourse = new Map((stateResult.data as CourseStateRow[] | null ?? []).map((row) => [row.course_id, row]));
  const copyByCourse = new Map((copyResult.data as CourseCopyRow[] | null ?? []).map((row) => [row.course_id, row]));
  const placesById = new Map(places.map((place) => [place.id, place]));
  const linksByCourse = new Map<string, AdminCoursePlace[]>();

  for (const link of (linksResult.data as CoursePlaceRow[] | null ?? [])) {
    const place = placesById.get(link.place_id);
    if (!place) continue;
    const links = linksByCourse.get(link.course_id) ?? [];
    links.push({ placeId: link.place_id, slug: place.slug, displayName: place.displayName, orderIndex: link.order_index });
    linksByCourse.set(link.course_id, links);
  }

  return {
    data: ((coursesResult.data ?? []) as CourseRow[]).map((course): AdminCourse => {
      const state = stateByCourse.get(course.id);
      const copy = copyByCourse.get(course.id);
      return {
        id: course.id,
        slug: course.slug,
        themeTags: course.theme_tags ?? [],
        estimatedDurationMin: course.estimated_duration_min,
        walkingDistanceKm: asNumber(course.walking_distance_km),
        recommendedStartTime: course.recommended_start_time,
        petReadyFlag: course.pet_ready_flag === true,
        isPublished: state?.is_published === true,
        displayPriority: state?.display_priority ?? 0,
        opsMemo: state?.ops_memo ?? null,
        updatedAt: course.updated_at,
        automationSource: course.automation_source ?? null,
        automationKey: course.automation_key ?? null,
        automationMetadata: asRecord(course.automation_metadata),
        lastAutomatedAt: course.last_automated_at ?? null,
        copy: {
          heroTitle: copy?.hero_title ?? '',
          subtitle: copy?.subtitle ?? null,
          routeSummary: copy?.route_summary ?? null,
          ogTitle: copy?.og_title ?? null,
          ogDescription: copy?.og_description ?? null,
          ogImageUrl: copy?.og_image_url ?? null,
        },
        places: (linksByCourse.get(course.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
      };
    }),
    error: null,
  };
}

function mapEvent(row: EventRow): AdminEvent {
  return {
    id: row.id,
    eventContentId: row.event_content_id,
    eventName: row.event_name,
    startDate: row.start_date,
    endDate: row.end_date,
    venueAddress: row.venue_address,
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
    heroImageUrl: row.hero_image_url,
    contactPhone: row.contact_phone,
    eventPlace: row.event_place,
    playTime: row.play_time,
    usageFee: row.usage_fee,
    programRaw: row.program_raw,
    sourceModifiedAt: row.source_modified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getAdminEventsForClient(adminClient: ReturnType<typeof getAdminClient>): Promise<AdminQueryResult<AdminEvent[]>> {
  const result = await adminClient.schema('core').from('events').select('id, event_content_id, event_name, start_date, end_date, venue_address, lat, lng, hero_image_url, contact_phone, event_place, play_time, usage_fee, program_raw, source_modified_at, created_at, updated_at').order('start_date', { ascending: true });
  if (result.error) return { data: [], error: result.error.message };
  return { data: ((result.data ?? []) as EventRow[]).map(mapEvent), error: null };
}

function buildSourceHealth(runs: AdminSyncRun[]): AdminSourceHealth[] {
  const bySource = new Map<string, AdminSyncRun>();
  for (const run of runs) {
    if (!bySource.has(run.source)) bySource.set(run.source, run);
  }

  return [...bySource.entries()].map(([source, run]) => {
    const completedAt = run.completedAt ?? null;
    const age = completedAt ? Date.now() - Date.parse(completedAt) : Number.POSITIVE_INFINITY;
    const freshness: AdminSourceHealth['freshness'] = run.status === 'completed' && Number.isFinite(age) && age <= 48 * 60 * 60 * 1000
      ? 'fresh'
      : completedAt
        ? 'stale'
        : 'unknown';
    return {
      source,
      lastStatus: run.status,
      lastCompletedAt: completedAt,
      freshness,
      fetched: run.itemsFetched,
      upserted: run.itemsUpserted,
      errors: run.errorCount,
      metadata: run.metadata,
    };
  }).sort((a, b) => a.source.localeCompare(b.source));
}

type AdminOperationsData = Pick<AdminDashboardData, 'crowd' | 'syncRuns' | 'syncErrors' | 'candidates' | 'sourceHealth'> & {
  auditEvents: AdminAuditEvent[];
  auditAvailable: boolean;
  enrichmentCoverage: AdminEnrichmentCoverage[];
  apiLedger: AdminApiLedgerItem[];
};

function emptyOperations(): AdminOperationsData {
  return { crowd: emptyCrowd(), syncRuns: [], syncErrors: [], candidates: [], sourceHealth: [], auditEvents: [], auditAvailable: false, enrichmentCoverage: [], apiLedger: [] };
}

/**
 * 부가 정보가 공개 장소에 얼마나 붙었는지 센다.
 *
 * 조회가 실패해도 운영 화면 전체를 막지 않는다. 커버리지는 보조 지표라서
 * 빈 값으로 두고 나머지 패널을 계속 보여주는 편이 낫다.
 */
async function buildEnrichmentCoverage(
  adminClient: ReturnType<typeof getAdminClient>,
  places: AdminPlace[],
): Promise<AdminEnrichmentCoverage[]> {
  const publishedIds = new Set(places.filter((place) => place.isPublished).map((place) => place.id));
  const publishedPlaces = publishedIds.size;

  const [audioResult, accessResult] = await Promise.all([
    adminClient.schema('core').from('place_audio_stories').select('place_id, audio_url'),
    adminClient.schema('core').from('place_accessibility').select('place_id'),
  ]);

  const audioRows = (audioResult.data ?? []).filter((row) => publishedIds.has(String(row.place_id)));
  const audioPlaces = new Set(audioRows.map((row) => String(row.place_id))).size;
  const playableCount = audioRows.filter((row) => Boolean(row.audio_url)).length;
  const accessPlaces = new Set(
    (accessResult.data ?? []).map((row) => String(row.place_id)).filter((id) => publishedIds.has(id)),
  ).size;
  const petPlaces = places.filter((place) => place.isPublished && place.petPolicy !== 'unknown').length;

  return [
    {
      key: 'audio',
      label: '오디오 해설',
      places: audioPlaces,
      publishedPlaces,
      items: audioRows.length,
      note: playableCount > 0
        ? `음원 재생 ${playableCount}건, 본문만 ${audioRows.length - playableCount}건`
        : '본문 해설만 수집되었습니다.',
    },
    {
      key: 'accessibility',
      label: '무장애 정보',
      places: accessPlaces,
      publishedPlaces,
      items: null,
      note: '경사로·화장실·주차 등 확인된 항목만 표시됩니다.',
    },
    {
      key: 'pet',
      label: '반려동물 정보',
      places: petPlaces,
      publishedPlaces,
      items: null,
      note: '동반 가능 여부가 확인된 장소만 셉니다.',
    },
  ];
}

async function getAdminOperationsForClient(adminClient: ReturnType<typeof getAdminClient>, places: AdminPlace[]): Promise<AdminQueryResult<AdminOperationsData>> {
  const today = todayInSeoul();
  const [crowdResult, runsResult, errorsResult, auditResult, registryResult, reviewsResult, busStopsResult] = await Promise.all([
    adminClient.schema('core').from('place_crowd_forecasts').select('place_id, forecast_date, forecast_score, crowd_level, source_updated_at').order('forecast_date', { ascending: false }).limit(500),
    adminClient.schema('raw').from('sync_runs').select('id, source, status, items_fetched, items_upserted, error_count, metadata, started_at, completed_at').order('started_at', { ascending: false }).limit(100),
    adminClient.schema('raw').from('sync_errors').select('id, sync_run_id, endpoint, content_id, error_code, message, created_at').order('created_at', { ascending: false }).limit(50),
    readAuditEvents(adminClient, null, 20),
    adminClient.rpc('sync_list_api_registry'),
    adminClient.schema('raw').from('public_api_items').select('api_key, review_status'),
    adminClient.schema('core').from('place_bus_stops').select('review_status'),
  ]);
  const error = firstError(crowdResult.error, runsResult.error, errorsResult.error, registryResult.error, reviewsResult.error, busStopsResult.error);
  if (error) return { data: emptyOperations(), error };

  const crowdRows = (crowdResult.data ?? []) as CrowdRow[];
  const latestSource = crowdRows.map((row) => row.source_updated_at).sort().at(-1) ?? null;
  const latestForecastDate = crowdRows.map((row) => row.forecast_date).sort().at(-1) ?? null;
  const byLevel: Record<string, number> = {};
  for (const row of crowdRows) byLevel[row.crowd_level] = (byLevel[row.crowd_level] ?? 0) + 1;
  const todayPlaceIds = new Set(crowdRows.filter((row) => row.forecast_date === today).map((row) => row.place_id));
  const latestSourceMs = latestSource ? Date.parse(latestSource) : 0;
  const stale = !latestSource || Number.isNaN(latestSourceMs) || Date.now() - latestSourceMs > 36 * 60 * 60 * 1000 || (latestForecastDate !== null && latestForecastDate < today);

  const syncRuns = ((runsResult.data ?? []) as SyncRunRow[]).map((row): AdminSyncRun => ({
    id: row.id,
    source: row.source,
    status: row.status,
    itemsFetched: row.items_fetched,
    itemsUpserted: row.items_upserted,
    errorCount: row.error_count,
    metadata: asRecord(row.metadata),
    startedAt: row.started_at,
    completedAt: row.completed_at,
    isStale: row.status === 'running' && Number.isFinite(Date.parse(row.started_at)) && Date.now() - Date.parse(row.started_at) > 90 * 60 * 1000,
  }));
  const syncErrors = ((errorsResult.data ?? []) as SyncErrorRow[]).map((row): AdminSyncError => ({
    id: row.id,
    syncRunId: row.sync_run_id,
    endpoint: row.endpoint,
    contentId: row.content_id,
    errorCode: row.error_code,
    message: row.message,
    createdAt: row.created_at,
  }));
  const candidates = places.map(mapCandidate);
  const enrichmentCoverage = await buildEnrichmentCoverage(adminClient, places);
  const apiLedger = buildAdminApiLedger(
    (registryResult.data ?? []) as ApiRegistryRow[],
    (runsResult.data ?? []) as SyncRunRow[],
    mergeBusStopReviewRows(
      (reviewsResult.data ?? []) as ApiReviewRow[],
      (busStopsResult.data ?? []) as BusStopReviewRow[],
    ),
  );

  return {
    data: {
      crowd: {
        latestForecastDate,
        latestSourceUpdatedAt: latestSource,
        totalRows: crowdRows.length,
        todayRows: crowdRows.filter((row) => row.forecast_date === today).length,
        stale,
        byLevel,
        missingTodayPlaceNames: places.filter((place) => place.isPublished && !todayPlaceIds.has(place.id)).map((place) => place.displayName),
      },
      syncRuns,
      syncErrors,
      candidates,
      sourceHealth: buildSourceHealth(syncRuns),
      auditEvents: auditResult.events,
      auditAvailable: auditResult.available,
      enrichmentCoverage,
      apiLedger,
    },
    error: null,
  };
}

function emptyCrowd(): AdminCrowdSummary {
  return {
    latestForecastDate: null,
    latestSourceUpdatedAt: null,
    totalRows: 0,
    todayRows: 0,
    stale: true,
    byLevel: {},
    missingTodayPlaceNames: [],
  };
}

export async function getAdminPlaces(): Promise<AdminQueryResult<AdminPlace[]>> {
  try {
    const { adminClient } = await requireAdmin();
    return getAdminPlacesForClient(adminClient);
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다.' };
  }
}

export async function getAdminCandidates(filter?: CandidateFilter): Promise<AdminQueryResult<AdminCandidate[]>> {
  try {
    const { adminClient } = await requireAdmin();
    return getAdminCandidatesForClient(adminClient, filter);
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : '검수 후보를 불러오지 못했습니다.' };
  }
}

export async function getAdminCandidateDetail(placeId: string): Promise<AdminQueryResult<AdminCandidateDetail | null>> {
  try {
    const { adminClient } = await requireAdmin();
    return getAdminCandidateDetailForClient(adminClient, placeId);
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : '검수 후보 상세를 불러오지 못했습니다.' };
  }
}

export async function getAdminCourses(): Promise<AdminQueryResult<{ courses: AdminCourse[]; places: AdminPlace[] }>> {
  try {
    const { adminClient } = await requireAdmin();
    const placesResult = await getAdminPlacesForClient(adminClient);
    if (placesResult.error) return { data: { courses: [], places: [] }, error: placesResult.error };
    const coursesResult = await getAdminCoursesForClient(adminClient, placesResult.data);
    return { data: { courses: coursesResult.data, places: placesResult.data }, error: coursesResult.error };
  } catch (error) {
    return { data: { courses: [], places: [] }, error: error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다.' };
  }
}

export async function getAdminEvents(): Promise<AdminQueryResult<AdminEvent[]>> {
  try {
    const { adminClient } = await requireAdmin();
    return getAdminEventsForClient(adminClient);
  } catch (error) {
    return { data: [], error: error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다.' };
  }
}

export async function getAdminOperations(): Promise<AdminQueryResult<AdminOperationsData>> {
  try {
    const { adminClient } = await requireAdmin();
    const placesResult = await getAdminPlacesForClient(adminClient);
    if (placesResult.error) return { data: emptyOperations(), error: placesResult.error };
    return getAdminOperationsForClient(adminClient, placesResult.data);
  } catch (error) {
    return { data: emptyOperations(), error: error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다.' };
  }
}

export async function getAdminDashboardData(): Promise<AdminQueryResult<AdminDashboardData>> {
  try {
    const { adminClient } = await requireAdmin();
    const placesResult = await getAdminPlacesForClient(adminClient);
    if (placesResult.error) {
      return { data: { places: [], courses: [], events: [], crowd: emptyCrowd(), syncRuns: [], syncErrors: [], candidates: [], sourceHealth: [] }, error: placesResult.error };
    }
    const [coursesResult, eventsResult, operationsResult] = await Promise.all([
      getAdminCoursesForClient(adminClient, placesResult.data),
      getAdminEventsForClient(adminClient),
      getAdminOperationsForClient(adminClient, placesResult.data),
    ]);
    return {
      data: {
        places: placesResult.data,
        courses: coursesResult.data,
        events: eventsResult.data,
        crowd: operationsResult.data.crowd,
        syncRuns: operationsResult.data.syncRuns,
        syncErrors: operationsResult.data.syncErrors,
        candidates: operationsResult.data.candidates,
        sourceHealth: operationsResult.data.sourceHealth,
      },
      error: coursesResult.error ?? eventsResult.error ?? operationsResult.error,
    };
  } catch (error) {
    return { data: { places: [], courses: [], events: [], crowd: emptyCrowd(), syncRuns: [], syncErrors: [], candidates: [], sourceHealth: [] }, error: error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다.' };
  }
}
