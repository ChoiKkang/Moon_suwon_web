export type PlaceMatchCandidate = {
  placeId: string;
  officialName: string;
  displayName: string | null;
  ktoContentId: string | null;
  isPublished: boolean;
};

export type PlaceMatchResult = {
  placeId: string | null;
  reason: 'content_id_exact' | 'unique_name' | 'place_unpublished' | 'ambiguous_name' | 'place_match_required';
};

function normalizePlaceName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function matchPublishedPlace(
  input: { contentId?: string | null; names: readonly (string | null | undefined)[] },
  places: readonly PlaceMatchCandidate[],
): PlaceMatchResult {
  const contentId = input.contentId?.trim();
  if (contentId) {
    const exact = places.find((place) => place.ktoContentId === contentId);
    if (!exact) return { placeId: null, reason: 'place_match_required' };
    return exact.isPublished
      ? { placeId: exact.placeId, reason: 'content_id_exact' }
      : { placeId: null, reason: 'place_unpublished' };
  }

  const nameKeys = new Set(
    input.names
      .map((name) => normalizePlaceName(name?.trim() ?? ''))
      .filter(Boolean),
  );
  if (nameKeys.size === 0) return { placeId: null, reason: 'place_match_required' };

  const matches = places.filter((place) =>
    [place.officialName, place.displayName]
      .map((name) => normalizePlaceName(name?.trim() ?? ''))
      .some((name) => name && nameKeys.has(name)),
  );
  const published = matches.filter((place) => place.isPublished);
  if (published.length === 1) return { placeId: published[0].placeId, reason: 'unique_name' };
  if (published.length > 1) return { placeId: null, reason: 'ambiguous_name' };
  if (matches.length > 0) return { placeId: null, reason: 'place_unpublished' };
  return { placeId: null, reason: 'place_match_required' };
}
