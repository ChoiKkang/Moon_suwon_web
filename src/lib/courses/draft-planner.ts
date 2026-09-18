import type { DataFreshness, PetPolicy } from '@/lib/pet/policy';
import { validateCourseCandidate, type CourseConstraintViolation } from './course-contract';

export type CoursePlannerPlace = {
  id: string;
  slug: string;
  displayName: string;
  lat: number;
  lng: number;
  category?: string | null;
  nightSuitabilityScore?: number | null;
  recommendationBoost?: number | null;
  petReady?: boolean;
  petPolicy?: PetPolicy;
  petDataStatus?: DataFreshness;
  sourceModifiedAt?: string | null;
  hasHeroImage?: boolean;
  hasContent?: boolean;
  isPublished?: boolean;
};

export type CourseDraftPlan = {
  automationKey: string;
  automationSource: 'heuristic-v2';
  slug: string;
  themeTags: string[];
  estimatedDurationMin: number;
  walkingDistanceKm: number;
  recommendedStartTime: string;
  petReadyFlag: boolean;
  displayPriority: number;
  opsMemo: string;
  heroTitle: string;
  subtitle: string;
  routeSummary: string;
  ogTitle: string;
  ogDescription: string;
  placeIds: string[];
  distanceKind: 'straight_line_estimate' | 'routed';
  evidence: Array<{ placeId: string; reasons: string[] }>;
  constraintViolations: CourseConstraintViolation[];
};

export type CoursePlannerOptions = {
  maxPlans?: number;
  minPlaces?: number;
  maxPlaces?: number;
  maxRouteKm?: number;
  petOnly?: boolean;
};

const THEMES = [
  { key: 'night-view', tags: ['야경', '성곽'], title: '수원 성곽 야경 집중 코스' },
  { key: 'photo-walk', tags: ['사진', '산책'], title: '달빛 사진 산책 코스' },
  { key: 'quiet-route', tags: ['여유', '달빛'], title: '조용한 달빛 성곽 코스' },
] as const;

const EARTH_RADIUS_KM = 6371;

function isValidCoordinate(place: CoursePlannerPlace): boolean {
  return Number.isFinite(place.lat)
    && Number.isFinite(place.lng)
    && place.lat >= -90
    && place.lat <= 90
    && place.lng >= -180
    && place.lng <= 180;
}

function isEligible(place: CoursePlannerPlace, options: CoursePlannerOptions): boolean {
  if (place.isPublished === false) return false;
  if (!isValidCoordinate(place)) return false;
  if (options.petOnly) {
    if (place.petPolicy !== 'allowed' && place.petPolicy !== 'partial') return false;
    if (place.petDataStatus !== 'fresh') return false;
  }
  return true;
}

export function haversineKm(from: Pick<CoursePlannerPlace, 'lat' | 'lng'>, to: Pick<CoursePlannerPlace, 'lat' | 'lng'>): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(to.lat - from.lat);
  const longitudeDelta = toRadians(to.lng - from.lng);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function score(place: CoursePlannerPlace): number {
  const night = Number.isFinite(place.nightSuitabilityScore) ? Number(place.nightSuitabilityScore) : 0;
  const boost = Number.isFinite(place.recommendationBoost) ? Number(place.recommendationBoost) : 0;
  return night * 0.7 + boost;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function nearestNeighborRoute(places: CoursePlannerPlace[]): CoursePlannerPlace[] {
  if (places.length < 2) return [...places];

  const remaining = new Map(places.slice(1).map((place) => [place.id, place]));
  const route = [places[0]];

  while (remaining.size > 0) {
    const current = route[route.length - 1];
    const next = [...remaining.values()].sort((a, b) => {
      const distanceDelta = haversineKm(current, a) - haversineKm(current, b);
      return distanceDelta || a.id.localeCompare(b.id);
    })[0];
    if (!next) break;
    route.push(next);
    remaining.delete(next.id);
  }

  return route;
}

function routeDistanceKm(route: CoursePlannerPlace[]): number {
  return route.slice(1).reduce((total, place, index) => total + haversineKm(route[index]!, place), 0);
}

function compactNames(route: CoursePlannerPlace[]): string {
  return route.map((place) => place.displayName).join(' → ');
}

function evidenceFor(place: CoursePlannerPlace): string[] {
  const reasons: string[] = [];
  if ((place.nightSuitabilityScore ?? 0) > 0) reasons.push(`야간 적합도 ${Number(place.nightSuitabilityScore ?? 0).toFixed(0)}`);
  if ((place.recommendationBoost ?? 0) > 0) reasons.push(`운영 추천 가중치 +${Number(place.recommendationBoost ?? 0).toFixed(0)}`);
  if (place.category) reasons.push(`분류 ${place.category}`);
  if (place.petPolicy === 'allowed' || place.petPolicy === 'partial') reasons.push(`반려동물 정책 ${place.petPolicy === 'allowed' ? '가능' : '조건부 가능'}`);
  if (place.petPolicy === 'unknown') reasons.push('반려동물 정책 확인 필요');
  if (place.hasHeroImage === false) reasons.push('대표 이미지 보강 필요');
  if (place.hasContent === false) reasons.push('운영 문구 보강 필요');
  return reasons.length > 0 ? reasons : ['공개·활성 장소 후보'];
}

function rounded(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function planCourseDrafts(
  input: CoursePlannerPlace[],
  options: CoursePlannerOptions = {},
): CourseDraftPlan[] {
  const maxPlans = Math.max(1, Math.min(3, options.maxPlans ?? 3));
  const minPlaces = Math.max(2, Math.min(5, options.minPlaces ?? 3));
  const maxPlaces = Math.max(minPlaces, Math.min(5, options.maxPlaces ?? 4));
  const maxRouteKm = Math.max(0.1, options.maxRouteKm ?? 8);
  const places = input
    .filter((place) => isEligible(place, options))
    .filter((place, index, all) => all.findIndex((candidate) => candidate.id === place.id) === index)
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));

  if (places.length < minPlaces) return [];

  const plans: CourseDraftPlan[] = [];
  const usedKeys = new Set<string>();

  for (const [themeIndex, theme] of THEMES.entries()) {
    if (plans.length >= maxPlans) break;

    // Themes previously started at offsets 0, 1, 2, so every draft reused the
    // same handful of top-scored places and publishing more spots did not widen
    // the candidate pool. Stride the window by maxPlaces so each theme draws
    // from a different score band, then fall back to a tighter offset when the
    // pool is too small to stride.
    const stride = themeIndex * maxPlaces;
    const maxOffset = Math.max(0, places.length - minPlaces);
    const offset = Math.min(stride <= maxOffset ? stride : themeIndex, maxOffset);
    const selected = places.slice(offset, offset + maxPlaces);
    if (selected.length < minPlaces) continue;

    const route = nearestNeighborRoute(selected);
    const distanceKm = routeDistanceKm(route);
    if (distanceKm > maxRouteKm) {
      const compactRoute = nearestNeighborRoute(selected.slice(0, minPlaces));
      const compactDistance = routeDistanceKm(compactRoute);
      if (compactDistance > maxRouteKm) continue;
      route.splice(0, route.length, ...compactRoute);
    }

    const sortedIds = [...route].map((place) => place.id).sort();
    const automationKey = `heuristic-v2:${theme.key}:${sortedIds.join(',')}`;
    if (usedKeys.has(automationKey)) continue;
    usedKeys.add(automationKey);

    const finalDistanceKm = rounded(routeDistanceKm(route));
    const names = compactNames(route);
    const petReadyFlag = route.every((place) => place.petReady === true);
    const constraintViolations = route.some((place) => place.hasHeroImage === false || place.hasContent === false)
      ? ['missing_content' as const]
      : [];
    const estimatedDurationMin = Math.max(45, Math.min(240, Math.round(route.length * 18 + finalDistanceKm * 15)));
    const slug = `auto-${theme.key}-${stableHash(automationKey)}`;

    const evidence = route.map((place) => ({ placeId: place.id, reasons: evidenceFor(place) }));
    const candidate = {
      automationKey,
      automationSource: 'heuristic-v2' as const,
      slug,
      themeTags: [...theme.tags],
      estimatedDurationMin,
      walkingDistanceKm: finalDistanceKm,
      recommendedStartTime: '19:00',
      petReadyFlag,
      displayPriority: 90 - themeIndex,
      opsMemo: `자동 생성 초안입니다. 좌표 직선거리 약 ${finalDistanceKm.toFixed(2)}km 기준 후보이며, 실제 도보 동선·운영시간·현장 접근성을 검수한 뒤 공개하세요.${petReadyFlag ? ' 모든 후보의 반려동물 준비 상태가 확인되었습니다.' : ''}`,
      heroTitle: theme.title,
      subtitle: '공개 장소 데이터로 만든 검수 대기 초안',
      routeSummary: names,
      ogTitle: `${theme.title} | 달빛수원`,
      ogDescription: `${names}을 잇는 달빛수원 추천 초안입니다.`,
      placeIds: route.map((place) => place.id),
      distanceKind: 'straight_line_estimate' as const,
      evidence,
      constraintViolations,
    } satisfies CourseDraftPlan;
    const validation = validateCourseCandidate(candidate);
    if (!validation.valid) continue;
    plans.push(candidate);
  }

  return plans;
}
