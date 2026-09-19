import { loadEnvConfig } from '@next/env';

import { buildDraftSummary, buildSyncSummary, statusLabel } from '../src/lib/ops/notification-copy';

loadEnvConfig(process.cwd());

function required(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function validateWebhook(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('DISCORD_WEBHOOK_URL is not a valid URL');
  }

  if (!['discord.com', 'discordapp.com'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('DISCORD_WEBHOOK_URL must point to Discord');
  }
  if (!/^\/api\/webhooks\/[^/]+\/[^/]+$/.test(parsed.pathname)) {
    throw new Error('DISCORD_WEBHOOK_URL has an unexpected path');
  }
  return parsed.toString();
}

function statusColor(status: string): number {
  if (status === 'success' || status === 'completed') return 0x2ecc71;
  // 브리핑 상태: healthy는 정상, review는 확인 권장, action_required는 조치 필요.
  if (status === 'healthy') return 0x2ecc71;
  if (status === 'cancelled' || status === 'skipped' || status === 'review') return 0xf1c40f;
  if (status === 'action_required') return 0xe67e22;
  return 0xe74c3c;
}

function buildPayload() {
  const status = required('DISCORD_NOTIFICATION_STATUS') || 'unknown';
  const title = required('DISCORD_NOTIFICATION_TITLE') || '달빛수원 자동화 알림';
  const details = resolveDetails();
  const workflowUrl = required('DISCORD_NOTIFICATION_URL');
  const fields = [
    { name: '상태', value: statusLabel(status), inline: true },
    { name: '저장소', value: `${required('GITHUB_REPOSITORY') || 'unknown'}\n${required('GITHUB_REF_NAME') || 'unknown'}`, inline: true },
  ];
  if (workflowUrl) fields.push({ name: '실행 로그', value: `[GitHub Actions 열기](${workflowUrl})`, inline: false });

  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title,
      description: details.slice(0, 3500),
      color: statusColor(status),
      fields,
      footer: { text: '달빛수원 자동화' },
      timestamp: new Date().toISOString(),
    }],
  };
}

/**
 * 알림 본문을 고른다.
 *
 * 운영 브리핑은 이미 한글 본문을 만들어 넘기므로 그대로 쓴다. 수집과 코스 초안
 * 워크플로는 기계값만 넘기던 것을 한글 요약으로 바꿨다. 둘 중 어느 쪽도 아니면
 * 넘어온 값을 그대로 보여준다.
 */
function resolveDetails(): string {
  const syncJob = required('DISCORD_SYNC_JOB');
  if (syncJob) {
    return buildSyncSummary({
      job: syncJob,
      status: required('DISCORD_SYNC_STATUS') || required('DISCORD_NOTIFICATION_STATUS') || 'unknown',
      itemsFetched: required('DISCORD_SYNC_FETCHED'),
      itemsUpserted: required('DISCORD_SYNC_UPSERTED'),
      errorCount: required('DISCORD_SYNC_ERRORS'),
      shouldRun: required('DISCORD_SYNC_SHOULD_RUN') || 'true',
    });
  }

  if (required('DISCORD_DRAFT_MODE')) {
    return buildDraftSummary({
      candidateCount: required('DISCORD_DRAFT_CANDIDATES'),
      writtenCount: required('DISCORD_DRAFT_WRITTEN'),
      mode: required('DISCORD_DRAFT_MODE'),
      status: required('DISCORD_NOTIFICATION_STATUS'),
    });
  }

  return required('DISCORD_NOTIFICATION_DETAILS') || '상세 실행 로그를 확인해 주세요.';
}

async function main() {
  const rawWebhook = required('DISCORD_WEBHOOK_URL');
  if (!rawWebhook) {
    process.stdout.write('DISCORD_WEBHOOK_URL is not configured; notification skipped.\n');
    return;
  }

  const webhookUrl = validateWebhook(rawWebhook);
  const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}wait=true`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildPayload()),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook returned HTTP ${response.status}`);
  }

  process.stdout.write('Discord notification delivered.\n');
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
