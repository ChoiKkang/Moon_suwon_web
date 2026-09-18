import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

// Discord에서 실행하는 운영 액션.
//
// 웹 관리자 화면의 Server Action과 같은 데이터 경계를 따른다. 승인은 공개를
// 의미하지 않고, 공개 전환은 문구가 준비된 장소에만 허용한다. 모든 변경은
// audit.admin_events에 관리자 계정과 함께 기록한다.
//
// Discord 사용자 ID는 그 자체로 권한이 아니다. 요청은 운영 서버(DISCORD_GUILD_ID)
// 확인을 통과해야 하고, 실제 기록 주체는 DISCORD_ADMIN_ACTOR_ID로 지정한 ADMIN
// 프로필이다. 사용자 ID는 감사 로그 메타데이터로만 남는다.

export type ActionResult = { ok: boolean; message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

async function recordAudit(
  service: SupabaseClient,
  actorId: string,
  entityType: 'place' | 'course',
  entityId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const { error } = await service.rpc('admin_record_audit', {
    p_actor_id: actorId,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_action: action,
    p_metadata: metadata,
  });
  if (error) throw new Error(`감사 로그를 기록하지 못했습니다. ${error.message}`);
}

export async function reviewCandidate(
  service: SupabaseClient,
  actorId: string,
  placeId: string,
  decision: 'approve' | 'reject' | 'hold',
  discordUserId: string,
): Promise<ActionResult> {
  if (!isUuid(placeId)) return { ok: false, message: '장소 식별자가 올바르지 않습니다.' };

  const { data: source, error: sourceError } = await service
    .schema('core')
    .from('place_sources')
    .select('place_id, ingestion_status')
    .eq('place_id', placeId)
    .maybeSingle();
  if (sourceError || !source) return { ok: false, message: '검수 대상 원본을 찾을 수 없습니다.' };

  const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'candidate';
  const { error } = await service
    .schema('core')
    .from('place_sources')
    .update({ ingestion_status: status, last_seen_at: new Date().toISOString() })
    .eq('place_id', placeId);
  if (error) return { ok: false, message: '검수 상태를 저장하지 못했습니다.' };

  await recordAudit(service, actorId, 'place', placeId, `candidate_${decision}`, {
    from: source.ingestion_status,
    to: status,
    source: 'discord',
    discord_user_id: discordUserId,
  });

  const label = decision === 'approve' ? '승인했습니다. 공개는 별도 검수입니다.' : decision === 'reject' ? '제외했습니다. 원본은 삭제하지 않았습니다.' : '보류했습니다.';
  return { ok: true, message: label };
}

export async function publishPlace(
  service: SupabaseClient,
  actorId: string,
  placeId: string,
  discordUserId: string,
): Promise<ActionResult> {
  if (!isUuid(placeId)) return { ok: false, message: '장소 식별자가 올바르지 않습니다.' };

  const [sourceResult, copyResult, stateResult] = await Promise.all([
    service.schema('core').from('place_sources').select('place_id, ingestion_status').eq('place_id', placeId).maybeSingle(),
    service.schema('editorial').from('place_copy').select('place_id, short_description, night_highlight').eq('place_id', placeId).maybeSingle(),
    service.schema('editorial').from('place_publish_state').select('place_id, is_published').eq('place_id', placeId).maybeSingle(),
  ]);

  if (sourceResult.data && sourceResult.data.ingestion_status !== 'approved') {
    return { ok: false, message: '승인되지 않은 장소는 공개할 수 없습니다. 먼저 검수에서 승인하세요.' };
  }
  const copy = copyResult.data;
  if (!copy?.short_description || !copy?.night_highlight) {
    return { ok: false, message: '설명과 야간 포인트가 모두 있어야 공개할 수 있습니다.' };
  }
  if (stateResult.data?.is_published) {
    return { ok: false, message: '이미 공개된 장소입니다.' };
  }

  const payload = { place_id: placeId, is_published: true, published_at: new Date().toISOString() };
  const { error } = stateResult.data
    ? await service.schema('editorial').from('place_publish_state').update(payload).eq('place_id', placeId)
    : await service.schema('editorial').from('place_publish_state').insert(payload);
  if (error) return { ok: false, message: '공개 상태를 저장하지 못했습니다.' };

  await recordAudit(service, actorId, 'place', placeId, 'publish_enable', {
    source: 'discord',
    discord_user_id: discordUserId,
  });
  return { ok: true, message: '공개했습니다.' };
}

export async function unpublishPlace(
  service: SupabaseClient,
  actorId: string,
  placeId: string,
  discordUserId: string,
): Promise<ActionResult> {
  if (!isUuid(placeId)) return { ok: false, message: '장소 식별자가 올바르지 않습니다.' };

  const { data: state } = await service
    .schema('editorial')
    .from('place_publish_state')
    .select('place_id, is_published')
    .eq('place_id', placeId)
    .maybeSingle();
  if (!state?.is_published) return { ok: false, message: '이미 비공개 상태입니다.' };

  const { error } = await service
    .schema('editorial')
    .from('place_publish_state')
    .update({ is_published: false })
    .eq('place_id', placeId);
  if (error) return { ok: false, message: '공개 상태를 저장하지 못했습니다.' };

  await recordAudit(service, actorId, 'place', placeId, 'publish_disable', {
    source: 'discord',
    discord_user_id: discordUserId,
  });
  return { ok: true, message: '비공개로 전환했습니다.' };
}

// 코스는 도보 동선과 야간 조명을 사람이 현장 기준으로 확인해야 하므로 Discord에서
// 곧바로 공개하지 않는다. 보류(다음 검수까지 미룸)만 허용하고, 공개는 관리자
// 콘솔에서 코스 상세를 보며 결정하게 남긴다.
export async function holdCourseDraft(
  service: SupabaseClient,
  actorId: string,
  courseId: string,
  discordUserId: string,
): Promise<ActionResult> {
  if (!isUuid(courseId)) return { ok: false, message: '코스 식별자가 올바르지 않습니다.' };

  const { data: state } = await service
    .schema('editorial')
    .from('course_publish_state')
    .select('course_id, is_published, ops_memo')
    .eq('course_id', courseId)
    .maybeSingle();
  if (!state) return { ok: false, message: '코스 게시 상태를 찾을 수 없습니다.' };
  if (state.is_published) return { ok: false, message: '이미 공개된 코스입니다. 비공개 전환은 관리자 콘솔에서 진행하세요.' };

  const memo = `[${new Date().toISOString().slice(0, 10)}] Discord에서 보류 처리`;
  const { error } = await service
    .schema('editorial')
    .from('course_publish_state')
    .update({ ops_memo: memo })
    .eq('course_id', courseId);
  if (error) return { ok: false, message: '보류 메모를 저장하지 못했습니다.' };

  await recordAudit(service, actorId, 'course', courseId, 'draft_hold', {
    source: 'discord',
    discord_user_id: discordUserId,
  });
  return { ok: true, message: '보류로 기록했습니다. 공개는 관리자 콘솔에서 진행하세요.' };
}
