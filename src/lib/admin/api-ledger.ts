import type { AdminApiLedgerItem } from './types';

export type ApiRegistryRow = {
  api_key: string;
  provider: string;
  display_name: string;
  approval_status: string;
  account_stage: string;
  approved_at: string;
  expires_at: string;
  implementation_status: string;
  sync_job: string;
  schedule_label: string;
  freshness_sla_hours: number | string;
  review_policy: string;
};

export type ApiLedgerRunRow = {
  source: string;
  status: string;
  items_fetched: number;
  items_upserted: number;
  error_count: number;
  metadata: unknown;
  started_at: string;
  completed_at: string | null;
};

export type ApiReviewRow = { api_key: string; review_status: string };

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function buildAdminApiLedger(
  registry: readonly ApiRegistryRow[],
  runs: readonly ApiLedgerRunRow[],
  reviews: readonly ApiReviewRow[],
  now = new Date(),
): AdminApiLedgerItem[] {
  const latestBySource = new Map<string, ApiLedgerRunRow>();
  for (const run of [...runs].sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at))) {
    if (!latestBySource.has(run.source)) latestBySource.set(run.source, run);
  }

  return registry.map((row) => {
    const run = latestBySource.get(`GitHubActions:${row.sync_job}`);
    const slaHours = Number(row.freshness_sla_hours) || 0;
    const completedAt = run?.completed_at ?? null;
    const ageHours = completedAt ? (now.getTime() - Date.parse(completedAt)) / 3_600_000 : Number.POSITIVE_INFINITY;
    const freshness: AdminApiLedgerItem['freshness'] = !run || !completedAt
      ? 'unknown'
      : Number.isFinite(ageHours) && ageHours <= slaHours ? 'fresh' : 'stale';
    const expirationDays = (Date.parse(row.expires_at) - now.getTime()) / 86_400_000;
    const expirationStatus: AdminApiLedgerItem['expirationStatus'] = expirationDays < 0
      ? 'expired'
      : expirationDays <= 90 ? 'expiring' : 'active';
    const relatedReviews = reviews.filter((review) => review.api_key === row.api_key);
    const reviewCounts = { pending: 0, approved: 0, hold: 0, excluded: 0 };
    for (const review of relatedReviews) {
      if (review.review_status in reviewCounts) {
        reviewCounts[review.review_status as keyof typeof reviewCounts] += 1;
      }
    }

    const metadata = metadataRecord(run?.metadata);
    const intentionalBusHold = row.api_key === 'gg_bus_arrival'
      && run?.status === 'completed'
      && run.error_count === 0
      && run.items_fetched === 0
      && metadata.operational_status === 'hold'
      && metadata.zero_result === true;

    let latestStatus: AdminApiLedgerItem['latestStatus'];
    if (row.implementation_status === 'hold') latestStatus = 'hold';
    else if (intentionalBusHold) latestStatus = 'hold';
    else if (!run) latestStatus = 'never_run';
    else if (run.status === 'failed') latestStatus = 'failed';
    else if (run.status !== 'completed' || run.error_count > 0 || freshness === 'stale') latestStatus = 'warning';
    else latestStatus = 'healthy';

    return {
      apiKey: row.api_key,
      provider: row.provider,
      displayName: row.display_name,
      approvalStatus: row.approval_status,
      accountStage: row.account_stage,
      approvedAt: row.approved_at,
      expiresAt: row.expires_at,
      expirationStatus,
      implementationStatus: row.implementation_status,
      syncJob: row.sync_job,
      scheduleLabel: row.schedule_label,
      freshnessSlaHours: slaHours,
      reviewPolicy: row.review_policy,
      latestStatus,
      latestCompletedAt: completedAt,
      fetched: run?.items_fetched ?? 0,
      upserted: run?.items_upserted ?? 0,
      errors: run?.error_count ?? 0,
      zeroResult: Boolean(run && run.status === 'completed' && run.items_fetched === 0 && (metadata.zero_result === true || row.api_key === 'durunubi')),
      freshness,
      reviewCounts,
    };
  }).sort((a, b) => a.provider.localeCompare(b.provider) || a.displayName.localeCompare(b.displayName, 'ko'));
}
