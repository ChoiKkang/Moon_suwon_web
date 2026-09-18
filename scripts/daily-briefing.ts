import { loadEnvConfig } from '@next/env';
import { appendFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { isOpenAtStart } from '../src/lib/courses/opening-hours';
import { findNightAccess, type NightEvent } from '../src/lib/courses/night-events';

loadEnvConfig(process.cwd());

// 운영자가 매일 관리자 화면을 뒤지지 않아도 되도록 오늘 기준 서비스 상태를
// 한 번에 판정해 Discord로 보고한다. 사람이 결정할 항목만 골라서 올리고,
// 기계가 판정할 수 있는 항목은 결론까지 낸다.
//
// 보고 원칙:
// - 조치가 필요한 항목을 먼저, 정상 지표는 요약 한 줄로.
// - 판정할 수 없으면 추측하지 않고 확인 요청으로 표시한다.
// - 값이 없거나 오래된 데이터는 숨기지 않는다.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !serviceRoleKey || !anonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
}

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
// 브리핑은 운영자용이므로 service role로 내부 상태까지 읽는다. anon 키는 공개
// 계약 확인용으로만 요구하고 실제 조회에는 쓰지 않는다.
void anonKey;

type Finding = { severity: 'action' | 'watch' | 'info'; text: string };

function todayInSeoul(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function hoursSince(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  return (Date.now() - Date.parse(value)) / (60 * 60 * 1000);
}

async function main() {
  const today = todayInSeoul();
  const findings: Finding[] = [];
  const metrics: string[] = [];

  const [
    runsResult,
    placesResult,
    statesResult,
    copyResult,
    sourcesResult,
    coursesResult,
    stopsResult,
    coursePublishResult,
    courseCopyResult,
    eventsResult,
    forecastResult,
    petResult,
  ] = await Promise.all([
    service.schema('raw').from('sync_runs').select('source, status, error_count, completed_at, started_at').order('started_at', { ascending: false }).limit(60),
    service.schema('core').from('places').select('id, official_name, operating_hours_raw'),
    service.schema('editorial').from('place_publish_state').select('place_id, is_published, is_now_good_enabled, night_exterior_viewing'),
    service.schema('editorial').from('place_copy').select('place_id, short_description, night_highlight'),
    service.schema('core').from('place_sources').select('place_id, ingestion_status, kto_content_type_id'),
    service.schema('core').from('courses').select('id, slug, recommended_start_time, automation_source'),
    service.schema('core').from('course_places').select('course_id, place_id, order_index'),
    service.schema('editorial').from('course_publish_state').select('course_id, is_published'),
    service.schema('editorial').from('course_copy').select('course_id, hero_title, subtitle, route_summary'),
    service.schema('core').from('events').select('event_name, start_date, end_date, event_place, play_time'),
    service.schema('core').from('place_crowd_forecasts').select('place_id, forecast_date, source_updated_at').eq('forecast_date', today),
    service.schema('core').from('place_pet_policies').select('place_id, pet_policy, data_status'),
  ]);

  const firstError = [runsResult, placesResult, statesResult, copyResult, sourcesResult, coursesResult, stopsResult, coursePublishResult, courseCopyResult, eventsResult, forecastResult, petResult]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw new Error(`브리핑 데이터 조회 실패: ${firstError.message}`);

  const placeById = new Map((placesResult.data ?? []).map((row) => [row.id as string, row]));
  const stateByPlace = new Map((statesResult.data ?? []).map((row) => [row.place_id as string, row]));
  const copyByPlace = new Map((copyResult.data ?? []).map((row) => [row.place_id as string, row]));
  const publishedPlaceIds = (statesResult.data ?? []).filter((row) => row.is_published).map((row) => row.place_id as string);
  const publishedCourseIds = new Set((coursePublishResult.data ?? []).filter((row) => row.is_published).map((row) => row.course_id as string));
  const courseCopyById = new Map((courseCopyResult.data ?? []).map((row) => [row.course_id as string, row]));

  const nightEvents: NightEvent[] = (eventsResult.data ?? []).map((row) => ({
    eventName: row.event_name as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    eventPlace: (row.event_place as string | null) ?? null,
    playTime: (row.play_time as string | null) ?? null,
  }));

  // 1. 수집 신선도
  const jobs: Array<{ job: string; maxAgeHours: number }> = [
    { job: 'content', maxAgeHours: 24 * 8 },
    { job: 'events', maxAgeHours: 36 },
    { job: 'crowd', maxAgeHours: 36 },
    { job: 'pet', maxAgeHours: 36 },
  ];
  for (const { job, maxAgeHours } of jobs) {
    const run = (runsResult.data ?? []).find((row) => row.source === `GitHubActions:${job}`);
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

  // 2. 오늘 혼잡도 커버리지
  const forecastPlaceIds = new Set((forecastResult.data ?? []).map((row) => row.place_id as string));
  const nowGoodIds = (statesResult.data ?? []).filter((row) => row.is_published && row.is_now_good_enabled).map((row) => row.place_id as string);
  const missingForecast = nowGoodIds.filter((id) => !forecastPlaceIds.has(id));
  metrics.push(`오늘 혼잡도 예보 ${forecastPlaceIds.size}곳 / 추천 대상 ${nowGoodIds.length}곳`);
  if (missingForecast.length > 0) {
    const names = missingForecast.map((id) => String(placeById.get(id)?.official_name ?? id));
    findings.push({ severity: 'watch', text: `오늘 예보가 없는 추천 대상: ${names.join(', ')}` });
  }

  // 3. 검수 대기와 공개 준비 상태
  const candidates = (sourcesResult.data ?? []).filter((row) => row.ingestion_status === 'candidate');
  const CURATION_TYPES = new Set(['12', '14', '15', '28', '32', '39']);
  const offScope = candidates.filter((row) => !CURATION_TYPES.has(String(row.kto_content_type_id)));
  if (candidates.length > 0) {
    findings.push({ severity: 'action', text: `검수 대기 후보 ${candidates.length}건이 있습니다.` });
  }
  if (offScope.length > 0) {
    findings.push({ severity: 'action', text: `큐레이션 범위를 벗어난 후보 ${offScope.length}건이 있습니다. 수집 설정을 확인하세요.` });
  }

  const readyToPublish = (sourcesResult.data ?? [])
    .filter((row) => row.ingestion_status === 'approved' && !stateByPlace.get(row.place_id as string)?.is_published)
    .filter((row) => {
      const copy = copyByPlace.get(row.place_id as string);
      return Boolean(copy?.short_description && copy?.night_highlight);
    })
    .map((row) => String(placeById.get(row.place_id as string)?.official_name ?? row.place_id));
  if (readyToPublish.length > 0) {
    findings.push({ severity: 'watch', text: `문구가 준비되어 공개만 남은 장소 ${readyToPublish.length}곳: ${readyToPublish.slice(0, 5).join(', ')}${readyToPublish.length > 5 ? ' 등' : ''}` });
  }

  // 4. 코스 운영시간 검사 (야간 행사 기간 반영)
  const stopsByCourse = new Map<string, Array<{ place_id: string; order_index: number }>>();
  for (const stop of stopsResult.data ?? []) {
    const rows = stopsByCourse.get(stop.course_id as string) ?? [];
    rows.push({ place_id: stop.place_id as string, order_index: stop.order_index as number });
    stopsByCourse.set(stop.course_id as string, rows);
  }

  const closedStops: string[] = [];
  const eventOpenStops: string[] = [];
  const exteriorStops: string[] = [];
  const unknownStops: string[] = [];

  for (const course of coursesResult.data ?? []) {
    const startTime = String(course.recommended_start_time ?? '');
    const isPublished = publishedCourseIds.has(course.id as string);
    const title = String(courseCopyById.get(course.id as string)?.hero_title ?? course.slug).replace(/\s+/g, ' ');
    for (const stop of stopsByCourse.get(course.id as string) ?? []) {
      const place = placeById.get(stop.place_id);
      if (!place) continue;
      const name = String(place.official_name);
      const verdict = isOpenAtStart(place.operating_hours_raw as string | null, startTime);
      if (verdict.open === false) {
        const access = findNightAccess(name, startTime, today, nightEvents);
        if (access.kind === 'event_open') {
          eventOpenStops.push(`${name} (${access.eventName}, ${access.until}까지)`);
        } else if (stateByPlace.get(stop.place_id)?.night_exterior_viewing) {
          exteriorStops.push(`${title} → ${name}`);
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
    // 같은 장소가 여러 코스에 등장하므로 장소 단위로 묶어 보고한다.
    findings.push({ severity: 'info', text: `오늘 야간 행사로 내부 관람 가능: ${[...new Set(eventOpenStops)].join(' / ')}` });
  }
  if (unknownStops.length > 0) {
    const unique = [...new Set(unknownStops)];
    findings.push({ severity: 'watch', text: `운영시간을 판정할 수 없는 코스 경유지 ${unique.length}건: ${unique.slice(0, 3).join(', ')}${unique.length > 3 ? ' 등' : ''}` });
  }

  // 5. 검수 대기 코스 초안
  const draftCourses = (coursesResult.data ?? []).filter((row) => row.automation_source && !publishedCourseIds.has(row.id as string));
  if (draftCourses.length > 0) {
    findings.push({ severity: 'watch', text: `검수 대기 자동 코스 초안 ${draftCourses.length}건. 도보 동선과 야간 조명을 확인한 뒤 공개하세요.` });
  }

  // 6. 오늘 진행 중인 행사
  const todayEvents = nightEvents.filter((event) => event.startDate <= today && today <= event.endDate);
  metrics.push(`오늘 진행 행사 ${todayEvents.length}건`);

  // 7. 반려동물 정책 커버리지
  const petByPlace = new Map((petResult.data ?? []).map((row) => [row.place_id as string, row]));
  const petUnknown = publishedPlaceIds.filter((id) => {
    const pet = petByPlace.get(id);
    return !pet || pet.pet_policy === 'unknown' || pet.data_status === 'unknown';
  });
  metrics.push(`공개 장소 ${publishedPlaceIds.length}곳 / 공개 코스 ${publishedCourseIds.size}개`);
  if (petUnknown.length > 0) {
    findings.push({ severity: 'watch', text: `반려동물 정책이 확인되지 않은 공개 장소 ${petUnknown.length}곳` });
  }
  if (exteriorStops.length > 0) {
    metrics.push(`외부 야경 관람으로 안내하는 경유지 ${exteriorStops.length}건`);
  }

  report(today, findings, metrics);
}

function report(today: string, findings: Finding[], metrics: string[]) {
  const actions = findings.filter((item) => item.severity === 'action');
  const watches = findings.filter((item) => item.severity === 'watch');
  const infos = findings.filter((item) => item.severity === 'info');

  const lines: string[] = [];
  lines.push(`**${today} 달빛수원 운영 브리핑**`);
  lines.push('');
  if (actions.length === 0 && watches.length === 0) {
    lines.push('조치가 필요한 항목이 없습니다.');
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
  if (infos.length > 0) {
    for (const item of infos) lines.push(`- ${item.text}`);
    lines.push('');
  }
  lines.push(`지표: ${metrics.join(' · ')}`);

  const body = lines.join('\n');
  process.stdout.write(`${body}\n`);

  // Workflow가 Discord 본문과 상태로 그대로 사용할 수 있게 출력에 남긴다.
  const status = actions.length > 0 ? 'action_required' : watches.length > 0 ? 'review' : 'healthy';
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const delimiter = `BRIEFING_${Date.now()}`;
    appendFileSync(
      outputPath,
      `status=${status}\naction_count=${actions.length}\nwatch_count=${watches.length}\n` +
        `body<<${delimiter}\n${body}\n${delimiter}\n`,
    );
  }

  const bodyPath = process.env.BRIEFING_OUTPUT_PATH;
  if (bodyPath) writeFileSync(bodyPath, body, 'utf8');
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
