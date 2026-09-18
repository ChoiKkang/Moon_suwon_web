import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// Discord 슬래시 명령을 길드에 등록한다.
//
// 봇 사용자는 필요하지 않다. 슬래시 명령은 Interactions Endpoint URL로 받는
// HTTP 방식이므로 Gateway 연결이 없어도 되고, 등록에는 OAuth2 client credentials
// 토큰(applications.commands.update 스코프)을 쓸 수 있다. 봇 토큰이 이미 있으면
// 그대로 써도 된다.
//
// 길드 전용으로 등록하면 즉시 반영되고 다른 서버에 노출되지 않는다.
//
// 필요한 값 (택 1):
//   A. DISCORD_CLIENT_SECRET  OAuth2 Client Secret (봇 없이 등록)
//   B. DISCORD_BOT_TOKEN      봇 토큰 (봇을 이미 만든 경우)
// 공통:
//   DISCORD_APPLICATION_ID   애플리케이션 ID (비밀값 아님)
//   DISCORD_GUILD_ID         명령을 등록할 서버 ID

const ID_OPTION = {
  type: 3, // STRING
  name: 'id',
  description: '대상 식별자 (브리핑 목록에 표시된 값)',
  required: true,
} as const;

const COMMAND = {
  name: '달빛',
  description: '달빛수원 운영 브리핑과 승인 처리',
  options: [
    { type: 1, name: '브리핑', description: '오늘 기준 운영 상태를 확인합니다' },
    { type: 1, name: '검수', description: '검수 대기 후보 목록을 봅니다' },
    { type: 1, name: '공개대기', description: '문구가 준비되어 공개만 남은 장소를 봅니다' },
    { type: 1, name: '코스', description: '검수 대기 코스 초안을 봅니다' },
    { type: 1, name: '승인', description: '후보를 승인합니다 (공개는 별도)', options: [ID_OPTION] },
    { type: 1, name: '제외', description: '후보를 제외합니다', options: [ID_OPTION] },
    { type: 1, name: '보류', description: '후보를 보류합니다', options: [ID_OPTION] },
    { type: 1, name: '공개', description: '승인·문구가 준비된 장소를 공개합니다', options: [ID_OPTION] },
    { type: 1, name: '비공개', description: '공개된 장소를 비공개로 전환합니다', options: [ID_OPTION] },
    { type: 1, name: '코스보류', description: '코스 초안을 보류로 기록합니다', options: [ID_OPTION] },
  ],
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}이 필요합니다.`);
  return value;
}

/**
 * Exchange the application's client credentials for a short-lived token that can
 * update commands. This avoids creating a bot user for an app that only needs
 * HTTP interactions.
 */
async function fetchClientCredentialsToken(applicationId: string, clientSecret: string): Promise<string> {
  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${applicationId}:${clientSecret}`).toString('base64')}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'applications.commands.update',
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // 응답 본문에 자격증명이 반영될 수 있으므로 상태 코드만 알린다.
    throw new Error(`Discord 토큰 발급 실패 (HTTP ${response.status}). Application ID와 Client Secret을 확인해 주세요.`);
  }

  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error('Discord 토큰 응답에 access_token이 없습니다.');
  return payload.access_token;
}

async function main() {
  const applicationId = required('DISCORD_APPLICATION_ID');
  const guildId = required('DISCORD_GUILD_ID');

  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();

  let authorization: string;
  let mode: string;
  if (clientSecret) {
    authorization = `Bearer ${await fetchClientCredentialsToken(applicationId, clientSecret)}`;
    mode = 'client credentials (봇 없음)';
  } else if (botToken) {
    authorization = `Bot ${botToken}`;
    mode = '봇 토큰';
  } else {
    throw new Error('DISCORD_CLIENT_SECRET 또는 DISCORD_BOT_TOKEN 중 하나가 필요합니다.');
  }

  const response = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: 'PUT',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify([COMMAND]),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Discord 명령 등록 실패 (HTTP ${response.status}): ${detail.slice(0, 300)}`);
  }

  const registered = (await response.json()) as Array<{ name: string }>;
  process.stdout.write(`등록 완료 (${mode}): ${registered.map((item) => `/${item.name}`).join(', ')}\n`);
  process.stdout.write(`서브명령 ${COMMAND.options.length}개\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
