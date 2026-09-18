import 'server-only';

import { getAdminClient, requireAdmin, asNumber, asRecord } from './server';
import type {
  AdminCourse,
  AdminCoursePlace,
  AdminCrowdSummary,
  AdminDashboardData,
  AdminEvent,
  AdminPlace,
  AdminPlaceCopy,
  AdminQueryResult,
  AdminSyncError,
  AdminSyncRun,
} from './types';

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

type PlaceSourceRow = { place_id: string; kto_content_id: string | null };
type PlaceImageRow = { place_id: string; image_url: string; is_hero: boolean | null };
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

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
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
  const [placesResult, sourceResult, imageResult, stateResult, copyResult] = await Promise.all([
    adminClient.schema('core').from('places').select('id, slug, official_name, address_full, lat, lng, contact_phone, source_overview_raw, category, is_active, source_modified_at, updated_at').order('official_name', { ascending: true }),
    adminClient.schema('core').from('place_sources').select('place_id, kto_content_id'),
    adminClient.schema('core').from('place_images').select('place_id, image_url, is_hero').eq('is_hero', true),
    adminClient.schema('editorial').from('place_publish_state').select('place_id, is_published, display_priority, is_now_good_enabled, night_suitability_score, recommended_from, recommended_until, recommendation_boost, ops_memo'),
    adminClient.schema('editorial').from('place_copy').select('id, place_id, display_name, short_description, night_highlight, photo_tip, mission_title, mission_body, mission_prompt, couple_question, short_story'),
  ]);
  const error = firstError(placesResult.error, sourceResult.error, imageResult.error, stateResult.error, copyResult.error);

  if (error) {
    return { data: [], error };
  }

  const sources = new Map((sourceResult.data as PlaceSourceRow[] | null ?? []).map((row) => [row.place_id, row]));
  const heroImages = new Map((imageResult.data as PlaceImageRow[] | null ?? []).map((row) => [row.place_id, row.image_url]));
  const states = new Map((stateResult.data as PlaceStateRow[] | null ?? []).map((row) => [row.place_id, row]));
  const copies = new Map((copyResult.data as PlaceCopyRow[] | null ?? []).map((row) => [row.place_id, row]));

  const places = ((placesResult.data ?? []) as PlaceRow[])
    .filter((place) => place.is_active !== false)
    .map((place): AdminPlace => {
      const state = states.get(place.id);
      const copy = copies.get(place.id);
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
        ktoContentId: sources.get(place.id)?.kto_content_id ?? null,
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

async function getAdminCoursesForClient(
  adminClient: ReturnType<typeof getAdminClient>,
  places: AdminPlace[],
): Promise<AdminQueryResult<AdminCourse[]>> {
  const [coursesResult, stateResult, copyResult, linksResult] = await Promise.all([
    adminClient.schema('core').from('courses').select('id, slug, theme_tags, estimated_duration_min, walking_distance_km, recommended_start_time, pet_ready_flag, automation_source, automation_key, last_automated_at, updated_at').order('updated_at', { ascending: false }),
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

async function getAdminOperationsForClient(adminClient: ReturnType<typeof getAdminClient>, places: AdminPlace[]): Promise<AdminQueryResult<Pick<AdminDashboardData, 'crowd' | 'syncRuns' | 'syncErrors'>>> {
  const today = todayInSeoul();
  const [crowdResult, runsResult, errorsResult] = await Promise.all([
    adminClient.schema('core').from('place_crowd_forecasts').select('place_id, forecast_date, forecast_score, crowd_level, source_updated_at').order('forecast_date', { ascending: false }).limit(500),
    adminClient.schema('raw').from('sync_runs').select('id, source, status, items_fetched, items_upserted, error_count, metadata, started_at, completed_at').order('started_at', { ascending: false }).limit(30),
    adminClient.schema('raw').from('sync_errors').select('id, sync_run_id, endpoint, content_id, error_code, message, created_at').order('created_at', { ascending: false }).limit(50),
  ]);
  const error = firstError(crowdResult.error, runsResult.error, errorsResult.error);
  if (error) return { data: { crowd: emptyCrowd(), syncRuns: [], syncErrors: [] }, error };

  const crowdRows = (crowdResult.data ?? []) as CrowdRow[];
  const latestSource = crowdRows.map((row) => row.source_updated_at).sort().at(-1) ?? null;
  const latestForecastDate = crowdRows.map((row) => row.forecast_date).sort().at(-1) ?? null;
  const byLevel: Record<string, number> = {};
  for (const row of crowdRows) byLevel[row.crowd_level] = (byLevel[row.crowd_level] ?? 0) + 1;
  const todayPlaceIds = new Set(crowdRows.filter((row) => row.forecast_date === today).map((row) => row.place_id));
  const latestSourceMs = latestSource ? Date.parse(latestSource) : 0;
  const stale = !latestSource || Number.isNaN(latestSourceMs) || Date.now() - latestSourceMs > 36 * 60 * 60 * 1000 || (latestForecastDate !== null && latestForecastDate < today);

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
      syncRuns: ((runsResult.data ?? []) as SyncRunRow[]).map((row): AdminSyncRun => ({
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
      })),
      syncErrors: ((errorsResult.data ?? []) as SyncErrorRow[]).map((row): AdminSyncError => ({
        id: row.id,
        syncRunId: row.sync_run_id,
        endpoint: row.endpoint,
        contentId: row.content_id,
        errorCode: row.error_code,
        message: row.message,
        createdAt: row.created_at,
      })),
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

export async function getAdminOperations(): Promise<AdminQueryResult<Pick<AdminDashboardData, 'crowd' | 'syncRuns' | 'syncErrors'>>> {
  try {
    const { adminClient } = await requireAdmin();
    const placesResult = await getAdminPlacesForClient(adminClient);
    if (placesResult.error) return { data: { crowd: emptyCrowd(), syncRuns: [], syncErrors: [] }, error: placesResult.error };
    return getAdminOperationsForClient(adminClient, placesResult.data);
  } catch (error) {
    return { data: { crowd: emptyCrowd(), syncRuns: [], syncErrors: [] }, error: error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다.' };
  }
}

export async function getAdminDashboardData(): Promise<AdminQueryResult<AdminDashboardData>> {
  try {
    const { adminClient } = await requireAdmin();
    const placesResult = await getAdminPlacesForClient(adminClient);
    if (placesResult.error) {
      return { data: { places: [], courses: [], events: [], crowd: emptyCrowd(), syncRuns: [], syncErrors: [] }, error: placesResult.error };
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
      },
      error: coursesResult.error ?? eventsResult.error ?? operationsResult.error,
    };
  } catch (error) {
    return { data: { places: [], courses: [], events: [], crowd: emptyCrowd(), syncRuns: [], syncErrors: [] }, error: error instanceof Error ? error.message : '관리자 데이터를 불러오지 못했습니다.' };
  }
}
