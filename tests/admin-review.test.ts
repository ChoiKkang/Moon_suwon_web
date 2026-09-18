import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateMatchesFilter,
  isUuid,
  normalizeCandidateFilter,
  validatePetPolicy,
  validateReviewDecision,
  validateReviewNote,
} from '../src/lib/admin/review';

const candidate = {
  ingestionStatus: 'candidate' as const,
  displayName: '화성행궁',
  officialName: '수원 화성행궁',
  slug: 'hwaseong-haenggung',
  ktoContentId: '126508',
};

test('validates review decisions, UUIDs, policies, and bounded notes', () => {
  assert.equal(validateReviewDecision('approve'), true);
  assert.equal(validateReviewDecision('publish'), false);
  assert.equal(validatePetPolicy('unknown'), true);
  assert.equal(validatePetPolicy('maybe'), false);
  assert.equal(isUuid('00000000-0000-4000-8000-000000000001'), true);
  assert.equal(isUuid('not-a-uuid'), false);
  assert.equal(validateReviewNote('운영자가 확인함'), true);
  assert.equal(validateReviewNote('x'.repeat(241)), false);
});

test('normalizes candidate filters and matches Korean/search fields', () => {
  assert.deepEqual(normalizeCandidateFilter({ status: 'stale', search: ' 행궁 ' }), { status: 'stale', search: '행궁' });
  assert.equal(candidateMatchesFilter(candidate, { status: 'candidate', search: '126508' }), true);
  assert.equal(candidateMatchesFilter(candidate, { status: 'approved' }), false);
  assert.equal(candidateMatchesFilter(candidate, { search: '없는 장소' }), false);
});

