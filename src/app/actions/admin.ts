'use server';

import { revalidatePath } from 'next/cache';
import { getAdminClient, requireAdmin } from '@/lib/admin/server';
import { planCourseDrafts, type CoursePlannerPlace } from '@/lib/courses/draft-planner';
import { isUuid, validatePetPolicy, validateReviewDecision, validateReviewNote } from '@/lib/admin/review';
import type {
  AdminActionResult,
  CourseInput,
  EventInput,
  PetPolicyOverrideInput,
  PlaceCopyInput,
  PlacePublishInput,
  ReviewPlaceCandidateInput,
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

async function recordAdminAudit(
  adminClient: ReturnType<typeof getAdminClient>,
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await adminClient.rpc('admin_record_audit', {
    p_actor_id: actorId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_action: action,
    p_metadata: metadata,
  });
  if (error) throw new Error(`감사 로그를 기록하지 못했습니다. ${error.message}`);
}

export async function reviewPlaceCandidateAction(input: ReviewPlaceCandidateInput): Promise<AdminActionResult> {
  try {
    const { user, adminClient } = await requireAdmin();
    if (!isUuid(input?.placeId)) throw new Error('장소 식별자가 올바르지 않습니다.');
    if (!validateReviewDecision(input?.decision)) throw new Error('검수 결정이 올바르지 않습니다.');
    if (!validateReviewNote(input?.note)) throw new Error('검수 메모는 240자 이내로 입력해 주세요.');

    const status = input.decision === 'approve' ? 'approved' : input.decision === 'reject' ? 'rejected' : 'candidate';
    const { data: source, error: sourceError } = await adminClient
      .schema('core')
      .from('place_sources')
      .select('place_id, ingestion_status')
      .eq('place_id', input.placeId)
      .maybeSingle();
    if (sourceError || !source) throw new Error('검수 대상 원본을 찾을 수 없습니다.');

    const { error } = await adminClient
      .schema('core')
      .from('place_sources')
      .update({ ingestion_status: status, last_seen_at: new Date().toISOString() })
      .eq('place_id', input.placeId);
    if (error) return fail('검수 상태를 저장하지 못했습니다.');

    await recordAdminAudit(adminClient, user.id, 'place', input.placeId, `candidate_${input.decision}`, {
      from: source.ingestion_status,
      to: status,
      note: input.note?.trim() || null,
    });
    const slug = await getPlaceSlug(input.placeId);
    revalidatePlace(slug);
    revalidatePath('/admin/operations');
    return { success: true, message: input.decision === 'approve' ? '후보를 승인했습니다. 공개 상태는 별도로 검수해 주세요.' : input.decision === 'reject' ? '후보를 제외했습니다. 원본은 삭제하지 않았습니다.' : '후보를 보류했습니다.' };
  } catch (error) {
    return toActionError(error, '후보 검수 중 오류가 발생했습니다.');
  }
}

export async function setPetPolicyOverrideAction(input: PetPolicyOverrideInput): Promise<AdminActionResult> {
  try {
    const { user, adminClient } = await requireAdmin();
    if (!isUuid(input?.placeId)) throw new Error('장소 식별자가 올바르지 않습니다.');
    if (!validatePetPolicy(input?.policy)) throw new Error('반려동물 정책 값이 올바르지 않습니다.');
    if (!validateReviewNote(input?.note)) throw new Error('정책 메모는 240자 이내로 입력해 주세요.');

    const existingResult = await adminClient
      .schema('core')
      .from('place_pet_policies')
      .select('pet_note_raw, source_updated_at, data_status, details_json')
      .eq('place_id', input.placeId)
      .maybeSingle();
    if (existingResult.error) return fail('기존 반려동물 정책을 읽지 못했습니다.');

    const now = new Date().toISOString();
    const note = input.note?.trim() || null;
    const { error } = await adminClient.schema('core').from('place_pet_policies').upsert({
      place_id: input.placeId,
      pet_policy: input.policy,
      pet_note_raw: note ?? existingResult.data?.pet_note_raw ?? null,
      pet_note_short: note,
      is_manual_override: true,
      source_provider: 'MANUAL',
      source_updated_at: existingResult.data?.source_updated_at ?? now,
      data_status: existingResult.data?.data_status ?? 'fresh',
      last_checked_at: now,
      details_json: { ...(existingResult.data?.details_json && typeof existingResult.data.details_json === 'object' ? existingResult.data.details_json : {}), manual_override: true },
      updated_at: now,
    }, { onConflict: 'place_id' });
    if (error) return fail('반려동물 정책을 저장하지 못했습니다.');

    await recordAdminAudit(adminClient, user.id, 'place_pet_policy', input.placeId, 'pet_policy_override', { policy: input.policy, note });
    const slug = await getPlaceSlug(input.placeId);
    revalidatePlace(slug);
    return { success: true, message: '반려동물 정책을 수동 적용했습니다.' };
  } catch (error) {
    return toActionError(error, '반려동물 정책 적용 중 오류가 발생했습니다.');
  }
}

export async function resetPetPolicyOverrideAction(placeId: string): Promise<AdminActionResult> {
  try {
    const { user, adminClient } = await requireAdmin();
    if (!isUuid(placeId)) throw new Error('장소 식별자가 올바르지 않습니다.');
    const { error } = await adminClient
      .schema('core')
      .from('place_pet_policies')
      .update({ is_manual_override: false, updated_at: new Date().toISOString() })
      .eq('place_id', placeId);
    if (error) return fail('반려동물 수동 정책을 해제하지 못했습니다.');
    await recordAdminAudit(adminClient, user.id, 'place_pet_policy', placeId, 'pet_policy_override_reset');
    const slug = await getPlaceSlug(placeId);
    revalidatePlace(slug);
    return { success: true, message: '수동 정책을 해제했습니다. 다음 자동 수집부터 원본값이 반영됩니다.' };
  } catch (error) {
    return toActionError(error, '반려동물 정책 해제 중 오류가 발생했습니다.');
  }
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

    if (input.isPublished) {
      const [stateResult, placesResult] = await Promise.all([
        adminClient
          .schema('editorial')
          .from('place_publish_state')
          .select('place_id')
          .eq('is_published', true)
          .in('place_id', placeIds),
        adminClient
          .schema('core')
          .from('places')
          .select('id')
          .eq('is_active', true)
          .in('id', placeIds),
      ]);

      if (stateResult.error || placesResult.error) {
        throw new Error('코스에 연결한 장소의 공개 상태를 확인하지 못했습니다.');
      }

      const publishedIds = new Set((stateResult.data ?? []).map((row) => row.place_id as string));
      const activeIds = new Set((placesResult.data ?? []).map((row) => row.id as string));
      const allPlacesServable = placeIds.every((placeId) => publishedIds.has(placeId) && activeIds.has(placeId));
      if (!allPlacesServable) {
        throw new Error('공개 코스에는 공개·활성 상태인 장소만 연결할 수 있습니다.');
      }
    }

    let courseId = input.id;
    if (courseId !== undefined && !isUuid(courseId)) throw new Error('코스 식별자가 올바르지 않습니다.');

    if (input.isPublished && courseId) {
      const existingCourse = await adminClient.schema('core').from('courses').select('automation_source, automation_metadata').eq('id', courseId).maybeSingle();
      if (existingCourse.error) throw new Error('코스 자동 생성 provenance를 확인하지 못했습니다.');
      const metadata = existingCourse.data?.automation_metadata;
      const violations = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? (metadata as { constraint_violations?: unknown }).constraint_violations
        : null;
      const hardViolations = Array.isArray(violations) ? violations.filter((value) => ['missing_coordinates', 'unpublished_place', 'duplicate_place', 'route_too_long', 'pet_policy_unknown', 'stale_source'].includes(String(value))) : [];
      if (existingCourse.data?.automation_source && hardViolations.length > 0) {
        throw new Error('자동 생성 코스에 해결되지 않은 품질 경고가 있어 바로 공개할 수 없습니다. 장소와 근거를 확인해 주세요.');
      }
    }

    const courseResult = await adminClient.rpc('admin_upsert_course', {
      p_payload: {
        ...(courseId ? { id: courseId } : {}),
        slug,
        theme_tags: themeTags,
        estimated_duration_min: estimatedDurationMin,
        walking_distance_km: walkingDistanceKm,
        recommended_start_time: recommendedStartTime,
        pet_ready_flag: Boolean(input.petReadyFlag),
        is_published: Boolean(input.id ? input.isPublished : false),
        display_priority: readNumber(input.displayPriority, '노출 우선순위', 0, 9999, true),
        ops_memo: opsMemo,
        hero_title: heroTitle,
        subtitle,
        route_summary: routeSummary,
        og_title: ogTitle,
        og_description: ogDescription,
        og_image_url: ogImageUrl,
        place_ids: placeIds,
        updated_by: user.id,
      },
    });
    if (courseResult.error || !courseResult.data) return fail(`코스 저장에 실패했습니다. ${courseResult.error?.message ?? ''}`.trim());
    courseId = courseResult.data as string;

    revalidatePath('/');
    revalidatePath('/courses');
    revalidatePath('/admin');
    revalidatePath('/admin/courses');
    return { success: true, message: input.id ? '코스를 수정했습니다.' : '새 코스를 저장했습니다.', courseId };
  } catch (error) {
    return toActionError(error, '코스 저장 중 오류가 발생했습니다.');
  }
}

type DraftPlaceRow = {
  id: string;
  slug: string;
  official_name: string;
  lat: number | string;
  lng: number | string;
  category: string | null;
  is_active: boolean | null;
  source_modified_at: string | null;
};
type DraftSourceRow = { place_id: string; ingestion_status: string | null };
type DraftStateRow = {
  place_id: string;
  is_published: boolean | null;
  night_suitability_score: number | string | null;
  recommendation_boost: number | string | null;
};
type DraftCopyRow = { place_id: string; display_name: string | null };
type DraftPetRow = { place_id: string; pet_policy: string | null; data_status: string | null; last_checked_at: string | null };

function draftNumber(value: number | string | null | undefined): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function isPetReady(policy: string | null | undefined): boolean {
  return ['allowed', '가능', '동반 가능', '동반가능'].includes(String(policy ?? '').trim().toLowerCase());
}

function courseAutomationMetadata(plan: ReturnType<typeof planCourseDrafts>[number]): Record<string, unknown> {
  return {
    schema_version: 1,
    automation_source: plan.automationSource,
    automation_key: plan.automationKey,
    provider: 'deterministic',
    model: null,
    prompt_version: null,
    input_checksum: null,
    distance_kind: plan.distanceKind,
    evidence: plan.evidence,
    constraint_violations: plan.constraintViolations,
  };
}

export async function generateCourseDraftsAction(): Promise<AdminActionResult & { generatedCount?: number }> {
  try {
    const { adminClient } = await requireAdmin();
    const [placesResult, sourcesResult, statesResult, copiesResult, imagesResult, petsResult] = await Promise.all([
      adminClient.schema('core').from('places').select('id, slug, official_name, lat, lng, category, is_active, source_modified_at').eq('is_active', true),
      adminClient.schema('core').from('place_sources').select('place_id, ingestion_status'),
      adminClient.schema('editorial').from('place_publish_state').select('place_id, is_published, night_suitability_score, recommendation_boost'),
      adminClient.schema('editorial').from('place_copy').select('place_id, display_name'),
      adminClient.schema('core').from('place_images').select('place_id').eq('is_hero', true),
      adminClient.schema('core').from('place_pet_policies').select('place_id, pet_policy, data_status, last_checked_at'),
    ]);
    const sourceError = placesResult.error ?? sourcesResult.error ?? statesResult.error ?? copiesResult.error ?? imagesResult.error ?? petsResult.error;
    if (sourceError) return fail(`코스 초안 후보를 불러오지 못했습니다. ${sourceError.message}`);

    const placesById = new Map((placesResult.data as DraftPlaceRow[]).map((place) => [place.id, place]));
    const sourcesById = new Map((sourcesResult.data as DraftSourceRow[]).map((source) => [source.place_id, source]));
    const copiesById = new Map((copiesResult.data as DraftCopyRow[]).map((copy) => [copy.place_id, copy]));
    const petsById = new Map((petsResult.data as DraftPetRow[]).map((pet) => [pet.place_id, pet]));
    const heroIds = new Set((imagesResult.data ?? []).map((row) => row.place_id as string));
    const plannerPlaces: CoursePlannerPlace[] = (statesResult.data as DraftStateRow[]).flatMap((state) => {
      if (state.is_published !== true) return [];
      const place = placesById.get(state.place_id);
      if (!place) return [];
      const source = sourcesById.get(place.id);
      if (source?.ingestion_status === 'candidate' || source?.ingestion_status === 'rejected' || source?.ingestion_status === 'stale') return [];
      const pet = petsById.get(place.id);
      return [{
        id: place.id,
        slug: place.slug,
        displayName: copiesById.get(place.id)?.display_name?.trim() || place.official_name,
        lat: draftNumber(place.lat),
        lng: draftNumber(place.lng),
        category: place.category,
        nightSuitabilityScore: draftNumber(state.night_suitability_score),
        recommendationBoost: draftNumber(state.recommendation_boost),
        petReady: isPetReady(pet?.pet_policy) && pet?.data_status === 'fresh',
        petPolicy: pet?.pet_policy === 'allowed' || pet?.pet_policy === 'partial' || pet?.pet_policy === 'not_allowed' || pet?.pet_policy === 'unknown' ? pet.pet_policy : 'unknown',
        petDataStatus: pet?.data_status === 'fresh' || pet?.data_status === 'stale' || pet?.data_status === 'unavailable' || pet?.data_status === 'unknown' ? pet.data_status : 'unknown',
        sourceModifiedAt: place.source_modified_at,
        hasHeroImage: heroIds.has(place.id),
        hasContent: Boolean(copiesById.get(place.id)?.display_name?.trim()),
        isPublished: true,
      }];
    });

    const plans = planCourseDrafts(plannerPlaces);
    let generatedCount = 0;
    for (const plan of plans) {
      const { data, error } = await adminClient.rpc('admin_upsert_course', {
        p_payload: {
          slug: plan.slug,
          theme_tags: plan.themeTags,
          estimated_duration_min: plan.estimatedDurationMin,
          walking_distance_km: plan.walkingDistanceKm,
          recommended_start_time: plan.recommendedStartTime,
          pet_ready_flag: plan.petReadyFlag,
          is_published: false,
          display_priority: plan.displayPriority,
          ops_memo: plan.opsMemo,
          hero_title: plan.heroTitle,
          subtitle: plan.subtitle,
          route_summary: plan.routeSummary,
          og_title: plan.ogTitle,
          og_description: plan.ogDescription,
          og_image_url: null,
          place_ids: plan.placeIds,
          automation_source: plan.automationSource,
          automation_key: plan.automationKey,
        },
      });
      if (error || !data) return fail(`코스 초안 저장에 실패했습니다. ${error?.message ?? ''}`.trim());
      const metadataResult = await adminClient.schema('core').from('courses').update({ automation_metadata: courseAutomationMetadata(plan) }).eq('id', data as string);
      if (metadataResult.error) return fail(`코스 초안 provenance 저장에 실패했습니다. ${metadataResult.error.message}`);
      generatedCount += 1;
    }

    revalidatePath('/');
    revalidatePath('/courses');
    revalidatePath('/admin');
    revalidatePath('/admin/courses');
    return { success: true, message: generatedCount ? `${generatedCount}개 자동 코스 초안을 생성·갱신했습니다. 검수 후 공개해 주세요.` : '생성할 수 있는 공개 장소 조합이 없습니다.', generatedCount };
  } catch (error) {
    return toActionError(error, '코스 초안 생성 중 오류가 발생했습니다.');
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
