import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const targets = [
  ['core', 'places'],
  ['editorial', 'place_publish_state'],
  ['editorial', 'place_copy'],
  ['core', 'courses'],
  ['core', 'course_places'],
  ['editorial', 'course_copy'],
  ['editorial', 'course_publish_state'],
  ['core', 'events'],
  ['core', 'place_crowd_forecasts'],
  ['raw', 'sync_runs'],
  ['raw', 'sync_errors'],
  ['raw', 'course_generation_runs'],
  ['audit', 'admin_events'],
] as const;

async function main() {
  const results = await Promise.all(
    targets.map(async ([schema, table]) => {
      const { count, error } = await supabase.schema(schema).from(table).select('*', { count: 'exact', head: true });
      return { schema, table, count: count ?? 0, error: error?.message ?? null };
    }),
  );

  let hasError = false;
  for (const result of results) {
    if (result.error) {
      hasError = true;
      console.error(`${result.schema}.${result.table}: ERROR ${result.error}`);
    } else {
      console.log(`${result.schema}.${result.table}: ${result.count}`);
    }
  }

  if (hasError) process.exitCode = 1;
}

void main();
