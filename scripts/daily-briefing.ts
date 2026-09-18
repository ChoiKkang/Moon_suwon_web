import { loadEnvConfig } from '@next/env';
import { appendFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { buildBriefing, formatBriefing } from '../src/lib/ops/briefing';

loadEnvConfig(process.cwd());

// 운영자가 매일 관리자 화면을 뒤지지 않아도 되도록 오늘 기준 상태를 판정해
// Discord로 보고한다. 판정 로직은 src/lib/ops/briefing.ts에 있고 Discord 명령과
// 같은 결론을 공유한다.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
}

const service = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function main() {
  const briefing = await buildBriefing(service);
  const body = formatBriefing(briefing);
  process.stdout.write(`${body}\n`);

  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    const delimiter = `BRIEFING_${Date.now()}`;
    appendFileSync(
      outputPath,
      `status=${briefing.status}\naction_count=${briefing.actionCount}\nwatch_count=${briefing.watchCount}\n` +
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
