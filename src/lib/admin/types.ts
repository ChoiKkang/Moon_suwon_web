import type { DataFreshness, PetPolicy } from '@/lib/pet/policy';

export type AdminActionResult =
  | { success: true; message: string }
  | { success: false; error: string; field?: string };

export type AdminPlaceCopy = {
  id: string | null;
  displayName: string | null;
  shortDescription: string | null;
  nightHighlight: string | null;
  photoTip: string | null;
  missionTitle: string | null;
  missionBody: string | null;
  missionPrompt: string | null;
  coupleQuestion: string | null;
  shortStory: string | null;
};

export type AdminPlace = {
  id: string;
  slug: string;
  officialName: string;
  displayName: string;
  addressFull: string | null;
  lat: number | null;
  lng: number | null;
  contactPhone: string | null;
  sourceOverviewRaw: string | null;
  category: string | null;
  ktoContentId: string | null;
  ktoContentTypeId: string | null;
  ingestionStatus: CandidateIngestionStatus;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  petPolicy: PetPolicy;
  petDataStatus: DataFreshness;
  petNote: string | null;
  petSourceUpdatedAt: string | null;
  petManualOverride: boolean;
  heroImageUrl: string | null;
  sourceModifiedAt: string | null;
  isActive: boolean;
  isPublished: boolean;
  displayPriority: number;
  isNowGoodEnabled: boolean;
  nightSuitabilityScore: number;
  recommendedFrom: string | null;
  recommendedUntil: string | null;
  recommendationBoost: number;
  opsMemo: string | null;
  updatedAt: string | null;
  copy: AdminPlaceCopy;
};

export type CandidateIngestionStatus = 'candidate' | 'approved' | 'rejected' | 'stale';

export type CandidateFilter = {
  status?: CandidateIngestionStatus | 'all';
  search?: string;
};

export type AdminCandidate = {
  placeId: string;
  slug: string;
  displayName: string;
  officialName: string;
  ktoContentId: string | null;
  ktoContentTypeId: string | null;
  ingestionStatus: CandidateIngestionStatus;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  petPolicy: PetPolicy;
  petDataStatus: DataFreshness;
  petNote: string | null;
  petSourceUpdatedAt: string | null;
  sourceModifiedAt: string | null;
  hasCoordinates: boolean;
  hasHeroImage: boolean;
  isPublished: boolean;
  isActive: boolean;
  addressFull: string | null;
  category: string | null;
};

export type AdminCandidateDetail = AdminCandidate & {
  lat: number | null;
  lng: number | null;
  contactPhone: string | null;
  sourceOverview: string | null;
  latestAudit: AdminAuditEvent | null;
};

export type AdminAuditEvent = {
  id: string;
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AdminSourceHealth = {
  source: string;
  lastStatus: string | null;
  lastCompletedAt: string | null;
  freshness: 'fresh' | 'stale' | 'unknown';
  fetched: number;
  upserted: number;
  errors: number;
  metadata: Record<string, unknown>;
};

export type AdminCoursePlace = {
  placeId: string;
  slug: string;
  displayName: string;
  orderIndex: number;
};

export type AdminCourse = {
  id: string;
  slug: string;
  themeTags: string[];
  estimatedDurationMin: number;
  walkingDistanceKm: number | null;
  recommendedStartTime: string | null;
  petReadyFlag: boolean;
  isPublished: boolean;
  displayPriority: number;
  opsMemo: string | null;
  updatedAt: string | null;
  automationSource: string | null;
  automationKey: string | null;
  automationMetadata: Record<string, unknown>;
  lastAutomatedAt: string | null;
  copy: {
    heroTitle: string;
    subtitle: string | null;
    routeSummary: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImageUrl: string | null;
  };
  places: AdminCoursePlace[];
};

export type AdminEvent = {
  id: string;
  eventContentId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  venueAddress: string | null;
  lat: number | null;
  lng: number | null;
  heroImageUrl: string | null;
  contactPhone: string | null;
  eventPlace: string | null;
  playTime: string | null;
  usageFee: string | null;
  programRaw: string | null;
  sourceModifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminCrowdSummary = {
  latestForecastDate: string | null;
  latestSourceUpdatedAt: string | null;
  totalRows: number;
  todayRows: number;
  stale: boolean;
  byLevel: Record<string, number>;
  missingTodayPlaceNames: string[];
};

export type AdminSyncRun = {
  id: string;
  source: string;
  status: string;
  itemsFetched: number;
  itemsUpserted: number;
  errorCount: number;
  metadata: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  isStale: boolean;
};

/**
 * 부가 정보가 공개 장소 중 몇 곳에 붙었는지.
 *
 * 오디오 해설·무장애·반려동물은 각기 다른 KTO 서비스에서 오고 커버리지가 크게
 * 다르다. 운영자가 "수집이 돌았는지"는 Sync Runs에서 보지만 "그래서 화면에 뭐가
 * 붙었는지"는 알 수 없었다. 공개 장소 기준 채움 비율을 함께 보여준다.
 */
export type AdminEnrichmentCoverage = {
  key: 'audio' | 'accessibility' | 'pet';
  label: string;
  /** 값이 붙은 공개 장소 수. */
  places: number;
  /** 공개 장소 총계. 비율 계산의 분모다. */
  publishedPlaces: number;
  /** 연결된 항목 수. 오디오 해설처럼 장소당 여러 건인 경우에만 의미가 있다. */
  items: number | null;
  /** 운영자가 읽을 보충 설명. */
  note: string;
};

export type AdminSyncError = {
  id: string;
  syncRunId: string;
  endpoint: string;
  contentId: string | null;
  errorCode: string | null;
  message: string;
  createdAt: string;
};

export type AdminApiLedgerItem = {
  apiKey: string;
  provider: string;
  displayName: string;
  approvalStatus: string;
  accountStage: string;
  approvedAt: string;
  expiresAt: string;
  expirationStatus: 'active' | 'expiring' | 'expired';
  implementationStatus: string;
  syncJob: string;
  scheduleLabel: string;
  freshnessSlaHours: number;
  reviewPolicy: string;
  latestStatus: 'never_run' | 'healthy' | 'warning' | 'failed' | 'hold';
  latestCompletedAt: string | null;
  fetched: number;
  upserted: number;
  errors: number;
  zeroResult: boolean;
  freshness: 'fresh' | 'stale' | 'unknown';
  reviewCounts: { pending: number; approved: number; hold: number; excluded: number };
};

export type AdminDashboardData = {
  places: AdminPlace[];
  courses: AdminCourse[];
  events: AdminEvent[];
  crowd: AdminCrowdSummary;
  syncRuns: AdminSyncRun[];
  syncErrors: AdminSyncError[];
  candidates: AdminCandidate[];
  sourceHealth: AdminSourceHealth[];
};

export type AdminQueryResult<T> = {
  data: T;
  error: string | null;
};

export type PlacePublishInput = {
  placeId: string;
  isPublished: boolean;
  displayPriority: number;
  isNowGoodEnabled: boolean;
  nightSuitabilityScore: number;
  recommendedFrom: string | null;
  recommendedUntil: string | null;
  recommendationBoost: number;
  opsMemo: string | null;
};

export type PlaceCopyInput = {
  placeId: string;
  displayName: string | null;
  shortDescription: string | null;
  nightHighlight: string | null;
  photoTip: string | null;
  missionTitle: string | null;
  missionBody: string | null;
  missionPrompt: string | null;
  coupleQuestion: string | null;
  shortStory: string | null;
};

export type CourseInput = {
  id?: string;
  slug: string;
  themeTags: string[];
  estimatedDurationMin: number;
  walkingDistanceKm: number | null;
  recommendedStartTime: string | null;
  petReadyFlag: boolean;
  isPublished: boolean;
  displayPriority: number;
  opsMemo: string | null;
  heroTitle: string;
  subtitle: string | null;
  routeSummary: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  placeIds: string[];
  automationSource?: string | null;
  automationKey?: string | null;
};

export type EventInput = {
  id?: string;
  eventContentId: string;
  eventName: string;
  startDate: string;
  endDate: string;
  venueAddress: string | null;
  lat: number | null;
  lng: number | null;
  heroImageUrl: string | null;
  contactPhone: string | null;
  eventPlace: string | null;
  playTime: string | null;
  usageFee: string | null;
  programRaw: string | null;
};

export type ReviewPlaceCandidateInput = {
  placeId: string;
  decision: 'approve' | 'reject' | 'hold';
  note?: string | null;
};

export type PetPolicyOverrideInput = {
  placeId: string;
  policy: PetPolicy;
  note: string | null;
};
