import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
// Tables reachable through the exposed schemas. audit.admin_events is checked
// separately because it is deliberately kept out of the PostgREST schema list.
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
] as const;

async function main() {
  const results = await Promise.all(
    targets.map(async ([schema, table]) => {
      // A head-only count can come back with a null count and an empty error
      // message when PostgREST rejects the schema, which used to read as a
      // healthy "0 rows". Select a real row so an unreachable schema fails.
      const { data, error } = await supabase.schema(schema).from(table).select('*').limit(1);
      const { count } = await supabase.schema(schema).from(table).select('*', { count: 'exact', head: true });
      return {
        schema,
        table,
        count: count ?? data?.length ?? 0,
        error: error?.message || null,
      };
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

  // The admin console reads audit history through this security-definer
  // function, so verify the same path an operator actually depends on.
  const audit = await supabase.rpc('admin_list_audit_events', { p_entity_id: null, p_limit: 1 });
  if (audit.error) {
    hasError = true;
    console.error(`audit.admin_events (via admin_list_audit_events): ERROR ${audit.error.message}`);
  } else {
    console.log(`audit.admin_events: readable via admin_list_audit_events (${Array.isArray(audit.data) ? audit.data.length : 0} sampled)`);
  }

  if (hasError) process.exitCode = 1;
}

void main();
