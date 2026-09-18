import type { PetPolicy } from '@/lib/pet/policy';

export type ValidatedCourseStop = {
  placeId: string;
  displayName: string;
  evidence: string[];
  petPolicy?: PetPolicy;
};

export type ValidatedCourseCandidate = {
  theme: string;
  placeIds: string[];
  stops: ValidatedCourseStop[];
  distanceKm: number;
  distanceKind: 'straight_line_estimate' | 'routed';
  petReadyFlag: boolean;
  verifiedFacts?: string[];
};

export type CourseCopyDraft = {
  title: string;
  subtitle: string;
  summary: string;
  stopReasons: Array<{ placeId: string; text: string }>;
  warnings: string[];
};

function textLength(value: unknown, max: number): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

function numbersIn(value: string): string[] {
  return value.match(/\d+(?:\.\d+)?/g) ?? [];
}

export function validateCourseCopy(
  candidate: ValidatedCourseCandidate,
  output: CourseCopyDraft,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const candidateIds = new Set(candidate.placeIds);
  const stopReasonIds = new Set((output.stopReasons ?? []).map((reason) => reason.placeId));
  const verifiedNumbers = new Set([
    candidate.distanceKm.toFixed(2),
    String(candidate.distanceKm),
    ...candidate.stops.flatMap((stop) => stop.evidence.flatMap(numbersIn)),
    ...(candidate.verifiedFacts ?? []).flatMap(numbersIn),
  ]);

  if (!textLength(output.title, 120)) errors.push('title is required and must be <= 120 characters');
  if (!textLength(output.subtitle, 180)) errors.push('subtitle is required and must be <= 180 characters');
  if (!textLength(output.summary, 500)) errors.push('summary is required and must be <= 500 characters');
  if (!Array.isArray(output.stopReasons) || output.stopReasons.length !== candidate.placeIds.length) errors.push('one stop reason is required for every place');
  if (!Array.isArray(output.warnings) || output.warnings.length === 0) errors.push('at least one warning is required');

  for (const reason of output.stopReasons ?? []) {
    if (!candidateIds.has(reason.placeId)) errors.push(`unknown place id: ${reason.placeId}`);
    if (!textLength(reason.text, 240)) errors.push(`stop reason is invalid: ${reason.placeId}`);
  }
  for (const placeId of candidate.placeIds) {
    if (!stopReasonIds.has(placeId)) errors.push(`missing stop reason: ${placeId}`);
  }

  const allCopy = [output.title, output.subtitle, output.summary, ...(output.stopReasons ?? []).map((reason) => reason.text)].join(' ');
  for (const number of numbersIn(allCopy)) {
    if (![...verifiedNumbers].some((allowed) => allowed.includes(number) || number === allowed)) {
      errors.push(`unsupported numeric fact: ${number}`);
    }
  }

  const lowerCopy = allCopy.toLocaleLowerCase('ko-KR');
  if (!candidate.petReadyFlag && /반려동물|애견|강아지|고양이|pet/.test(lowerCopy)) {
    errors.push('unsupported pet claim');
  }
  if (candidate.distanceKind === 'straight_line_estimate' && !(output.warnings ?? []).some((warning) => /직선|추정|도보|실제/.test(warning))) {
    errors.push('straight-line distance warning is required');
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
