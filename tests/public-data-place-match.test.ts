import assert from 'node:assert/strict';
import test from 'node:test';
import { matchPublishedPlace, type PlaceMatchCandidate } from '../src/lib/public-data/place-match';

const places: PlaceMatchCandidate[] = [
  {
    placeId: '11111111-1111-4111-8111-111111111111',
    officialName: '화성행궁',
    displayName: '화성 행궁',
    ktoContentId: '126508',
    isPublished: true,
  },
  {
    placeId: '22222222-2222-4222-8222-222222222222',
    officialName: '광교호수공원',
    displayName: null,
    ktoContentId: '200002',
    isPublished: true,
  },
];

test('KTO content ID exact match wins over a different name', () => {
  assert.deepEqual(
    matchPublishedPlace({ contentId: '126508', names: ['전혀 다른 이름'] }, places),
    { placeId: '11111111-1111-4111-8111-111111111111', reason: 'content_id_exact' },
  );
});

test('opaque-source names match one published place after conservative normalization', () => {
  assert.deepEqual(
    matchPublishedPlace({ names: ['화성-행궁'] }, places),
    { placeId: '11111111-1111-4111-8111-111111111111', reason: 'unique_name' },
  );
});

test('duplicate normalized names are held instead of choosing a place', () => {
  const duplicate = {
    ...places[0],
    placeId: '33333333-3333-4333-8333-333333333333',
    ktoContentId: '300003',
  };
  assert.deepEqual(
    matchPublishedPlace({ names: ['화성행궁'] }, [...places, duplicate]),
    { placeId: null, reason: 'ambiguous_name' },
  );
});

test('an exact unpublished place never becomes a public match', () => {
  assert.deepEqual(
    matchPublishedPlace(
      { contentId: '126508', names: ['화성행궁'] },
      [{ ...places[0], isPublished: false }],
    ),
    { placeId: null, reason: 'place_unpublished' },
  );
});
