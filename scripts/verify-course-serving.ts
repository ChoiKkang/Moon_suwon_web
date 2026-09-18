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
//
// 예외: 성문·수문처럼 내부 관람이 끝난 뒤에도 조명이 켜진 외관을 밖에서 볼 수
// 있는 장소는 운영자가 night_exterior_viewing으로 지정한다. 이 경우 마감 시간을
// 위반으로 보지 않고, 외부 관람 대상으로 집계해 코스 문구가 그 성격을 밝히고
// 있는지 확인할 수 있게 보고한다.
async function reportOpeningHourConflicts() {
  const [coursesResult, stopsResult, placesResult, publishResult] = await Promise.all([
    serviceSupabase.schema('core').from('courses').select('id, slug, recommended_start_time'),
    serviceSupabase.schema('core').from('course_places').select('course_id, place_id, order_index'),
    serviceSupabase.schema('core').from('places').select('id, official_name, operating_hours_raw'),
    serviceSupabase.schema('editorial').from('course_publish_state').select('course_id, is_published'),
  ]);

  const firstError = coursesResult.error ?? stopsResult.error ?? placesResult.error ?? publishResult.error;
  if (firstError) throw new Error(`Failed to read course opening hours: ${firstError.message}`);

  const exteriorResult = await serviceSupabase
    .schema('editorial')
    .from('place_publish_state')
    .select('place_id, night_exterior_viewing');
  if (exteriorResult.error) throw new Error(`Failed to read night exterior flags: ${exteriorResult.error.message}`);
  const exteriorPlaceIds = new Set(
    (exteriorResult.data ?? []).filter((row) => row.night_exterior_viewing === true).map((row) => row.place_id as string),
  );

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
  const exteriorStops: string[] = [];
  const exteriorCourseIds = new Set<string>();

  for (const course of coursesResult.data ?? []) {
    const startTime = String(course.recommended_start_time ?? '');
    const stops = stopsByCourse.get(course.id as string) ?? [];
    for (const stop of stops) {
      const place = placeById.get(stop.place_id);
      if (!place) continue;
      const verdict = isOpenAtStart(place.operating_hours_raw as string | null, startTime);
      const label = `${course.slug} @${startTime} → ${place.official_name}`;
      if (verdict.open === false) {
        if (exteriorPlaceIds.has(stop.place_id)) {
          exteriorStops.push(`${label} (${verdict.reason} 외부 야경 관람 대상)`);
          exteriorCourseIds.add(course.id as string);
          continue;
        }
        if (publishedCourses.has(course.id as string)) publishedConflicts.push(`${label} (${verdict.reason})`);
        else draftConflicts.push(`${label} (${verdict.reason})`);
      } else if (verdict.open === null) {
        unresolved.push(`${label} (${verdict.reason})`);
      }
    }
  }

  console.log(
    `opening-hour check: ${publishedConflicts.length} published conflicts, ${draftConflicts.length} draft conflicts, ` +
      `${exteriorStops.length} exterior-viewing stops, ${unresolved.length} unresolved`,
  );
  for (const line of exteriorStops) console.log(`INFO exterior viewing: ${line}`);
  for (const line of draftConflicts) console.warn(`WARN draft closes early: ${line}`);
  for (const line of unresolved) console.warn(`WARN hours unknown: ${line}`);

  // 예외를 조용히 쓰지 못하게 한다. 외부 관람으로 통과한 공개 코스는 사용자가
  // 헛걸음하지 않도록 문구에서 그 성격을 밝혀야 한다.
  const missingDisclosure: string[] = [];
  const publishedExteriorCourseIds = [...exteriorCourseIds].filter((id) => publishedCourses.has(id));
  if (publishedExteriorCourseIds.length > 0) {
    const copyResult = await serviceSupabase
      .schema('editorial')
      .from('course_copy')
      .select('course_id, subtitle, route_summary')
      .in('course_id', publishedExteriorCourseIds);
    if (copyResult.error) throw new Error(`Failed to read course copy: ${copyResult.error.message}`);
    const copyByCourse = new Map((copyResult.data ?? []).map((row) => [row.course_id as string, row]));
    const slugById = new Map((coursesResult.data ?? []).map((row) => [row.id as string, row.slug as string]));

    for (const courseId of publishedExteriorCourseIds) {
      const copy = copyByCourse.get(courseId);
      const text = `${copy?.subtitle ?? ''} ${copy?.route_summary ?? ''}`;
      if (!/외관|외부|밖에서|야경을 감상|바깥/.test(text)) {
        missingDisclosure.push(String(slugById.get(courseId) ?? courseId));
      }
    }
  }
  if (missingDisclosure.length > 0) {
    for (const slug of missingDisclosure) {
      console.error(`FAIL published course relies on exterior viewing without disclosing it: ${slug}`);
    }
    throw new Error(`${missingDisclosure.length} published courses need an exterior-viewing note in their copy.`);
  }

  if (publishedConflicts.length > 0) {
    for (const line of publishedConflicts) console.error(`FAIL published course visits a closed place: ${line}`);
    throw new Error(`${publishedConflicts.length} published course stops close before the recommended start time.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
