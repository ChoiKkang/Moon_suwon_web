import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildAdminApiLedger, mergeBusStopReviewRows, type ApiLedgerRunRow, type ApiRegistryRow } from '@/lib/admin/api-ledger';
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

test('labels a completed bus run with no reviewed station mapping as hold', () => {
  const ledger = buildAdminApiLedger(registry, [
    run('GitHubActions:bus_arrival', '2026-09-19T18:00:00Z', {
      items_fetched: 0,
      items_upserted: 0,
      metadata: { operational_status: 'hold', zero_result: true, scope_counts: { mapped_stations: 0 } },
    }),
  ], [], new Date('2026-09-20T12:00:00Z'));
  const bus = ledger.find((item) => item.apiKey === 'gg_bus_arrival');
  assert.equal(bus?.latestStatus, 'hold');
  assert.equal(bus?.zeroResult, true);
});

test('counts pending bus-stop mappings in the bus API review queue', () => {
  const reviews = mergeBusStopReviewRows(
    [{ api_key: 'kto_related', review_status: 'approved' }],
    [{ review_status: 'pending' }, { review_status: 'pending' }, { review_status: 'approved' }],
  );
  const ledger = buildAdminApiLedger(registry, [], reviews, new Date('2026-09-20T00:00:00Z'));
  const bus = ledger.find((item) => item.apiKey === 'gg_bus_arrival');
  assert.deepEqual(bus?.reviewCounts, { pending: 2, approved: 1, hold: 0, excluded: 0 });
});

test('marks past approval expiration', () => {
  const expired = registry.map((row) => row.api_key === 'kto_photo' ? { ...row, expires_at: '2026-09-19' } : row);
  const ledger = buildAdminApiLedger(expired, [], [], new Date('2026-09-20T00:00:00Z'));
  assert.equal(ledger.find((item) => item.apiKey === 'kto_photo')?.expirationStatus, 'expired');
});

test('operations UI renders the server-provided ledger and Durunubi zero note', () => {
  const component = readFileSync(new URL('../src/components/admin/operations-panel.tsx', import.meta.url), 'utf8');
  const query = readFileSync(new URL('../src/lib/admin/queries.ts', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../.github/workflows/public-data-sync.yml', import.meta.url), 'utf8');
  assert.match(component, /승인 API 14개 관리대장/);
  assert.match(component, /두루누비는 수원과 교차하는 코스가 없으면 0건이어도 정상/);
  assert.match(component, /actions\/workflows\/public-data-sync\.yml/);
  for (const job of ['photo', 'wellness', 'local_hub', 'related', 'durunubi', 'visitors', 'weather_short', 'weather_mid', 'bus_arrival']) {
    assert.match(component, new RegExp("id: '" + job + "'"));
  }
  assert.match(query, /rpc\('sync_list_api_registry'\)/);
  assert.match(query, /place_bus_stops/);
  assert.doesNotMatch(component, /schema\(['"](?:ops|raw|core)['"]\)/);
  assert.match(workflow, /KMA_SERVICE_KEY/);
  assert.match(workflow, /GG_BUS_SERVICE_KEY/);
  assert.match(workflow, /weather_short\|weather_mid/);
  assert.match(workflow, /bus_arrival/);
});

test('public landing controls expose accessible names and semantic rails', () => {
  const landing = readFileSync(new URL('../src/components/landing-client.tsx', import.meta.url), 'utf8');
  const rail = readFileSync(new URL('../src/components/public/scroll-rail.tsx', import.meta.url), 'utf8');
  assert.match(landing, /aria-label=\{isMobileMenuOpen \? '모바일 메뉴 닫기' : '모바일 메뉴 열기'\}/);
  assert.match(landing, /aria-expanded=\{isMobileMenuOpen\}/);
  assert.match(landing, /text-zinc-400/);
  assert.match(rail, /role="region"/);
});

test('admin guard explains that a session is required instead of showing an OAuth failure', () => {
  const layout = readFileSync(new URL('../src/app/admin/layout.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8');
  const landing = readFileSync(new URL('../src/components/landing-client.tsx', import.meta.url), 'utf8');
  assert.match(layout, /admin-login-required=true/);
  assert.match(page, /adminLoginRequiredParam/);
  assert.match(landing, /hasAdminLoginRequired/);
  assert.match(landing, /관리자 로그인이 필요합니다/);
});

test('public route surfaces distinguish exact navigation from course estimates', () => {
  const courses = readFileSync(new URL('../src/app/courses/page.tsx', import.meta.url), 'utf8');
  const place = readFileSync(new URL('../src/app/places/[slug]/page.tsx', import.meta.url), 'utf8');
  assert.match(courses, /코스 전체 길찾기/);
  assert.match(courses, /실제 도보 경로는 지도에서 확인/);
  assert.match(courses, /다음 스팟 길찾기/);
  assert.match(place, /포함된 코스/);
  assert.match(place, /buildPlaceNavigationLinks/);
});
