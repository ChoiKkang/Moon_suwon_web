import assert from 'node:assert/strict';
import test from 'node:test';
import { haversineKm, planCourseDrafts, type CoursePlannerPlace } from '../src/lib/courses/draft-planner';
import { validateCourseCandidate } from '../src/lib/courses/course-contract';

const places: CoursePlannerPlace[] = [
  { id: 'a', slug: 'a', displayName: 'A', lat: 37.2800, lng: 127.0100, nightSuitabilityScore: 80, recommendationBoost: 0 },
  { id: 'b', slug: 'b', displayName: 'B', lat: 37.2810, lng: 127.0110, nightSuitabilityScore: 95, recommendationBoost: 0 },
  { id: 'c', slug: 'c', displayName: 'C', lat: 37.2820, lng: 127.0120, nightSuitabilityScore: 90, recommendationBoost: 2 },
  { id: 'd', slug: 'd', displayName: 'D', lat: 37.2830, lng: 127.0130, nightSuitabilityScore: 85, recommendationBoost: 1 },
  { id: 'e', slug: 'e', displayName: 'E', lat: 37.2840, lng: 127.0140, nightSuitabilityScore: 70, recommendationBoost: 0 },
];

test('returns no drafts when there are fewer than three valid places', () => {
  assert.deepEqual(planCourseDrafts(places.slice(0, 2)), []);
});

test('planner output is deterministic and contains unique place sets', () => {
  const first = planCourseDrafts(places);
  const second = planCourseDrafts([...places].reverse());

  assert.deepEqual(first, second);
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map((plan) => plan.automationKey)).size, first.length);
  assert.ok(first.every((plan) => plan.placeIds.length >= 3 && plan.placeIds.length <= 4));
  assert.ok(first.every((plan) => plan.walkingDistanceKm >= 0));
  assert.ok(first.every((plan) => plan.distanceKind === 'straight_line_estimate'));
  assert.ok(first.every((plan) => plan.evidence.length === plan.placeIds.length));
  assert.ok(first.every((plan) => validateCourseCandidate(plan).valid));
});

test('planner respects the maximum route distance and coordinate validation', () => {
  const farPlaces: CoursePlannerPlace[] = [
    ...places.slice(0, 3),
    { id: 'invalid', slug: 'invalid', displayName: 'Invalid', lat: 999, lng: 0 },
  ];
  assert.deepEqual(planCourseDrafts(farPlaces, { maxRouteKm: 0.01 }), []);
  assert.equal(haversineKm(places[0]!, places[0]!), 0);
});

test('pet-ready flag is true only when every stop is marked ready', () => {
  const result = planCourseDrafts(places.map((place) => ({ ...place, petReady: true })), { maxPlans: 1 });
  assert.equal(result[0]?.petReadyFlag, true);
});

test('pet-only planning excludes unknown or stale pet data', () => {
  const petCandidates: CoursePlannerPlace[] = places.map((place, index) => ({
    ...place,
    petPolicy: index >= 2 ? 'unknown' : 'allowed',
    petDataStatus: index === 3 ? 'stale' : 'fresh',
    isPublished: true,
  }));
  assert.deepEqual(planCourseDrafts(petCandidates, { petOnly: true }), []);
});

test('unpublished candidates never enter generated courses', () => {
  const unpublished = places.map((place) => ({ ...place, isPublished: false }));
  assert.deepEqual(planCourseDrafts(unpublished), []);
});
