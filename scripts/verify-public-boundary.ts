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
  const [placesResult, placeStatesResult, coursesResult, courseStatesResult] = await Promise.all([
    serviceClient.schema('core').from('places').select('id, slug').eq('is_active', true),
    serviceClient.schema('editorial').from('place_publish_state').select('place_id, is_published'),
    serviceClient.schema('core').from('courses').select('id, slug'),
    serviceClient.schema('editorial').from('course_publish_state').select('course_id, is_published'),
  ]);
  const sourceError = placesResult.error ?? placeStatesResult.error ?? coursesResult.error ?? courseStatesResult.error;
  if (sourceError) throw new Error(`service boundary source query failed: ${sourceError.message}`);

  const publishedPlaceIds = new Set((placeStatesResult.data ?? []).filter((row) => row.is_published === true).map((row) => row.place_id as string));
  const publishedCourseIds = new Set((courseStatesResult.data ?? []).filter((row) => row.is_published === true).map((row) => row.course_id as string));
  const unpublishedPlace = (placesResult.data ?? []).find((row) => !publishedPlaceIds.has(row.id as string));
  const unpublishedCourse = (coursesResult.data ?? []).find((row) => !publishedCourseIds.has(row.id as string));
  if (!unpublishedPlace || !unpublishedCourse) throw new Error('Need at least one unpublished place and course for the boundary probe');

  const [publicPlaces, publicCourses, publicImported, unpublishedPlaceRpc, unpublishedCourseRpc, anonymousAdminRpc] = await Promise.all([
    publicClient.schema('core').from('places').select('id').limit(1000),
    publicClient.schema('core').from('courses').select('id').limit(1000),
    publicClient.from('v_imported_places').select('id').limit(1000),
    publicClient.rpc('get_place_by_slug', { p_slug: unpublishedPlace.slug }),
    publicClient.rpc('get_course_by_slug', { p_slug: unpublishedCourse.slug }),
    publicClient.rpc('admin_upsert_course', { p_payload: {} }),
  ]);

  if (publicPlaces.error || publicPlaces.data?.length !== publishedPlaceIds.size) {
    throw new Error(`direct core.places boundary failed: ${publicPlaces.error?.message ?? `expected ${publishedPlaceIds.size} rows, got ${publicPlaces.data?.length ?? 0}`}`);
  }
  if (!publicCourses.error || (publicCourses.data ?? []).length > 0) {
    throw new Error('direct core.courses should not be readable by the anonymous role');
  }
  if (publicImported.error || (publicImported.data ?? []).some((row) => !publishedPlaceIds.has(row.id as string))) {
    throw new Error(`public.v_imported_places boundary failed: ${publicImported.error?.message ?? 'unpublished row returned'}`);
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

  console.log(`Public boundary passed: ${publishedPlaceIds.size} places, ${publishedCourseIds.size} courses, unpublished getters blocked.`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
