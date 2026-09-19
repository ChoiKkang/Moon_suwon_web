export type CoverageRunInput = {
  attempted: number;
  succeeded: number;
  changed: number;
  errors: number;
  requestFailed?: boolean;
};

export function classifyCoverageRun(input: CoverageRunInput): 'completed' | 'partial' | 'failed' {
  if (input.requestFailed) return 'failed';
  if (input.errors > 0 || input.succeeded < input.attempted) return 'partial';
  return 'completed';
}

export function applyProcessingLimit<T>(items: readonly T[], limit: number | null): {
  selected: T[];
  limited: boolean;
  undispatchedCount: number;
} {
  const normalizedLimit = limit === null ? items.length : Math.max(0, limit);
  const selected = items.slice(0, normalizedLimit);
  return {
    selected,
    limited: selected.length < items.length,
    undispatchedCount: Math.max(0, items.length - selected.length),
  };
}

export type CrowdCoverageRow = {
  tourist_attraction_name: string;
  forecast_date: string;
  sigungu_code: string;
};

export type CrowdPlace = {
  place_id: string;
  official_name: string;
  is_published: boolean;
};

function normalizedName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s\p{P}\p{S}]+/gu, '');
}

export function matchCrowdCoverage(rows: readonly CrowdCoverageRow[], places: readonly CrowdPlace[]) {
  const publishedByName = new Map<string, Set<string>>();
  for (const place of places) {
    if (!place.is_published) continue;
    const key = normalizedName(place.official_name);
    const ids = publishedByName.get(key) ?? new Set<string>();
    ids.add(place.place_id);
    publishedByName.set(key, ids);
  }

  const matchedPlaceIds = new Set<string>();
  const attractionNames = new Set<string>();
  const unmatchedNames = new Set<string>();
  const ambiguousNames = new Set<string>();
  const forecastDates = new Set<string>();
  const scopeCounts: Record<string, number> = {};

  for (const row of rows) {
    const nameKey = normalizedName(row.tourist_attraction_name);
    attractionNames.add(nameKey);
    forecastDates.add(row.forecast_date);
    scopeCounts[row.sigungu_code] = (scopeCounts[row.sigungu_code] ?? 0) + 1;
    const matches = publishedByName.get(nameKey);
    if (matches?.size === 1) {
      matchedPlaceIds.add([...matches][0]);
    } else {
      unmatchedNames.add(nameKey);
      if (matches && matches.size > 1) ambiguousNames.add(nameKey);
    }
  }

  return {
    matchedPlaceCount: matchedPlaceIds.size,
    unmatchedAttractionCount: unmatchedNames.size,
    ambiguousAttractionCount: ambiguousNames.size,
    forecastDateCount: forecastDates.size,
    scopeCounts,
    attractionCount: attractionNames.size,
  };
}
