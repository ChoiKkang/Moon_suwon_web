export type ReviewStatus = 'approved' | 'hold' | 'excluded';
export type ReviewDecision = { status: ReviewStatus; reasons: string[] };

const SUWON_BOUNDS = {
  minLat: 37.18,
  maxLat: 37.35,
  minLng: 126.9,
  maxLng: 127.15,
};

function insideSuwon(lat: number | null, lng: number | null): boolean {
  return lat !== null && lng !== null
    && lat >= SUWON_BOUNDS.minLat && lat <= SUWON_BOUNDS.maxLat
    && lng >= SUWON_BOUNDS.minLng && lng <= SUWON_BOUNDS.maxLng;
}

function hasSuwonAddress(address: string | null): boolean {
  return Boolean(address && /(?:경기도\s*)?수원시/.test(address));
}

export function reviewPhotoCandidate(candidate: {
  sourceId: string;
  address: string | null;
  imageUrl: string | null;
  copyrightCode: string | null;
  sourceUrl: string | null;
  matchedPlaceId: string | null;
}): ReviewDecision {
  const reasons: string[] = [];
  if (!candidate.sourceId.trim()) reasons.push('source_id_missing');
  if (!hasSuwonAddress(candidate.address)) reasons.push('outside_suwon');
  if (!candidate.imageUrl || !/^https:\/\//i.test(candidate.imageUrl)) reasons.push('image_url_invalid');
  if (!candidate.copyrightCode?.trim()) reasons.push('copyright_missing');
  if (!candidate.sourceUrl || !/^https:\/\//i.test(candidate.sourceUrl)) reasons.push('source_url_missing');
  if (reasons.length > 0) return { status: 'excluded', reasons };
  if (!candidate.matchedPlaceId) return { status: 'hold', reasons: ['place_match_required'] };
  return { status: 'approved', reasons: [] };
}

export function reviewTourismCandidate(candidate: {
  sourceId: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  matchedPlaceId: string | null;
}): ReviewDecision {
  if (!candidate.sourceId.trim()) return { status: 'excluded', reasons: ['source_id_missing'] };
  const addressInSuwon = hasSuwonAddress(candidate.address);
  const coordinatesInSuwon = insideSuwon(candidate.lat, candidate.lng);
  if (!addressInSuwon && !coordinatesInSuwon) return { status: 'excluded', reasons: ['outside_suwon'] };
  if ((candidate.lat === null) !== (candidate.lng === null)) return { status: 'hold', reasons: ['coordinates_incomplete'] };
  if (!candidate.matchedPlaceId) return { status: 'hold', reasons: ['place_match_required'] };
  return { status: 'approved', reasons: [] };
}

export function reviewRelation(relation: {
  originPlaceId: string | null;
  relatedPlaceId: string | null;
  originPublished: boolean;
  relatedPublished: boolean;
  score: number | null;
}): ReviewDecision {
  if (relation.originPlaceId && relation.originPlaceId === relation.relatedPlaceId) {
    return { status: 'excluded', reasons: ['self_relation'] };
  }
  const reasons: string[] = [];
  if (!relation.originPlaceId || !relation.relatedPlaceId) reasons.push('place_match_required');
  if (!relation.originPublished || !relation.relatedPublished) reasons.push('published_endpoints_required');
  if (relation.score !== null && (!Number.isFinite(relation.score) || relation.score < 0)) reasons.push('score_invalid');
  return reasons.length > 0 ? { status: 'hold', reasons } : { status: 'approved', reasons: [] };
}

export function reviewDurunubiCourse(course: {
  sourceId: string;
  intersectsSuwon: boolean;
  sourceUrl: string | null;
}): ReviewDecision {
  if (!course.sourceId.trim()) return { status: 'excluded', reasons: ['source_id_missing'] };
  if (!course.intersectsSuwon) return { status: 'excluded', reasons: ['outside_suwon'] };
  if (!course.sourceUrl || !/^https:\/\//i.test(course.sourceUrl)) return { status: 'hold', reasons: ['source_url_missing'] };
  return { status: 'approved', reasons: [] };
}

export function reviewDurunubiCollection<T extends { sourceId: string; intersectsSuwon: boolean; sourceUrl: string | null }>(courses: T[]): {
  status: 'approved';
  publishable: T[];
  zeroResult: boolean;
} {
  return {
    status: 'approved',
    publishable: courses.filter((course) => reviewDurunubiCourse(course).status === 'approved'),
    zeroResult: courses.length === 0,
  };
}
