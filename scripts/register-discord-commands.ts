import { loadEnvConfig } from '@next/env';

loadEnvConfig(process.cwd());

// Discord 슬래시 명령을 길드에 등록한다.
//
// 길드 전용으로 등록하면 즉시 반영되고 다른 서버에 노출되지 않는다. 운영 채널이
// 둘만 있는 서버이므로 전역 등록은 사용하지 않는다.
//
// 필요한 값:
//   DISCORD_APPLICATION_ID  애플리케이션 ID (비밀값 아님)
//   DISCORD_BOT_TOKEN       봇 토큰 (비밀값, 로그에 출력하지 않는다)
//   DISCORD_GUILD_ID        명령을 등록할 서버 ID

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

async function main() {
  const applicationId = required('DISCORD_APPLICATION_ID');
  const botToken = required('DISCORD_BOT_TOKEN');
  const guildId = required('DISCORD_GUILD_ID');

  const response = await fetch(
    `https://discord.com/api/v10/applications/${applicationId}/guilds/${guildId}/commands`,
    {
      method: 'PUT',
      headers: {
        authorization: `Bot ${botToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify([COMMAND]),
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    // 토큰이 본문에 포함될 수 있는 응답은 그대로 출력하지 않는다.
    throw new Error(`Discord 명령 등록 실패 (HTTP ${response.status}): ${detail.slice(0, 300)}`);
  }

  const registered = (await response.json()) as Array<{ name: string }>;
  process.stdout.write(`등록 완료: ${registered.map((item) => `/${item.name}`).join(', ')}\n`);
  process.stdout.write(`서브명령 ${COMMAND.options.length}개\n`);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
