import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPublishReady, publishBlockers } from '@/lib/admin/readiness';
import type { AdminPlace } from '@/lib/admin/types';

function place(overrides: Partial<AdminPlace> = {}): AdminPlace {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'banghwasuryujeong',
    officialName: '방화수류정',
    displayName: '방화수류정',
    addressFull: '경기도 수원시',
    lat: 37.28,
    lng: 127.02,
    contactPhone: null,
    sourceOverviewRaw: null,
    category: null,
    ktoContentId: '2613658',
    ktoContentTypeId: '12',
    ingestionStatus: 'approved',
    firstSeenAt: null,
    lastSeenAt: null,
    petPolicy: 'unknown',
    petDataStatus: 'unknown',
    petNote: null,
    petSourceUpdatedAt: null,
    petManualOverride: false,
    heroImageUrl: 'https://tong.visitkorea.or.kr/hero.jpg',
    sourceModifiedAt: null,
    isActive: true,
    isPublished: false,
    displayPriority: 0,
    isNowGoodEnabled: false,
    nightSuitabilityScore: 0,
    recommendedFrom: null,
    recommendedUntil: null,
    recommendationBoost: 0,
    opsMemo: null,
    updatedAt: null,
    copy: {
      id: null,
      displayName: '방화수류정',
      shortDescription: '용연 위에 앉은 정자',
      nightHighlight: '수면에 비친 조명 반영',
      photoTip: null,
      missionTitle: null,
      missionBody: null,
      missionPrompt: null,
      coupleQuestion: null,
      shortStory: null,
    },
    ...overrides,
  };
}

test('reports no blockers when every publish condition is met', () => {
  assert.deepEqual(publishBlockers(place()), []);
  assert.equal(isPublishReady(place()), true);
});

test('flags missing editorial copy separately', () => {
  const missingHighlight = place({ copy: { ...place().copy, nightHighlight: null } });
  assert.deepEqual(publishBlockers(missingHighlight), ['missing_night_highlight']);
});

test('treats an unapproved candidate as not publishable', () => {
  assert.deepEqual(publishBlockers(place({ ingestionStatus: 'candidate' })), ['not_approved']);
  assert.equal(isPublishReady(place({ ingestionStatus: 'candidate' })), false);
});

test('collects every blocker for an empty record', () => {
  const bare = place({
    heroImageUrl: null,
    lat: null,
    lng: null,
    ingestionStatus: 'candidate',
    copy: { ...place().copy, shortDescription: null, nightHighlight: null },
  });
  assert.deepEqual(publishBlockers(bare), [
    'missing_short_description',
    'missing_night_highlight',
    'missing_hero_image',
    'missing_coordinates',
    'not_approved',
  ]);
});
