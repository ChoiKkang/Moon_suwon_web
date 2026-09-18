import type { SupabaseClient } from '@supabase/supabase-js';
import { isOpenAtStart } from '@/lib/courses/opening-hours';
import { findNightAccess, type NightEvent } from '@/lib/courses/night-events';

// 운영 브리핑 판정을 한 곳에 모아 자동 알림과 Discord 명령이 같은 결론을 쓰게 한다.
// 서버 전용 service-role client를 받아 실행하며, 브라우저에서 호출하지 않는다.

export type Severity = 'action' | 'watch' | 'info';
export type Finding = { severity: Severity; text: string };

export type Briefing = {
  today: string;
  findings: Finding[];
  metrics: string[];
  status: 'action_required' | 'review' | 'healthy';
  actionCount: number;
  watchCount: number;
};

export type ReviewQueueItem = {
  placeId: string;
  name: string;
  contentTypeId: string | null;
  addressFull: string | null;
  hasHeroImage: boolean;
  hasCopy: boolean;
};

export type PublishReadyItem = {
  placeId: string;
  name: string;
};

export type CourseDraftItem = {
  courseId: string;
  slug: string;
  title: string;
  stopNames: string[];
  walkingDistanceKm: number | null;
  straightLineEstimate: boolean;
};

export const CURATION_CONTENT_TYPES = new Set(['12', '14', '15', '28', '32', '39']);

export function todayInSeoul(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function hoursSince(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - Date.parse(value)) / (60 * 60 * 1000);
}

const SYNC_JOBS: Array<{ job: string; maxAgeHours: number }> = [
  { job: 'content', maxAgeHours: 24 * 8 },
  { job: 'events', maxAgeHours: 36 },
  { job: 'crowd', maxAgeHours: 36 },
  { job: 'pet', maxAgeHours: 36 },
];

export async function buildBriefing(service: SupabaseClient, now: Date = new Date()): Promise<Briefing> {
  const today = todayInSeoul(now);
  const findings: Finding[] = [];
  const metrics: string[] = [];

  const [runs, places, states, copies, sources, courses, stops, coursePublish, courseCopy, events, forecasts, pets] = await Promise.all([
    service.schema('raw').from('sync_runs').select('source, status, error_count, completed_at, started_at').order('started_at', { ascending: false }).limit(60),
    service.schema('core').from('places').select('id, official_name, operating_hours_raw'),
    service.schema('editorial').from('place_publish_state').select('place_id, is_published, is_now_good_enabled, night_exterior_viewing'),
    service.schema('editorial').from('place_copy').select('place_id, short_description, night_highlight'),
    service.schema('core').from('place_sources').select('place_id, ingestion_status, kto_content_type_id'),
    service.schema('core').from('courses').select('id, slug, recommended_start_time, automation_source, walking_distance_km, automation_metadata'),
    service.schema('core').from('course_places').select('course_id, place_id, order_index'),
    service.schema('editorial').from('course_publish_state').select('course_id, is_published'),
    service.schema('editorial').from('course_copy').select('course_id, hero_title'),
    service.schema('core').from('events').select('event_name, start_date, end_date, event_place, play_time'),
    service.schema('core').from('place_crowd_forecasts').select('place_id').eq('forecast_date', today),
    service.schema('core').from('place_pet_policies').select('place_id, pet_policy, data_status'),
  ]);

  const firstError = [runs, places, states, copies, sources, courses, stops, coursePublish, courseCopy, events, forecasts, pets]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw new Error(`브리핑 데이터 조회 실패: ${firstError.message}`);

  const placeById = new Map((places.data ?? []).map((row) => [row.id as string, row]));
  const stateByPlace = new Map((states.data ?? []).map((row) => [row.place_id as string, row]));
  const copyByPlace = new Map((copies.data ?? []).map((row) => [row.place_id as string, row]));
  const publishedPlaceIds = (states.data ?? []).filter((row) => row.is_published).map((row) => row.place_id as string);
  const publishedCourseIds = new Set((coursePublish.data ?? []).filter((row) => row.is_published).map((row) => row.course_id as string));
  const courseTitleById = new Map((courseCopy.data ?? []).map((row) => [row.course_id as string, row.hero_title as string]));

  const nightEvents: NightEvent[] = (events.data ?? []).map((row) => ({
    eventName: row.event_name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    eventPlace: (row.event_place as string | null) ?? null,
    playTime: (row.play_time as string | null) ?? null,
  }));

  for (const { job, maxAgeHours } of SYNC_JOBS) {
    const run = (runs.data ?? []).find((row) => row.source === `GitHubActions:${job}`);
    if (!run) {
      findings.push({ severity: 'action', text: `${job} 수집 이력이 없습니다.` });
      continue;
    }
    const age = hoursSince((run.completed_at as string | null) ?? (run.started_at as string));
    if (run.status !== 'completed') {
      findings.push({ severity: 'action', text: `${job} 최근 실행 상태가 ${run.status}입니다.` });
    } else if (age > maxAgeHours) {
      findings.push({ severity: 'action', text: `${job} 데이터가 ${Math.round(age)}시간 전으로 허용 주기(${maxAgeHours}시간)를 넘었습니다.` });
    }
    if ((run.error_count as number) > 0) {
      findings.push({ severity: 'watch', text: `${job} 최근 실행에 부분 오류 ${run.error_count}건이 있습니다.` });
    }
  }

  const forecastPlaceIds = new Set((forecasts.data ?? []).map((row) => row.place_id as string));
  const nowGoodIds = (states.data ?? []).filter((row) => row.is_published && row.is_now_good_enabled).map((row) => row.place_id as string);
  const missingForecast = nowGoodIds.filter((id) => !forecastPlaceIds.has(id));
  metrics.push(`오늘 혼잡도 예보 ${forecastPlaceIds.size}곳 / 추천 대상 ${nowGoodIds.length}곳`);
  if (missingForecast.length > 0) {
    const names = missingForecast.map((id) => String(placeById.get(id)?.official_name ?? id));
    findings.push({ severity: 'watch', text: `오늘 예보가 없는 추천 대상: ${names.join(', ')}` });
  }

  const candidates = (sources.data ?? []).filter((row) => row.ingestion_status === 'candidate');
  const offScope = candidates.filter((row) => !CURATION_CONTENT_TYPES.has(String(row.kto_content_type_id)));
  if (candidates.length > 0) {
    findings.push({ severity: 'action', text: `검수 대기 후보 ${candidates.length}건이 있습니다. \`/달빛 검수\`로 확인하세요.` });
  }
  if (offScope.length > 0) {
    findings.push({ severity: 'action', text: `큐레이션 범위를 벗어난 후보 ${offScope.length}건이 있습니다. 수집 설정을 확인하세요.` });
  }

  const readyToPublish = (sources.data ?? [])
    .filter((row) => row.ingestion_status === 'approved' && !stateByPlace.get(row.place_id as string)?.is_published)
    .filter((row) => {
      const copy = copyByPlace.get(row.place_id as string);
      return Boolean(copy?.short_description && copy?.night_highlight);
    })
    .map((row) => String(placeById.get(row.place_id as string)?.official_name ?? row.place_id));
  if (readyToPublish.length > 0) {
    findings.push({
      severity: 'watch',
      text: `문구가 준비되어 공개만 남은 장소 ${readyToPublish.length}곳: ${readyToPublish.slice(0, 5).join(', ')}${readyToPublish.length > 5 ? ' 등' : ''}`,
    });
  }

  const stopsByCourse = new Map<string, Array<{ place_id: string; order_index: number }>>();
  for (const stop of stops.data ?? []) {
    const rows = stopsByCourse.get(stop.course_id as string) ?? [];
    rows.push({ place_id: stop.place_id as string, order_index: stop.order_index as number });
    stopsByCourse.set(stop.course_id as string, rows);
  }

  const closedStops: string[] = [];
  const eventOpenStops: string[] = [];
  const exteriorStops: string[] = [];
  const unknownStops: string[] = [];

  for (const course of courses.data ?? []) {
    const startTime = String(course.recommended_start_time ?? '');
    const isPublished = publishedCourseIds.has(course.id as string);
    const title = String(courseTitleById.get(course.id as string) ?? course.slug).replace(/\s+/g, ' ');
    for (const stop of stopsByCourse.get(course.id as string) ?? []) {
      const place = placeById.get(stop.place_id);
      if (!place) continue;
      const name = String(place.official_name);
      const verdict = isOpenAtStart(place.operating_hours_raw as string | null, startTime, now);
      if (verdict.open === false) {
        const access = findNightAccess(name, startTime, today, nightEvents);
        if (access.kind === 'event_open') {
          eventOpenStops.push(`${name} (${access.eventName}, ${access.until}까지)`);
        } else if (stateByPlace.get(stop.place_id)?.night_exterior_viewing) {
          exteriorStops.push(name);
        } else if (isPublished) {
          closedStops.push(`${title} @${startTime} → ${name} (${verdict.reason})`);
        }
      } else if (verdict.open === null) {
        unknownStops.push(`${name} (${verdict.reason})`);
      }
    }
  }

  if (closedStops.length > 0) {
    findings.push({ severity: 'action', text: `공개 코스가 마감된 장소를 안내합니다: ${closedStops.join(' / ')}` });
  }
  if (eventOpenStops.length > 0) {
    findings.push({ severity: 'info', text: `오늘 야간 행사로 내부 관람 가능: ${[...new Set(eventOpenStops)].join(' / ')}` });
  }
  if (unknownStops.length > 0) {
    const unique = [...new Set(unknownStops)];
    findings.push({
      severity: 'watch',
      text: `운영시간을 판정할 수 없는 코스 경유지 ${unique.length}건: ${unique.slice(0, 3).join(', ')}${unique.length > 3 ? ' 등' : ''}`,
    });
  }

  const draftCourses = (courses.data ?? []).filter((row) => row.automation_source && !publishedCourseIds.has(row.id as string));
  if (draftCourses.length > 0) {
    findings.push({ severity: 'watch', text: `검수 대기 자동 코스 초안 ${draftCourses.length}건. \`/달빛 코스\`로 확인하세요.` });
  }

  const todayEvents = nightEvents.filter((event) => event.startDate <= today && today <= event.endDate);
  metrics.push(`오늘 진행 행사 ${todayEvents.length}건`);

  const petByPlace = new Map((pets.data ?? []).map((row) => [row.place_id as string, row]));
  const petNotChecked = publishedPlaceIds.filter((id) => !petByPlace.get(id));
  const petNoSourceData = publishedPlaceIds.filter((id) => {
    const pet = petByPlace.get(id);
    return Boolean(pet) && (pet?.pet_policy === 'unknown' || pet?.data_status === 'unknown');
  });
  metrics.push(`공개 장소 ${publishedPlaceIds.length}곳 / 공개 코스 ${publishedCourseIds.size}개`);
  if (petNotChecked.length > 0) {
    const names = petNotChecked.map((id) => String(placeById.get(id)?.official_name ?? id));
    findings.push({
      severity: 'watch',
      text: `반려동물 정책을 아직 조회하지 않은 공개 장소 ${names.length}곳: ${names.slice(0, 5).join(', ')}${names.length > 5 ? ' 등' : ''}. 다음 pet 동기화가 채웁니다.`,
    });
  }
  if (petNoSourceData.length > 0) {
    metrics.push(`반려동물 원천 데이터 없음 ${petNoSourceData.length}곳(공공데이터 미수록)`);
  }
  if (exteriorStops.length > 0) {
    metrics.push(`외부 야경 관람 경유지 ${[...new Set(exteriorStops)].length}곳`);
  }

  const actionCount = findings.filter((item) => item.severity === 'action').length;
  const watchCount = findings.filter((item) => item.severity === 'watch').length;
  return {
    today,
    findings,
    metrics,
    status: actionCount > 0 ? 'action_required' : watchCount > 0 ? 'review' : 'healthy',
    actionCount,
    watchCount,
  };
}

export function formatBriefing(briefing: Briefing): string {
  const actions = briefing.findings.filter((item) => item.severity === 'action');
  const watches = briefing.findings.filter((item) => item.severity === 'watch');
  const infos = briefing.findings.filter((item) => item.severity === 'info');

  const lines: string[] = [];
  lines.push(`**${briefing.today} 달빛수원 운영 브리핑**`);
  lines.push('');
  if (actions.length === 0 && watches.length === 0) {
    lines.push('조치가 필요한 항목이 없습니다.');
    lines.push('');
  }
  if (actions.length > 0) {
    lines.push(`**즉시 조치 ${actions.length}건**`);
    for (const item of actions) lines.push(`- ${item.text}`);
    lines.push('');
  }
  if (watches.length > 0) {
    lines.push(`**확인 권장 ${watches.length}건**`);
    for (const item of watches) lines.push(`- ${item.text}`);
    lines.push('');
  }
  for (const item of infos) lines.push(`- ${item.text}`);
  if (infos.length > 0) lines.push('');
  lines.push(`지표: ${briefing.metrics.join(' · ')}`);
  return lines.join('\n');
}

export async function listReviewQueue(service: SupabaseClient): Promise<ReviewQueueItem[]> {
  const [sources, places, images, copies] = await Promise.all([
    service.schema('core').from('place_sources').select('place_id, ingestion_status, kto_content_type_id').eq('ingestion_status', 'candidate'),
    service.schema('core').from('places').select('id, official_name, address_full'),
    service.schema('core').from('place_images').select('place_id').eq('is_hero', true),
    service.schema('editorial').from('place_copy').select('place_id, short_description, night_highlight'),
  ]);
  const firstError = sources.error ?? places.error ?? images.error ?? copies.error;
  if (firstError) throw new Error(`검수 대기 조회 실패: ${firstError.message}`);

  const placeById = new Map((places.data ?? []).map((row) => [row.id as string, row]));
  const heroIds = new Set((images.data ?? []).map((row) => row.place_id as string));
  const copyByPlace = new Map((copies.data ?? []).map((row) => [row.place_id as string, row]));

  return (sources.data ?? []).map((row) => {
    const place = placeById.get(row.place_id as string);
    const copy = copyByPlace.get(row.place_id as string);
    return {
      placeId: row.place_id as string,
      name: String(place?.official_name ?? row.place_id),
      contentTypeId: row.kto_content_type_id ? String(row.kto_content_type_id) : null,
      addressFull: (place?.address_full as string | null) ?? null,
      hasHeroImage: heroIds.has(row.place_id as string),
      hasCopy: Boolean(copy?.short_description && copy?.night_highlight),
    };
  });
}

export async function listPublishReady(service: SupabaseClient): Promise<PublishReadyItem[]> {
  const [sources, states, copies, places] = await Promise.all([
    service.schema('core').from('place_sources').select('place_id, ingestion_status'),
    service.schema('editorial').from('place_publish_state').select('place_id, is_published'),
    service.schema('editorial').from('place_copy').select('place_id, short_description, night_highlight'),
    service.schema('core').from('places').select('id, official_name'),
  ]);
  const firstError = sources.error ?? states.error ?? copies.error ?? places.error;
  if (firstError) throw new Error(`공개 준비 목록 조회 실패: ${firstError.message}`);

  const published = new Set((states.data ?? []).filter((row) => row.is_published).map((row) => row.place_id as string));
  const copyByPlace = new Map((copies.data ?? []).map((row) => [row.place_id as string, row]));
  const placeById = new Map((places.data ?? []).map((row) => [row.id as string, row]));

  return (sources.data ?? [])
    .filter((row) => row.ingestion_status === 'approved' && !published.has(row.place_id as string))
    .filter((row) => {
      const copy = copyByPlace.get(row.place_id as string);
      return Boolean(copy?.short_description && copy?.night_highlight);
    })
    .map((row) => ({
      placeId: row.place_id as string,
      name: String(placeById.get(row.place_id as string)?.official_name ?? row.place_id),
    }));
}

export async function listCourseDrafts(service: SupabaseClient): Promise<CourseDraftItem[]> {
  const [courses, publish, copies, stops, places] = await Promise.all([
    service.schema('core').from('courses').select('id, slug, automation_source, walking_distance_km, automation_metadata').not('automation_source', 'is', null),
    service.schema('editorial').from('course_publish_state').select('course_id, is_published'),
    service.schema('editorial').from('course_copy').select('course_id, hero_title'),
    service.schema('core').from('course_places').select('course_id, place_id, order_index'),
    service.schema('core').from('places').select('id, official_name'),
  ]);
  const firstError = courses.error ?? publish.error ?? copies.error ?? stops.error ?? places.error;
  if (firstError) throw new Error(`코스 초안 조회 실패: ${firstError.message}`);

  const published = new Set((publish.data ?? []).filter((row) => row.is_published).map((row) => row.course_id as string));
  const titleById = new Map((copies.data ?? []).map((row) => [row.course_id as string, row.hero_title as string]));
  const nameById = new Map((places.data ?? []).map((row) => [row.id as string, row.official_name as string]));

  return (courses.data ?? [])
    .filter((row) => !published.has(row.id as string))
    .map((row) => {
      const metadata = (row.automation_metadata ?? {}) as { distance_kind?: unknown };
      const courseStops = (stops.data ?? [])
        .filter((stop) => stop.course_id === row.id)
        .sort((a, b) => (a.order_index as number) - (b.order_index as number))
        .map((stop) => String(nameById.get(stop.place_id as string) ?? stop.place_id));
      return {
        courseId: row.id as string,
        slug: row.slug as string,
        title: String(titleById.get(row.id as string) ?? row.slug).replace(/\s+/g, ' '),
        stopNames: courseStops,
        walkingDistanceKm: typeof row.walking_distance_km === 'number' ? row.walking_distance_km : null,
        straightLineEstimate: metadata.distance_kind === 'straight_line_estimate',
      };
    });
}
