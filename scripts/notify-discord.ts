import { loadEnvConfig } from '@next/env';

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
  if (status === 'cancelled' || status === 'skipped') return 0xf1c40f;
  return 0xe74c3c;
}

function buildPayload() {
  const status = required('DISCORD_NOTIFICATION_STATUS') || 'unknown';
  const title = required('DISCORD_NOTIFICATION_TITLE') || 'Moon Suwon GitHub Actions';
  const details = required('DISCORD_NOTIFICATION_DETAILS') || '상세 실행 로그를 확인해 주세요.';
  const workflowUrl = required('DISCORD_NOTIFICATION_URL');
  const fields = [
    { name: '상태', value: status, inline: true },
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
      footer: { text: 'Moon Suwon automation' },
      timestamp: new Date().toISOString(),
    }],
  };
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
