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

  const smokeItemKey = `rpc-smoke-${runId}`;
  const { data: registry, error: registryError } = await supabase.rpc('sync_list_api_registry');
  if (registryError || !Array.isArray(registry) || registry.length !== 14) {
    throw new Error(`sync_list_api_registry failed: ${registryError?.message ?? `expected 14 rows, got ${Array.isArray(registry) ? registry.length : 'non-array'}`}`);
  }

  const { data: itemResult, error: itemError } = await supabase.rpc('sync_public_api_item', {
    p_run_id: runId,
    p_api_key: 'kto_korean',
    p_source_item_key: smokeItemKey,
    p_scope_key: 'rpc-smoke',
    p_payload: { smoke_test: true },
    p_payload_hash: runId,
    p_source_updated_at: null,
  });
  if (itemError || !itemResult || typeof itemResult !== 'object') {
    throw new Error(`sync_public_api_item failed: ${itemError?.message ?? 'invalid response'}`);
  }

  const { error: reviewError } = await supabase.rpc('sync_public_api_review', {
    p_api_key: 'kto_korean',
    p_source_item_key: smokeItemKey,
    p_scope_key: 'rpc-smoke',
    p_review_status: 'excluded',
    p_review_note: 'automated RPC smoke test',
  });
  if (reviewError) {
    throw new Error(`sync_public_api_review failed: ${reviewError.message}`);
  }

  const { error: cleanupError } = await supabase
    .schema('raw')
    .from('public_api_items')
    .delete()
    .eq('api_key', 'kto_korean')
    .eq('source_item_key', smokeItemKey)
    .eq('scope_key', 'rpc-smoke');
  if (cleanupError) throw new Error(`public API smoke cleanup failed: ${cleanupError.message}`);

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

  const { data: petQueue, error: petQueueError } = await supabase.rpc('sync_list_pet_enrichment', {
    p_limit: 5,
  });
  if (petQueueError || !Array.isArray(petQueue)) {
    throw new Error(`sync_list_pet_enrichment failed: ${petQueueError?.message ?? 'non-array response'}`);
  }

  const { data: reconciled, error: reconcileError } = await supabase.rpc('sync_reconcile_stale_runs', {
    p_max_age_minutes: 90,
  });
  if (reconcileError || !Number.isInteger(Number(reconciled))) {
    throw new Error(`sync_reconcile_stale_runs failed: ${reconcileError?.message ?? 'invalid count'}`);
  }

  console.log(`Sync RPC smoke test passed; approved APIs: ${registry.length}; enabled places: ${places.length}; pet queue: ${petQueue.length}; stale runs reconciled: ${Number(reconciled)}`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
