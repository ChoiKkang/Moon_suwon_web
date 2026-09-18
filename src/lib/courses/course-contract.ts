export type CourseConstraintViolation =
  | 'missing_coordinates'
  | 'unpublished_place'
  | 'duplicate_place'
  | 'route_too_long'
  | 'pet_policy_unknown'
  | 'stale_source'
  | 'missing_content';

export type CourseCandidateForValidation = {
  placeIds: string[];
  walkingDistanceKm: number;
  distanceKind: 'straight_line_estimate' | 'routed';
  evidence: Array<{ placeId: string; reasons: string[] }>;
  constraintViolations: CourseConstraintViolation[];
};

const HARD_VIOLATIONS: ReadonlySet<CourseConstraintViolation> = new Set([
  'missing_coordinates',
  'unpublished_place',
  'duplicate_place',
  'route_too_long',
  'pet_policy_unknown',
  'stale_source',
]);

/**
 * Validate the planner output before it can be persisted as an automated draft.
 * The route distance is an estimate unless a future routing provider explicitly
 * changes the distance kind; no caller may silently label straight-line distance
 * as walking directions.
 */
export function validateCourseCandidate(
  plan: CourseCandidateForValidation,
): { valid: boolean; violations: CourseConstraintViolation[] } {
  const violations = new Set<CourseConstraintViolation>(plan.constraintViolations ?? []);
  if (!Array.isArray(plan.placeIds) || plan.placeIds.length === 0) violations.add('missing_content');
  if (new Set(plan.placeIds).size !== plan.placeIds.length) violations.add('duplicate_place');
  if (!Number.isFinite(plan.walkingDistanceKm) || plan.walkingDistanceKm < 0) violations.add('missing_coordinates');
  if (plan.distanceKind !== 'straight_line_estimate' && plan.distanceKind !== 'routed') violations.add('missing_coordinates');

  const evidenceIds = new Set((plan.evidence ?? []).map((item) => item.placeId));
  for (const placeId of plan.placeIds ?? []) {
    if (!evidenceIds.has(placeId)) violations.add('missing_content');
  }

  const ordered = [...violations];
  return { valid: ordered.every((violation) => !HARD_VIOLATIONS.has(violation)), violations: ordered };
}

