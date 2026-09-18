import type { CandidateFilter, CandidateIngestionStatus } from './types';
import type { PetPolicy } from '@/lib/pet/policy';

const INGESTION_STATUSES: readonly CandidateIngestionStatus[] = ['candidate', 'approved', 'rejected', 'stale'];
const REVIEW_DECISIONS = ['approve', 'reject', 'hold'] as const;
const PET_POLICIES: readonly PetPolicy[] = ['allowed', 'partial', 'not_allowed', 'unknown'];

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isCandidateIngestionStatus(value: unknown): value is CandidateIngestionStatus {
  return typeof value === 'string' && INGESTION_STATUSES.includes(value as CandidateIngestionStatus);
}

export function validateReviewDecision(value: unknown): value is (typeof REVIEW_DECISIONS)[number] {
  return typeof value === 'string' && REVIEW_DECISIONS.includes(value as (typeof REVIEW_DECISIONS)[number]);
}

export function validatePetPolicy(value: unknown): value is PetPolicy {
  return typeof value === 'string' && PET_POLICIES.includes(value as PetPolicy);
}

export function validateReviewNote(value: unknown): value is string | null | undefined {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().length <= 240);
}

export function normalizeCandidateFilter(input?: CandidateFilter | null): Required<CandidateFilter> {
  const status = input?.status && (input.status === 'all' || isCandidateIngestionStatus(input.status)) ? input.status : 'all';
  const search = typeof input?.search === 'string' ? input.search.trim().slice(0, 120) : '';
  return { status, search };
}

export function candidateMatchesFilter(candidate: {
  ingestionStatus: CandidateIngestionStatus;
  displayName: string;
  officialName: string;
  slug: string;
  ktoContentId: string | null;
}, input?: CandidateFilter | null): boolean {
  const filter = normalizeCandidateFilter(input);
  if (filter.status !== 'all' && candidate.ingestionStatus !== filter.status) return false;
  if (!filter.search) return true;
  return [candidate.displayName, candidate.officialName, candidate.slug, candidate.ktoContentId ?? '']
    .join(' ')
    .toLocaleLowerCase('ko-KR')
    .includes(filter.search.toLocaleLowerCase('ko-KR'));
}

