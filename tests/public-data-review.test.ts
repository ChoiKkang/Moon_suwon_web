import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reviewDurunubiCollection,
  reviewDurunubiCourse,
  reviewPhotoCandidate,
  reviewRelation,
  reviewTourismCandidate,
} from '../src/lib/public-data/review';

test('photo without copyright evidence is excluded', () => {
  assert.deepEqual(
    reviewPhotoCandidate({ sourceId: 'photo-1', address: '경기도 수원시 팔달구', imageUrl: 'https://image.test/a.jpg', copyrightCode: null, sourceUrl: null, matchedPlaceId: 'place-1' }),
    { status: 'excluded', reasons: ['copyright_missing', 'source_url_missing'] },
  );
});

test('non-Suwon tourism candidates are excluded', () => {
  const result = reviewTourismCandidate({ sourceId: 'wellness-1', address: '서울특별시 종로구', lat: 37.57, lng: 126.98, matchedPlaceId: null });
  assert.equal(result.status, 'excluded');
  assert.ok(result.reasons.includes('outside_suwon'));
});

test('ambiguous Suwon candidates are held rather than approved', () => {
  assert.deepEqual(
    reviewTourismCandidate({ sourceId: 'wellness-2', address: '경기도 수원시', lat: 37.27, lng: 127.01, matchedPlaceId: null }),
    { status: 'hold', reasons: ['place_match_required'] },
  );
});

test('self relations are excluded', () => {
  const result = reviewRelation({ originPlaceId: 'same', relatedPlaceId: 'same', originPublished: true, relatedPublished: true, score: 0.8 });
  assert.deepEqual(result, { status: 'excluded', reasons: ['self_relation'] });
});

test('Durunubi zero results remain healthy and publish nothing', () => {
  const result = reviewDurunubiCollection([]);
  assert.deepEqual(result, { status: 'approved', publishable: [], zeroResult: true });
});

test('Durunubi courses outside Suwon are excluded', () => {
  const result = reviewDurunubiCourse({ sourceId: 'course-1', intersectsSuwon: false, sourceUrl: 'https://example.test/course-1' });
  assert.deepEqual(result, { status: 'excluded', reasons: ['outside_suwon'] });
});
