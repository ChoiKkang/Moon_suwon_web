import type { PublicApiDefinition } from './catalog';

export type ApiHealthStatus = 'healthy' | 'warning' | 'failed' | 'hold';

export type ApiRunHealth = {
  status: string;
  itemsFetched: number;
  itemsUpserted: number;
  errorCount: number;
  completedAt: string | null;
  metadata: Record<string, unknown>;
};

export type DatasetHealthStats = {
  rawCount: number;
  publicCount: number;
  scopeCounts?: Record<string, number>;
  latestForecastAt?: string | null;
  forecastGapHours?: number | null;
  visitorMonthComplete?: boolean;
  invalidRelationCount?: number;
  missingProvenanceCount?: number;
  latestBusFetchedAt?: string | null;
};

export type ApiHealthFinding = {
  code: string;
  severity: 'warning' | 'failed';
  message: string;
};

export type ApiHealthResult = {
  status: ApiHealthStatus;
  findings: ApiHealthFinding[];
};

const SUWON_DISTRICTS = ['41111', '41113', '41115', '41117'] as const;

function hoursBetween(now: Date, value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? (now.getTime() - timestamp) / (60 * 60 * 1000)
    : Number.POSITIVE_INFINITY;
}

export function evaluateApiHealth(
  definition: PublicApiDefinition,
  latestRun: ApiRunHealth | null,
  previousRun: ApiRunHealth | null,
  dataset: DatasetHealthStats,
  now = new Date(),
): ApiHealthResult {
  if (definition.implementationStatus === 'hold') return { status: 'hold', findings: [] };

  const findings: ApiHealthFinding[] = [];
  const fail = (code: string, message: string) => findings.push({ code, severity: 'failed', message });
  const warn = (code: string, message: string) => findings.push({ code, severity: 'warning', message });

  if (!latestRun) {
    fail('missing_run', '활성 API의 동기화 실행 이력이 없습니다.');
    return { status: 'failed', findings };
  }

  const intentionalBusHold = definition.key === 'gg_bus_arrival'
    && latestRun.status === 'completed'
    && latestRun.errorCount === 0
    && latestRun.itemsFetched === 0
    && latestRun.metadata.operational_status === 'hold'
    && latestRun.metadata.zero_result === true;
  if (intentionalBusHold) return { status: 'hold', findings: [] };

  if (latestRun.status === 'failed') fail('run_failed', '최근 동기화가 실패했습니다.');
  else if (latestRun.status !== 'completed') warn('run_partial', `최근 동기화 상태가 ${latestRun.status}입니다.`);
  if (latestRun.errorCount > 0) warn('run_errors', `최근 실행에 오류 ${latestRun.errorCount}건이 있습니다.`);

  const runAgeHours = hoursBetween(now, latestRun.completedAt);
  if (runAgeHours > definition.freshnessSlaHours) {
    fail('sla_expired', `마지막 완료 시각이 SLA ${definition.freshnessSlaHours}시간을 넘었습니다.`);
  }

  const validDurunubiZero = definition.key === 'durunubi'
    && latestRun.status === 'completed'
    && latestRun.itemsFetched === 0
    && (latestRun.metadata.zero_result === true || dataset.rawCount === 0);
  if (latestRun.itemsFetched === 0 && !validDurunubiZero && definition.key !== 'gg_bus_arrival') {
    warn('unexpected_zero', '최근 실행이 0건이며 정상 0건으로 분류되지 않았습니다.');
  }

  if (
    previousRun && previousRun.itemsFetched >= 10
    && latestRun.itemsFetched <= previousRun.itemsFetched * 0.1
    && !validDurunubiZero
  ) {
    warn('sudden_drop', `수집 건수가 직전 ${previousRun.itemsFetched}건에서 ${latestRun.itemsFetched}건으로 급감했습니다.`);
  }

  if (definition.key !== 'kto_audio' && dataset.publicCount > dataset.rawCount) {
    fail('count_inversion', `공개 ${dataset.publicCount}건이 원본 ${dataset.rawCount}건보다 많습니다.`);
  }

  if (definition.key === 'kto_local_hub' || definition.key === 'kto_visitors' || definition.key === 'kto_crowd') {
    const missing = SUWON_DISTRICTS.filter((district) => (dataset.scopeCounts?.[district] ?? 0) === 0);
    if (missing.length > 0) warn('district_incomplete', `수원 4개 구 중 누락: ${missing.join(', ')}`);
  }

  if (definition.key === 'kma_short' || definition.key === 'kma_mid') {
    if (!dataset.latestForecastAt || Date.parse(dataset.latestForecastAt) < now.getTime()) {
      fail('forecast_expired', '현재 이후를 포함하는 예보가 없습니다.');
    }
    if (dataset.forecastGapHours !== undefined && dataset.forecastGapHours !== null && dataset.forecastGapHours > 6) {
      fail('forecast_gap', `예보 시계열에 ${dataset.forecastGapHours}시간 공백이 있습니다.`);
    }
  }

  if (definition.key === 'kto_visitors' && dataset.visitorMonthComplete === false) {
    warn('visitor_month_incomplete', '최근 방문자 기준월 또는 4개 구 데이터가 불완전합니다.');
  }
  if (definition.key === 'kto_related' && (dataset.invalidRelationCount ?? 0) > 0) {
    fail('relation_invalid', `자기참조·미게시 연관지 ${dataset.invalidRelationCount}건이 있습니다.`);
  }
  if (definition.key === 'kto_photo' && (dataset.missingProvenanceCount ?? 0) > 0) {
    fail('image_provenance_missing', `출처·저작권 근거 없는 공개 사진 ${dataset.missingProvenanceCount}건이 있습니다.`);
  }
  if (definition.key === 'gg_bus_arrival' && dataset.publicCount > 0) {
    if (hoursBetween(now, dataset.latestBusFetchedAt) > definition.freshnessSlaHours) {
      fail('bus_cache_expired', '승인된 정류장의 버스 캐시가 만료되었습니다.');
    }
  }

  const status: ApiHealthStatus = findings.some((finding) => finding.severity === 'failed')
    ? 'failed'
    : findings.length > 0
      ? 'warning'
      : 'healthy';
  return { status, findings };
}
