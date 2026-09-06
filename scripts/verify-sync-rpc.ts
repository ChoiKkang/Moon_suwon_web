import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const { data: runId, error: startError } = await supabase.rpc('sync_run_start', {
    p_source: 'github-actions:rpc-smoke-test',
    p_metadata: { smoke_test: true },
  });

  if (startError || typeof runId !== 'string') {
    throw new Error(`sync_run_start failed: ${startError?.message ?? 'run id 없음'}`);
  }

  const { error: finishError } = await supabase.rpc('sync_run_finish', {
    p_run_id: runId,
    p_status: 'completed',
    p_items_fetched: 0,
    p_items_upserted: 0,
    p_error_count: 0,
    p_metadata: { smoke_test: true },
  });

  if (finishError) {
    throw new Error(`sync_run_finish failed: ${finishError.message}`);
  }

  const { data: places, error: placesError } = await supabase.rpc('sync_list_places');
  if (placesError) {
    throw new Error(`sync_list_places failed: ${placesError.message}`);
  }

  if (!Array.isArray(places)) {
    throw new Error('sync_list_places returned a non-array response');
  }

  console.log(`Sync RPC smoke test passed; enabled places: ${places.length}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
