export type PublicApiKey =
  | 'kto_korean'
  | 'kto_photo'
  | 'kto_wellness'
  | 'kto_local_hub'
  | 'kto_accessibility'
  | 'kto_audio'
  | 'gg_bus_arrival'
  | 'kto_crowd'
  | 'kma_short'
  | 'kma_mid'
  | 'durunubi'
  | 'kto_related'
  | 'kto_visitors'
  | 'kto_pet';

export type PublicDataProvider = 'kto' | 'kma' | 'gyeonggi';
export type ReviewPolicy = 'automatic' | 'review_before_publish' | 'internal_analysis' | 'raw_only';
export type ImplementationStatus = 'not_implemented' | 'implemented' | 'active' | 'hold';

export type PublicApiDefinition = {
  key: PublicApiKey;
  provider: PublicDataProvider;
  displayName: string;
  approvedAt: string;
  expiresAt: string;
  accountStage: 'production_submitted';
  implementationStatus: ImplementationStatus;
  syncJob: string;
  scheduleLabel: string;
  freshnessSlaHours: number;
  reviewPolicy: ReviewPolicy;
};

export const PUBLIC_API_CATALOG: readonly PublicApiDefinition[] = [
  { key: 'kto_photo', provider: 'kto', displayName: '한국관광공사 관광사진 정보', approvedAt: '2026-09-19', expiresAt: '2028-09-19', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'photo', scheduleLabel: '주 1회', freshnessSlaHours: 24 * 8, reviewPolicy: 'review_before_publish' },
  { key: 'kto_wellness', provider: 'kto', displayName: '한국관광공사 웰니스관광정보', approvedAt: '2026-09-19', expiresAt: '2028-09-19', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'wellness', scheduleLabel: '주 1회', freshnessSlaHours: 24 * 8, reviewPolicy: 'review_before_publish' },
  { key: 'kto_local_hub', provider: 'kto', displayName: '한국관광공사 기초지자체 중심 관광지 정보', approvedAt: '2026-09-19', expiresAt: '2028-09-19', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'local_hub', scheduleLabel: '월 1회', freshnessSlaHours: 24 * 45, reviewPolicy: 'review_before_publish' },
  { key: 'kto_accessibility', provider: 'kto', displayName: '한국관광공사 무장애 여행 정보', approvedAt: '2026-09-19', expiresAt: '2028-09-19', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'access', scheduleLabel: '주 1회', freshnessSlaHours: 24 * 40, reviewPolicy: 'automatic' },
  { key: 'kto_audio', provider: 'kto', displayName: '한국관광공사 관광지 오디오 가이드정보', approvedAt: '2026-09-19', expiresAt: '2028-09-19', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'audio', scheduleLabel: '주 1회', freshnessSlaHours: 24 * 40, reviewPolicy: 'automatic' },
  { key: 'gg_bus_arrival', provider: 'gyeonggi', displayName: '경기도 버스도착정보 조회', approvedAt: '2026-09-18', expiresAt: '2028-09-18', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'bus_arrival', scheduleLabel: '요청 시 2분 캐시', freshnessSlaHours: 5 / 60, reviewPolicy: 'automatic' },
  { key: 'kto_crowd', provider: 'kto', displayName: '한국관광공사 관광지 집중률 방문자 추이 예측 정보', approvedAt: '2026-09-18', expiresAt: '2028-09-18', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'crowd', scheduleLabel: '매일', freshnessSlaHours: 36, reviewPolicy: 'automatic' },
  { key: 'kma_short', provider: 'kma', displayName: '기상청 단기예보 조회서비스', approvedAt: '2026-05-29', expiresAt: '2028-05-29', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'weather_short', scheduleLabel: '3시간마다', freshnessSlaHours: 6, reviewPolicy: 'automatic' },
  { key: 'kma_mid', provider: 'kma', displayName: '기상청 중기예보 조회서비스', approvedAt: '2026-05-29', expiresAt: '2028-05-29', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'weather_mid', scheduleLabel: '하루 2회', freshnessSlaHours: 18, reviewPolicy: 'automatic' },
  { key: 'durunubi', provider: 'kto', displayName: '한국관광공사 두루누비 정보 서비스', approvedAt: '2026-05-25', expiresAt: '2028-05-25', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'durunubi', scheduleLabel: '주 1회', freshnessSlaHours: 24 * 8, reviewPolicy: 'review_before_publish' },
  { key: 'kto_related', provider: 'kto', displayName: '한국관광공사 관광지별 연관 관광지 정보', approvedAt: '2026-05-25', expiresAt: '2028-05-25', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'related', scheduleLabel: '월 1회', freshnessSlaHours: 24 * 45, reviewPolicy: 'review_before_publish' },
  { key: 'kto_visitors', provider: 'kto', displayName: '한국관광공사 빅데이터 지역별 방문자수', approvedAt: '2026-05-25', expiresAt: '2028-05-25', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'visitors', scheduleLabel: '월 1회', freshnessSlaHours: 24 * 45, reviewPolicy: 'internal_analysis' },
  { key: 'kto_korean', provider: 'kto', displayName: '한국관광공사 국문 관광정보 서비스', approvedAt: '2026-05-25', expiresAt: '2028-05-25', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'content', scheduleLabel: '주 1회', freshnessSlaHours: 24 * 40, reviewPolicy: 'review_before_publish' },
  { key: 'kto_pet', provider: 'kto', displayName: '한국관광공사 반려동물 동반여행 서비스', approvedAt: '2026-05-25', expiresAt: '2028-05-25', accountStage: 'production_submitted', implementationStatus: 'active', syncJob: 'pet', scheduleLabel: '매일', freshnessSlaHours: 24 * 8, reviewPolicy: 'automatic' },
] as const;

export function getPublicApiDefinition(key: PublicApiKey): PublicApiDefinition {
  const definition = PUBLIC_API_CATALOG.find((item) => item.key === key);
  if (!definition) throw new Error(`Unknown public API key: ${key}`);
  return definition;
}
