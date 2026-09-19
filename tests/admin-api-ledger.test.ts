import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildAdminApiLedger, type ApiLedgerRunRow, type ApiRegistryRow } from '@/lib/admin/api-ledger';
import { PUBLIC_API_CATALOG } from '@/lib/public-data/catalog';

const registry: ApiRegistryRow[] = PUBLIC_API_CATALOG.map((item) => ({
  api_key: item.key,
  provider: item.provider,
  display_name: item.displayName,
  approval_status: 'approved',
  account_stage: item.accountStage,
  approved_at: item.approvedAt,
  expires_at: item.expiresAt,
  implementation_status: item.implementationStatus,
  sync_job: item.syncJob,
  schedule_label: item.scheduleLabel,
  freshness_sla_hours: item.freshnessSlaHours,
  review_policy: item.reviewPolicy,
}));

function run(source: string, startedAt: string, overrides: Partial<ApiLedgerRunRow> = {}): ApiLedgerRunRow {
  return {
    source,
    status: 'completed',
    items_fetched: 10,
    items_upserted: 8,
    error_count: 0,
    metadata: {},
    started_at: startedAt,
    completed_at: startedAt,
    ...overrides,
  };
}

test('maps exactly fourteen unique approved APIs and never-run state', () => {
  const ledger = buildAdminApiLedger(registry, [], [], new Date('2026-09-20T00:00:00Z'));
  assert.equal(ledger.length, 14);
  assert.equal(new Set(ledger.map((item) => item.apiKey)).size, 14);
  assert.ok(ledger.every((item) => item.latestStatus === 'never_run'));
});

test('selects the latest run per source and marks partial or stale runs warning', () => {
  const ledger = buildAdminApiLedger(registry, [
    run('GitHubActions:photo', '2026-09-19T00:00:00Z', { items_fetched: 50 }),
    run('GitHubActions:photo', '2026-09-20T10:00:00Z', { status: 'partial', items_fetched: 9, error_count: 1 }),
  ], [], new Date('2026-09-20T12:00:00Z'));
  const photo = ledger.find((item) => item.apiKey === 'kto_photo');
  assert.equal(photo?.fetched, 9);
  assert.equal(photo?.latestStatus, 'warning');
});

test('labels healthy Durunubi zero result and review counts', () => {
  const ledger = buildAdminApiLedger(registry, [
    run('GitHubActions:durunubi', '2026-09-20T10:00:00Z', { items_fetched: 0, items_upserted: 0, metadata: { zero_result: true } }),
  ], [
    { api_key: 'durunubi', review_status: 'hold' },
    { api_key: 'durunubi', review_status: 'excluded' },
  ], new Date('2026-09-20T12:00:00Z'));
  const durunubi = ledger.find((item) => item.apiKey === 'durunubi');
  assert.equal(durunubi?.latestStatus, 'healthy');
  assert.equal(durunubi?.zeroResult, true);
  assert.deepEqual(durunubi?.reviewCounts, { pending: 0, approved: 0, hold: 1, excluded: 1 });
});

test('marks past approval expiration', () => {
  const expired = registry.map((row) => row.api_key === 'kto_photo' ? { ...row, expires_at: '2026-09-19' } : row);
  const ledger = buildAdminApiLedger(expired, [], [], new Date('2026-09-20T00:00:00Z'));
  assert.equal(ledger.find((item) => item.apiKey === 'kto_photo')?.expirationStatus, 'expired');
});

test('operations UI renders the server-provided ledger and Durunubi zero note', () => {
  const component = readFileSync(new URL('../src/components/admin/operations-panel.tsx', import.meta.url), 'utf8');
  const query = readFileSync(new URL('../src/lib/admin/queries.ts', import.meta.url), 'utf8');
  assert.match(component, /승인 API 14개 관리대장/);
  assert.match(component, /두루누비는 수원과 교차하는 코스가 없으면 0건이어도 정상/);
  assert.match(query, /rpc\('sync_list_api_registry'\)/);
  assert.doesNotMatch(component, /schema\(['"](?:ops|raw|core)['"]\)/);
});
