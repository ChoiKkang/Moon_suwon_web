import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are required');
}

const publicClient = createClient(url, anonKey, { auth: { persistSession: false } });
const serviceClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function main() {
  const [placesResult, placeStatesResult, coursesResult, courseStatesResult, candidateSourcesResult] = await Promise.all([
    serviceClient.schema('core').from('places').select('id, slug').eq('is_active', true),
    serviceClient.schema('editorial').from('place_publish_state').select('place_id, is_published'),
    serviceClient.schema('core').from('courses').select('id, slug'),
    serviceClient.schema('editorial').from('course_publish_state').select('course_id, is_published'),
    serviceClient.schema('core').from('place_sources').select('place_id, ingestion_status').eq('ingestion_status', 'candidate').limit(1),
  ]);
  const sourceError = placesResult.error ?? placeStatesResult.error ?? coursesResult.error ?? courseStatesResult.error ?? candidateSourcesResult.error;
  if (sourceError) throw new Error(`service boundary source query failed: ${sourceError.message}`);

  const publishedPlaceIds = new Set((placeStatesResult.data ?? []).filter((row) => row.is_published === true).map((row) => row.place_id as string));
  const publishedCourseIds = new Set((courseStatesResult.data ?? []).filter((row) => row.is_published === true).map((row) => row.course_id as string));
  const unpublishedPlace = (placesResult.data ?? []).find((row) => !publishedPlaceIds.has(row.id as string));
  const unpublishedCourse = (coursesResult.data ?? []).find((row) => !publishedCourseIds.has(row.id as string));
  if (!unpublishedPlace || !unpublishedCourse) throw new Error('Need at least one unpublished place and course for the boundary probe');

  const publishedPlace = (placesResult.data ?? []).find((row) => publishedPlaceIds.has(row.id as string));
  const publishedCourse = (coursesResult.data ?? []).find((row) => publishedCourseIds.has(row.id as string));
  if (!publishedPlace || !publishedCourse) throw new Error('Need at least one published place and course for the boundary probe');

  const [publicPlaces, publicCourses, publicImported, publicPlaceRpc, publicCourseRpc, unpublishedPlaceRpc, unpublishedCourseRpc, anonymousAdminRpc, anonymousVisitorRpc, anonymousCheckinRpc, anonymousAuditTable, anonymousAuditRpc] = await Promise.all([
    publicClient.schema('core').from('places').select('id').limit(1000),
    publicClient.schema('core').from('courses').select('id').limit(1000),
    publicClient.from('v_imported_places').select('id').limit(1000),
    publicClient.rpc('get_place_by_slug', { p_slug: publishedPlace.slug }),
    publicClient.rpc('get_course_by_slug', { p_slug: publishedCourse.slug }),
    publicClient.rpc('get_place_by_slug', { p_slug: unpublishedPlace.slug }),
    publicClient.rpc('get_course_by_slug', { p_slug: unpublishedCourse.slug }),
    publicClient.rpc('admin_upsert_course', { p_payload: {} }),
    publicClient.rpc('admin_get_regional_visitor_summary', {
      p_from: '2026-01-01',
      p_to: '2026-01-31',
    }),
    publicClient.rpc('checkin_place', {
      p_progress_id: '00000000-0000-0000-0000-000000000001',
      p_place_id: publishedPlace.id,
      p_lat: 37.28,
      p_lng: 127.01,
      p_mode: 'gps',
    }),
    publicClient.schema('audit').from('admin_events').select('id').limit(1),
    publicClient.rpc('admin_record_audit', {
      p_entity_type: 'place',
      p_entity_id: unpublishedPlace.id,
      p_action: 'probe',
      p_metadata: {},
    }),
  ]);

  if (publicPlaces.error || publicPlaces.data?.length !== publishedPlaceIds.size) {
    throw new Error(`direct core.places boundary failed: ${publicPlaces.error?.message ?? `expected ${publishedPlaceIds.size} published rows, got ${publicPlaces.data?.length ?? 0}`}`);
  }
  if (!publicCourses.error && (publicCourses.data ?? []).length > 0) {
    throw new Error('direct core.courses should not be readable by the anonymous role');
  }
  if (publicImported.error || (publicImported.data ?? []).some((row) => !publishedPlaceIds.has(row.id as string))) {
    throw new Error(`public.v_imported_places boundary failed: ${publicImported.error?.message ?? 'unpublished row returned'}`);
  }
  if (publicPlaceRpc.error || !publicPlaceRpc.data || typeof publicPlaceRpc.data !== 'object') {
    throw new Error(`published place RPC failed: ${publicPlaceRpc.error?.message ?? 'empty payload'}`);
  }
  const publicPlacePayload = publicPlaceRpc.data as Record<string, unknown>;
  if (!('pet_policy' in publicPlacePayload) || !('pet_data_status' in publicPlacePayload)) {
    throw new Error('published place RPC is missing pet policy/freshness fields');
  }
  const additiveBlocks = [
    'related_places',
    'approved_photos',
    'wellness_tags',
    'weather_summary',
    'mid_weather_summary',
    'nearby_bus_arrivals',
  ];
  for (const blockName of additiveBlocks) {
    const block = publicPlacePayload[blockName];
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
      throw new Error(`published place RPC is missing ${blockName}`);
    }
    const payload = block as Record<string, unknown>;
    if (!Array.isArray(payload.items) || !('data_status' in payload) || !('source_updated_at' in payload) || !('fetched_at' in payload)) {
      throw new Error(`published place RPC ${blockName} is missing items/freshness fields`);
    }
  }
  if (publicCourseRpc.error || !publicCourseRpc.data || typeof publicCourseRpc.data !== 'object') {
    throw new Error(`published course RPC failed: ${publicCourseRpc.error?.message ?? 'empty payload'}`);
  }
  const publicCoursePayload = publicCourseRpc.data as { places?: Array<Record<string, unknown>> };
  if (!Array.isArray(publicCoursePayload.places) || publicCoursePayload.places.some((place) => !('pet_policy' in place))) {
    throw new Error('published course RPC is missing per-stop pet policy fields');
  }
  if (unpublishedPlaceRpc.error || unpublishedPlaceRpc.data !== null) {
    throw new Error(`unpublished place RPC returned data: ${unpublishedPlaceRpc.error?.message ?? 'unexpected payload'}`);
  }
  if (unpublishedCourseRpc.error || unpublishedCourseRpc.data !== null) {
    throw new Error(`unpublished course RPC returned data: ${unpublishedCourseRpc.error?.message ?? 'unexpected payload'}`);
  }
  if (!anonymousAdminRpc.error) {
    throw new Error('admin_upsert_course should not be executable by the anonymous role');
  }
  if (!anonymousVisitorRpc.error) {
    throw new Error('admin_get_regional_visitor_summary should not be executable by the anonymous role');
  }
  if (!anonymousCheckinRpc.error) {
    throw new Error('checkin_place should not be executable by the anonymous role');
  }
  if (!anonymousAuditTable.error && (anonymousAuditTable.data ?? []).length > 0) {
    throw new Error('audit.admin_events should not be readable by the anonymous role');
  }
  if (!anonymousAuditRpc.error) {
    throw new Error('admin_record_audit should not be executable by the anonymous role');
  }
  const candidateIds = new Set((candidateSourcesResult.data ?? []).map((row) => row.place_id as string));
  if (candidateIds.size > 0 && (publicImported.data ?? []).some((row) => candidateIds.has(row.id as string))) {
    throw new Error('candidate place leaked into public.v_imported_places');
  }

  const [registryTable, rawItems, photoCandidates, wellness, localHub, relations, durunubi, visitors, weather, busStops, busArrivals, registryRpc] = await Promise.all([
    publicClient.schema('ops').from('api_registry').select('api_key').limit(1),
    publicClient.schema('raw').from('public_api_items').select('id').limit(1),
    publicClient.schema('core').from('place_photo_candidates').select('id').limit(1),
    publicClient.schema('core').from('place_wellness').select('source_item_key').limit(1),
    publicClient.schema('core').from('local_hub_candidates').select('source_item_key').limit(1),
    publicClient.schema('core').from('place_relations').select('origin_source_key').limit(1),
    publicClient.schema('core').from('durunubi_courses').select('source_item_key').limit(1),
    publicClient.schema('core').from('regional_visitor_stats').select('stat_date').limit(1),
    publicClient.schema('core').from('weather_forecasts').select('forecast_at').limit(1),
    publicClient.schema('core').from('place_bus_stops').select('place_id').limit(1),
    publicClient.schema('core').from('bus_arrival_snapshots').select('station_id').limit(1),
    publicClient.rpc('sync_list_api_registry'),
  ]);

  const privateProbes = [registryTable, rawItems, photoCandidates, wellness, localHub, relations, durunubi, visitors, weather, busStops, busArrivals];
  if (privateProbes.some((probe) => !probe.error && (probe.data ?? []).length > 0)) {
    throw new Error('an approved-API private table returned rows to the anonymous role');
  }
  if (!registryRpc.error) {
    throw new Error('sync_list_api_registry should not be executable by the anonymous role');
  }

  console.log(`Public boundary passed: ${publishedPlaceIds.size} places, ${publishedCourseIds.size} courses, reviewed additive fields exposed, private analytics and unpublished getters blocked.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
