import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRequiredServerEnv } from '@/lib/env/server';
import {
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  verifyDiscordRequest,
} from '@/lib/discord/verify';
import { holdCourseDraft, publishPlace, reviewCandidate, unpublishPlace } from '@/lib/discord/actions';
import {
  buildBriefing,
  formatBriefing,
  listCourseDrafts,
  listPublishReady,
  listReviewQueue,
} from '@/lib/ops/briefing';

// Discord 슬래시 명령과 버튼을 처리한다.
//
// 보안 경계:
// 1. Ed25519 서명 검증에 실패하면 401로 거절한다.
// 2. DISCORD_OPERATOR_IDS에 등록된 Discord 사용자만 실행할 수 있다.
// 3. 실제 변경은 service-role로 수행하고 DISCORD_ADMIN_ACTOR_ID(ADMIN 프로필)로
//    감사 로그를 남긴다. Discord 사용자 ID는 메타데이터로만 기록한다.
// 4. 응답은 ephemeral로 보내 채널에 운영 데이터가 남지 않게 한다.

export const runtime = 'nodejs';

const MAX_BODY_LENGTH = 64_000;

type InteractionData = {
  name?: string;
  custom_id?: string;
  options?: Array<{ name: string; value?: unknown; options?: Array<{ name: string; value?: unknown }> }>;
};

type Interaction = {
  type?: number;
  data?: InteractionData;
  member?: { user?: { id?: string; username?: string } };
  user?: { id?: string; username?: string };
};

function ephemeral(content: string) {
  return NextResponse.json({
    type: InteractionResponseType.ChannelMessageWithSource,
    data: { content: content.slice(0, 1900), flags: MessageFlags.Ephemeral, allowed_mentions: { parse: [] } },
  });
}

function serviceClient() {
  return createClient(
    getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
    getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );
}

function operatorIds(): Set<string> {
  const raw = process.env.DISCORD_OPERATOR_IDS ?? '';
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

export async function POST(request: Request) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return new NextResponse(null, { status: 503 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (rawBody.length > MAX_BODY_LENGTH) {
    return new NextResponse(null, { status: 413 });
  }

  const verified = await verifyDiscordRequest({
    publicKey,
    signature: request.headers.get('x-signature-ed25519'),
    timestamp: request.headers.get('x-signature-timestamp'),
    rawBody,
  });
  if (!verified) {
    return new NextResponse('invalid request signature', { status: 401 });
  }

  let interaction: Interaction;
  try {
    interaction = JSON.parse(rawBody) as Interaction;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (interaction.type === InteractionType.Ping) {
    return NextResponse.json({ type: InteractionResponseType.Pong });
  }

  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id ?? '';
  const allowed = operatorIds();
  if (allowed.size === 0) {
    return ephemeral('운영자 목록이 설정되지 않았습니다. DISCORD_OPERATOR_IDS를 확인해 주세요.');
  }
  if (!discordUserId || !allowed.has(discordUserId)) {
    return ephemeral('이 명령을 사용할 권한이 없습니다.');
  }

  const actorId = process.env.DISCORD_ADMIN_ACTOR_ID?.trim();
  if (!actorId) {
    return ephemeral('감사 로그 계정이 설정되지 않았습니다. DISCORD_ADMIN_ACTOR_ID를 확인해 주세요.');
  }

  try {
    if (interaction.type === InteractionType.ApplicationCommand) {
      return await handleCommand(interaction, discordUserId, actorId);
    }
    if (interaction.type === InteractionType.MessageComponent) {
      return await handleComponent(interaction, discordUserId, actorId);
    }
    return ephemeral('지원하지 않는 상호작용입니다.');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return ephemeral(`처리 중 오류가 발생했습니다. ${message.slice(0, 300)}`);
  }
}

async function handleCommand(interaction: Interaction, discordUserId: string, actorId: string) {
  const service = serviceClient();
  const sub = interaction.data?.options?.[0];
  const subName = sub?.name ?? '';

  if (subName === '브리핑') {
    const briefing = await buildBriefing(service);
    return ephemeral(formatBriefing(briefing));
  }

  if (subName === '검수') {
    const queue = await listReviewQueue(service);
    if (queue.length === 0) return ephemeral('검수 대기 후보가 없습니다.');
    const lines = queue.slice(0, 10).map((item) => {
      const flags = [item.hasHeroImage ? '이미지 O' : '이미지 X', item.hasCopy ? '문구 O' : '문구 X'].join(' · ');
      return `- ${item.name} (${flags})\n  승인: \`/달빛 승인 ${item.placeId}\` · 제외: \`/달빛 제외 ${item.placeId}\``;
    });
    return ephemeral(`**검수 대기 ${queue.length}건**\n${lines.join('\n')}`);
  }

  if (subName === '공개대기') {
    const ready = await listPublishReady(service);
    if (ready.length === 0) return ephemeral('공개 준비가 끝난 장소가 없습니다.');
    const lines = ready.slice(0, 10).map((item) => `- ${item.name}\n  공개: \`/달빛 공개 ${item.placeId}\``);
    return ephemeral(`**공개만 남은 장소 ${ready.length}곳**\n${lines.join('\n')}`);
  }

  if (subName === '코스') {
    const drafts = await listCourseDrafts(service);
    if (drafts.length === 0) return ephemeral('검수 대기 코스 초안이 없습니다.');
    const lines = drafts.slice(0, 6).map((item) => {
      const distance = item.walkingDistanceKm === null ? '거리 미상' : `${item.walkingDistanceKm.toFixed(2)}km${item.straightLineEstimate ? ' (직선거리 추정)' : ''}`;
      return `- ${item.title} · ${distance}\n  ${item.stopNames.join(' → ')}\n  보류: \`/달빛 코스보류 ${item.courseId}\``;
    });
    return ephemeral(`**검수 대기 코스 초안 ${drafts.length}건**\n도보 동선과 야간 조명은 관리자 콘솔에서 확인한 뒤 공개하세요.\n${lines.join('\n')}`);
  }

  const idOption = sub?.options?.find((option) => option.name === 'id');
  const targetId = typeof idOption?.value === 'string' ? idOption.value.trim() : '';

  if (subName === '승인' || subName === '제외' || subName === '보류') {
    const decision = subName === '승인' ? 'approve' : subName === '제외' ? 'reject' : 'hold';
    const result = await reviewCandidate(service, actorId, targetId, decision, discordUserId);
    return ephemeral(`${result.ok ? '완료' : '실패'}: ${result.message} (${shortId(targetId)})`);
  }

  if (subName === '공개') {
    const result = await publishPlace(service, actorId, targetId, discordUserId);
    return ephemeral(`${result.ok ? '완료' : '실패'}: ${result.message} (${shortId(targetId)})`);
  }

  if (subName === '비공개') {
    const result = await unpublishPlace(service, actorId, targetId, discordUserId);
    return ephemeral(`${result.ok ? '완료' : '실패'}: ${result.message} (${shortId(targetId)})`);
  }

  if (subName === '코스보류') {
    const result = await holdCourseDraft(service, actorId, targetId, discordUserId);
    return ephemeral(`${result.ok ? '완료' : '실패'}: ${result.message} (${shortId(targetId)})`);
  }

  return ephemeral('사용법: /달빛 브리핑 · 검수 · 공개대기 · 코스 · 승인 · 제외 · 보류 · 공개 · 비공개 · 코스보류');
}

async function handleComponent(interaction: Interaction, discordUserId: string, actorId: string) {
  const customId = interaction.data?.custom_id ?? '';
  const [action, targetId] = customId.split(':');
  if (!action || !targetId) return ephemeral('버튼 정보를 해석할 수 없습니다.');

  const service = serviceClient();
  if (action === 'approve' || action === 'reject' || action === 'hold') {
    const result = await reviewCandidate(service, actorId, targetId, action, discordUserId);
    return ephemeral(`${result.ok ? '완료' : '실패'}: ${result.message}`);
  }
  if (action === 'publish') {
    const result = await publishPlace(service, actorId, targetId, discordUserId);
    return ephemeral(`${result.ok ? '완료' : '실패'}: ${result.message}`);
  }
  return ephemeral('지원하지 않는 버튼입니다.');
}
