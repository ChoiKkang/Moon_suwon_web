import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { isOpenAtStart } from '../src/lib/courses/opening-hours';

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const [homeResult, detailResult, publishedPlacesResult] = await Promise.all([
    supabase
      .from('v_home_courses')
      .select('id, slug, hero_title, spot_count')
      .order('display_priority', { ascending: true }),
    supabase
      .from('v_course_detail')
      .select('course_id, order_index, place_id')
      .order('order_index', { ascending: true }),
    supabase
      .from('v_published_places')
      .select('id, slug'),
  ]);

  const generatedResult = await serviceSupabase
    .schema('core')
    .from('courses')
    .select('id, slug, automation_source, automation_key, automation_metadata')
    .not('automation_source', 'is', null)
    .limit(100);
  if (generatedResult.error) throw new Error(`Failed to read generated course metadata: ${generatedResult.error.message}`);
  for (const course of generatedResult.data ?? []) {
    if (!course.automation_key || !course.automation_metadata || typeof course.automation_metadata !== 'object') {
      throw new Error(`Generated course ${course.slug} is missing automation provenance.`);
    }
    const metadata = course.automation_metadata as { distance_kind?: unknown; evidence?: unknown; constraint_violations?: unknown };
    if (metadata.distance_kind !== 'straight_line_estimate' && metadata.distance_kind !== 'routed') {
      throw new Error(`Generated course ${course.slug} has an invalid distance kind.`);
    }
    if (!Array.isArray(metadata.evidence) || !Array.isArray(metadata.constraint_violations)) {
      throw new Error(`Generated course ${course.slug} is missing evidence or constraint metadata.`);
    }
  }

  if (homeResult.error) {
    throw new Error(`Failed to read v_home_courses: ${homeResult.error.message}`);
  }

  if (detailResult.error) {
    throw new Error(`Failed to read v_course_detail: ${detailResult.error.message}`);
  }

  if (publishedPlacesResult.error) {
    throw new Error(`Failed to read v_published_places: ${publishedPlacesResult.error.message}`);
  }

  const detailCounts = new Map<string, number>();
  for (const row of detailResult.data ?? []) {
    detailCounts.set(row.course_id, (detailCounts.get(row.course_id) ?? 0) + 1);
  }

  const publishedPlaceIds = new Set((publishedPlacesResult.data ?? []).map((place) => place.id as string));
  const brokenLinks = (detailResult.data ?? []).filter((row) => !publishedPlaceIds.has(row.place_id as string));
  if (brokenLinks.length > 0) {
    throw new Error(`Published course details contain ${brokenLinks.length} unpublished place links.`);
  }

  console.log(`Published courses: ${homeResult.data?.length ?? 0}`);
  for (const course of homeResult.data ?? []) {
    console.log(`${course.hero_title} | ${course.slug} | ${detailCounts.get(course.id) ?? 0} places`);
  }
  console.log(`Generated drafts with provenance: ${generatedResult.data?.length ?? 0}`);

  await reportOpeningHourConflicts();
}

// 야간 코스가 권장 시작 시간에 이미 문을 닫은 장소를 포함하면 운영자가 알아야
// 한다. KTO 운영시간 원문을 보수적으로 해석하고, 판정할 수 없으면 확인 항목으로
// 남긴다. 공개 코스의 충돌은 실패로 처리하고, 비공개 초안은 검수 안내로 보여준다.
async function reportOpeningHourConflicts() {
  const [coursesResult, stopsResult, placesResult, publishResult] = await Promise.all([
    serviceSupabase.schema('core').from('courses').select('id, slug, recommended_start_time'),
    serviceSupabase.schema('core').from('course_places').select('course_id, place_id, order_index'),
    serviceSupabase.schema('core').from('places').select('id, official_name, operating_hours_raw'),
    serviceSupabase.schema('editorial').from('course_publish_state').select('course_id, is_published'),
  ]);

  const firstError = coursesResult.error ?? stopsResult.error ?? placesResult.error ?? publishResult.error;
  if (firstError) throw new Error(`Failed to read course opening hours: ${firstError.message}`);

  const placeById = new Map((placesResult.data ?? []).map((place) => [place.id as string, place]));
  const publishedCourses = new Set((publishResult.data ?? []).filter((row) => row.is_published).map((row) => row.course_id as string));
  const stopsByCourse = new Map<string, Array<{ place_id: string; order_index: number }>>();
  for (const stop of stopsResult.data ?? []) {
    const rows = stopsByCourse.get(stop.course_id as string) ?? [];
    rows.push({ place_id: stop.place_id as string, order_index: stop.order_index as number });
    stopsByCourse.set(stop.course_id as string, rows);
  }

  const publishedConflicts: string[] = [];
  const draftConflicts: string[] = [];
  const unresolved: string[] = [];

  for (const course of coursesResult.data ?? []) {
    const startTime = String(course.recommended_start_time ?? '');
    const stops = stopsByCourse.get(course.id as string) ?? [];
    for (const stop of stops) {
      const place = placeById.get(stop.place_id);
      if (!place) continue;
      const verdict = isOpenAtStart(place.operating_hours_raw as string | null, startTime);
      const label = `${course.slug} @${startTime} → ${place.official_name}`;
      if (verdict.open === false) {
        if (publishedCourses.has(course.id as string)) publishedConflicts.push(`${label} (${verdict.reason})`);
        else draftConflicts.push(`${label} (${verdict.reason})`);
      } else if (verdict.open === null) {
        unresolved.push(`${label} (${verdict.reason})`);
      }
    }
  }

  console.log(`opening-hour check: ${publishedConflicts.length} published conflicts, ${draftConflicts.length} draft conflicts, ${unresolved.length} unresolved`);
  for (const line of draftConflicts) console.warn(`WARN draft closes early: ${line}`);
  for (const line of unresolved) console.warn(`WARN hours unknown: ${line}`);
  if (publishedConflicts.length > 0) {
    for (const line of publishedConflicts) console.error(`FAIL published course visits a closed place: ${line}`);
    throw new Error(`${publishedConflicts.length} published course stops close before the recommended start time.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
