'use server';

import { revalidatePath } from 'next/cache';
import { getAdminClient, requireAdmin } from '@/lib/admin/server';
import type {
  AdminActionResult,
  CourseInput,
  EventInput,
  PlaceCopyInput,
  PlacePublishInput,
} from '@/lib/admin/types';

const MAX = {
  short: 180,
  medium: 500,
  long: 5000,
};

function fail(error: string, field?: string): AdminActionResult {
  return { success: false, error, ...(field ? { field } : {}) };
}

function readText(value: unknown, field: string, maxLength: number, required = false): string | null {
  if (value === null || value === undefined) {
    if (required) throw new Error(`${field}은(는) 필수입니다.`);
    return null;
  }

  if (typeof value !== 'string') throw new Error(`${field} 형식이 올바르지 않습니다.`);
  const text = value.trim();
  if (required && !text) throw new Error(`${field}은(는) 필수입니다.`);
  if (text.length > maxLength) throw new Error(`${field}은(는) ${maxLength}자 이내로 입력해 주세요.`);
  return text || null;
}

function readNumber(value: unknown, field: string, min: number, max: number, integer = false): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < min || numberValue > max || (integer && !Number.isInteger(numberValue))) {
    throw new Error(`${field} 값이 올바르지 않습니다.`);
  }
  return numberValue;
}

function readNullableNumber(value: unknown, field: string, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  return readNumber(value, field, min, max);
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toActionError(error: unknown, fallback: string): AdminActionResult {
  if (error instanceof Error && error.message) return fail(error.message);
  return fail(fallback);
}

async function getPlaceSlug(placeId: string): Promise<string> {
  const adminClient = getAdminClient();
  const { data, error } = await adminClient.schema('core').from('places').select('slug').eq('id', placeId).maybeSingle();
  if (error || !data?.slug) throw new Error('장소를 찾을 수 없습니다.');
  return data.slug as string;
}

function revalidatePlace(slug: string) {
  revalidatePath('/');
  revalidatePath('/courses');
  revalidatePath('/admin');
  revalidatePath('/admin/places');
  revalidatePath(`/places/${slug}`);
}

export async function updatePlacePublishStateAction(input: PlacePublishInput): Promise<AdminActionResult> {
  try {
    const { user, adminClient } = await requireAdmin();
    if (!isUuid(input?.placeId)) throw new Error('장소 식별자가 올바르지 않습니다.');
    const displayPriority = readNumber(input.displayPriority, '노출 우선순위', 0, 9999, true);
    const nightSuitabilityScore = readNumber(input.nightSuitabilityScore, '야간 적합도', 0, 100);
    const recommendationBoost = readNumber(input.recommendationBoost, '추천 가중치', -100, 100);
    const recommendedFrom = input.recommendedFrom ? readText(input.recommendedFrom, '추천 시작 시간', 20) : null;
    const recommendedUntil = input.recommendedUntil ? readText(input.recommendedUntil, '추천 종료 시간', 20) : null;
    const opsMemo = readText(input.opsMemo, '운영 메모', MAX.medium);
    const slug = await getPlaceSlug(input.placeId);

    const { error } = await adminClient.schema('editorial').from('place_publish_state').upsert(
      {
        place_id: input.placeId,
        is_published: Boolean(input.isPublished),
        display_priority: displayPriority,
        is_now_good_enabled: Boolean(input.isNowGoodEnabled),
        night_suitability_score: nightSuitabilityScore,
        recommended_from: recommendedFrom,
        recommended_until: recommendedUntil,
        recommendation_boost: recommendationBoost,
        ops_memo: opsMemo,
        published_at: input.isPublished ? new Date().toISOString() : null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'place_id' },
    );

    if (error) return fail('장소 공개 상태를 저장하지 못했습니다.');
    revalidatePlace(slug);
    return { success: true, message: input.isPublished ? '장소를 공개했습니다.' : '장소를 비공개로 전환했습니다.' };
  } catch (error) {
    return toActionError(error, '장소 공개 상태 저장 중 오류가 발생했습니다.');
  }
}

export async function updatePlaceCopyAction(input: PlaceCopyInput): Promise<AdminActionResult> {
  try {
    const { user, adminClient } = await requireAdmin();
    if (!isUuid(input?.placeId)) throw new Error('장소 식별자가 올바르지 않습니다.');
    const slug = await getPlaceSlug(input.placeId);
    const payload = {
      place_id: input.placeId,
      display_name: readText(input.displayName, '표시 이름', MAX.short),
      short_description: readText(input.shortDescription, '한 줄 설명', MAX.medium),
      night_highlight: readText(input.nightHighlight, '야간 포인트', MAX.medium),
      photo_tip: readText(input.photoTip, '포토 팁', MAX.medium),
      mission_title: readText(input.missionTitle, '미션 제목', MAX.short),
      mission_body: readText(input.missionBody, '미션 본문', MAX.long),
      mission_prompt: readText(input.missionPrompt, '미션 질문', MAX.medium),
      couple_question: readText(input.coupleQuestion, '커플 질문', MAX.medium),
      short_story: readText(input.shortStory, '짧은 이야기', MAX.long),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    };

    const { error } = await adminClient.schema('editorial').from('place_copy').upsert(payload, { onConflict: 'place_id' });
    if (error) return fail('장소 운영 문구를 저장하지 못했습니다.');
    revalidatePlace(slug);
    return { success: true, message: '장소 운영 문구를 저장했습니다.' };
  } catch (error) {
    return toActionError(error, '장소 운영 문구 저장 중 오류가 발생했습니다.');
  }
}

export async function saveCourseAction(input: CourseInput): Promise<AdminActionResult & { courseId?: string }> {
  try {
    const { user, adminClient } = await requireAdmin();
    const slug = readText(input?.slug, 'slug', 120, true)!.toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('slug은 영문 소문자, 숫자, 하이픈만 사용할 수 있습니다.');
    const themeTags = Array.isArray(input.themeTags)
      ? input.themeTags.map((tag) => readText(tag, '태그', 30)).filter((tag): tag is string => Boolean(tag)).slice(0, 8)
      : [];
    const estimatedDurationMin = readNumber(input.estimatedDurationMin, '예상 시간', 1, 1440, true);
    const walkingDistanceKm = readNullableNumber(input.walkingDistanceKm, '도보 거리', 0, 100);
    const recommendedStartTime = readText(input.recommendedStartTime, '추천 시작 시간', 30);
    const opsMemo = readText(input.opsMemo, '운영 메모', MAX.medium);
    const heroTitle = readText(input.heroTitle, '코스 제목', MAX.short, true)!;
    const subtitle = readText(input.subtitle, '부제', MAX.medium);
    const routeSummary = readText(input.routeSummary, '동선 요약', MAX.long);
    const ogTitle = readText(input.ogTitle, 'OG 제목', MAX.short);
    const ogDescription = readText(input.ogDescription, 'OG 설명', MAX.medium);
    const ogImageUrl = readText(input.ogImageUrl, 'OG 이미지 URL', 1000);
    const placeIds = Array.isArray(input.placeIds) ? input.placeIds.filter(isUuid) : [];
    if (new Set(placeIds).size !== placeIds.length) throw new Error('코스에 같은 장소를 중복으로 추가할 수 없습니다.');
    if (placeIds.length === 0) throw new Error('코스에는 한 곳 이상의 장소가 필요합니다.');
    if (input.isPublished && !heroTitle) throw new Error('공개 코스에는 제목이 필요합니다.');

    let courseId = input.id;
    if (courseId !== undefined && !isUuid(courseId)) throw new Error('코스 식별자가 올바르지 않습니다.');

    const coursePayload = {
      ...(courseId ? { id: courseId } : {}),
      slug,
      theme_tags: themeTags,
      estimated_duration_min: estimatedDurationMin,
      walking_distance_km: walkingDistanceKm,
      recommended_start_time: recommendedStartTime,
      pet_ready_flag: Boolean(input.petReadyFlag),
      updated_at: new Date().toISOString(),
    };
    const courseResult = await adminClient.schema('core').from('courses').upsert(coursePayload).select('id').single();
    if (courseResult.error || !courseResult.data?.id) return fail('코스 기본 정보를 저장하지 못했습니다.');
    courseId = courseResult.data.id as string;

    const [copyResult, stateResult] = await Promise.all([
      adminClient.schema('editorial').from('course_copy').upsert({
        course_id: courseId,
        hero_title: heroTitle,
        subtitle,
        route_summary: routeSummary,
        og_title: ogTitle,
        og_description: ogDescription,
        og_image_url: ogImageUrl,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'course_id' }),
      adminClient.schema('editorial').from('course_publish_state').upsert({
        course_id: courseId,
        is_published: Boolean(input.id ? input.isPublished : false),
        display_priority: readNumber(input.displayPriority, '노출 우선순위', 0, 9999, true),
        ops_memo: opsMemo,
        published_at: input.id && input.isPublished ? new Date().toISOString() : null,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'course_id' }),
    ]);
    if (copyResult.error || stateResult.error) return fail('코스 운영 문구 또는 공개 상태를 저장하지 못했습니다.');

    const deleteLinksResult = await adminClient.schema('core').from('course_places').delete().eq('course_id', courseId);
    if (deleteLinksResult.error) return fail('코스의 기존 장소 연결을 정리하지 못했습니다.');
    const insertLinksResult = await adminClient.schema('core').from('course_places').insert(
      placeIds.map((placeId, orderIndex) => ({ course_id: courseId, place_id: placeId, order_index: orderIndex })),
    );
    if (insertLinksResult.error) return fail('코스 장소 순서를 저장하지 못했습니다.');

    revalidatePath('/');
    revalidatePath('/courses');
    revalidatePath('/admin');
    revalidatePath('/admin/courses');
    return { success: true, message: input.id ? '코스를 수정했습니다.' : '새 코스를 저장했습니다.', courseId };
  } catch (error) {
    return toActionError(error, '코스 저장 중 오류가 발생했습니다.');
  }
}

export async function saveEventAction(input: EventInput): Promise<AdminActionResult & { eventId?: string }> {
  try {
    const { adminClient } = await requireAdmin();
    const eventContentId = readText(input?.eventContentId, '행사 식별자', 160, true)!;
    const eventName = readText(input.eventName, '행사명', MAX.short, true)!;
    const startDate = readText(input.startDate, '시작일', 10, true)!;
    const endDate = readText(input.endDate, '종료일', 10, true)!;
    if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) throw new Error('행사 기간이 올바르지 않습니다.');
    const payload = {
      ...(input.id && isUuid(input.id) ? { id: input.id } : {}),
      event_content_id: eventContentId,
      event_name: eventName,
      start_date: startDate,
      end_date: endDate,
      venue_address: readText(input.venueAddress, '행사 주소', MAX.medium),
      lat: readNullableNumber(input.lat, '위도', -90, 90),
      lng: readNullableNumber(input.lng, '경도', -180, 180),
      hero_image_url: readText(input.heroImageUrl, '대표 이미지 URL', 1000),
      contact_phone: readText(input.contactPhone, '연락처', 80),
      event_place: readText(input.eventPlace, '행사 장소', MAX.short),
      play_time: readText(input.playTime, '운영 시간', MAX.medium),
      usage_fee: readText(input.usageFee, '이용 요금', MAX.medium),
      program_raw: readText(input.programRaw, '프로그램', MAX.long),
      updated_at: new Date().toISOString(),
    };
    const result = await adminClient.schema('core').from('events').upsert(payload, { onConflict: 'event_content_id' }).select('id').single();
    if (result.error || !result.data?.id) return fail('행사 정보를 저장하지 못했습니다.');
    revalidatePath('/admin');
    revalidatePath('/admin/events');
    return { success: true, message: input.id ? '행사를 수정했습니다.' : '행사를 저장했습니다.', eventId: result.data.id as string };
  } catch (error) {
    return toActionError(error, '행사 저장 중 오류가 발생했습니다.');
  }
}

export async function deleteEventAction(eventId: string): Promise<AdminActionResult> {
  try {
    const { adminClient } = await requireAdmin();
    if (!isUuid(eventId)) throw new Error('행사 식별자가 올바르지 않습니다.');
    const { error } = await adminClient.schema('core').from('events').delete().eq('id', eventId);
    if (error) return fail('행사를 삭제하지 못했습니다.');
    revalidatePath('/admin');
    revalidatePath('/admin/events');
    return { success: true, message: '행사를 삭제했습니다.' };
  } catch (error) {
    return toActionError(error, '행사 삭제 중 오류가 발생했습니다.');
  }
}
