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

export type AdminSyncError = {
  id: string;
  syncRunId: string;
  endpoint: string;
  contentId: string | null;
  errorCode: string | null;
  message: string;
  createdAt: string;
};

export type AdminDashboardData = {
  places: AdminPlace[];
  courses: AdminCourse[];
  events: AdminEvent[];
  crowd: AdminCrowdSummary;
  syncRuns: AdminSyncRun[];
  syncErrors: AdminSyncError[];
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
