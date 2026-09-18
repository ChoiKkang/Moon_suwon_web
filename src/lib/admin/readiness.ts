import type { AdminPlace } from './types';

export type ReadinessBlocker =
  | 'missing_short_description'
  | 'missing_night_highlight'
  | 'missing_hero_image'
  | 'missing_coordinates'
  | 'not_approved';

export const readinessLabels: Record<ReadinessBlocker, string> = {
  missing_short_description: '한 줄 설명 없음',
  missing_night_highlight: '야간 포인트 없음',
  missing_hero_image: '대표 이미지 없음',
  missing_coordinates: '좌표 없음',
  not_approved: '검수 승인 전',
};

/**
 * What still blocks a place from being published.
 *
 * These are the same conditions the Discord publish command enforces, kept in
 * one place so the console can show an operator exactly what to fix instead of
 * only reporting that something is missing.
 */
export function publishBlockers(place: AdminPlace): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  if (!place.copy.shortDescription) blockers.push('missing_short_description');
  if (!place.copy.nightHighlight) blockers.push('missing_night_highlight');
  if (!place.heroImageUrl) blockers.push('missing_hero_image');
  if (place.lat === null || place.lng === null) blockers.push('missing_coordinates');
  if (place.ingestionStatus !== 'approved') blockers.push('not_approved');
  return blockers;
}

/** A place is publish-ready when nothing blocks it. */
export function isPublishReady(place: AdminPlace): boolean {
  return publishBlockers(place).length === 0;
}

/**
 * Ready to publish and still hidden: the operator only has to flip the switch.
 * The dashboard card and the place list filter both count this, so they share
 * one definition instead of each re-deriving it.
 */
export function isAwaitingPublish(place: AdminPlace): boolean {
  return !place.isPublished && isPublishReady(place);
}
