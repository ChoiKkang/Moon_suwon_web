export type PetPolicy = 'allowed' | 'partial' | 'not_allowed' | 'unknown';

export type DataFreshness = 'fresh' | 'stale' | 'unavailable' | 'unknown';

const NOTE_FIELDS = [
  'acmpyPsblCpam',
  'acmpyNeedMtr',
  'etcAcmpyInfo',
  'acmpyTypeCd',
  'relaAcdntRiskMtr',
  'relaPosesFclty',
  'relaRntlPrdlst',
  'relaFrnshPrdlst',
  'relaPurcPrdlst',
] as const;

const clean = (value: unknown): string =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';

/**
 * Convert the free-text values returned by KorPetTourService2 into the small
 * vocabulary shared by the web and the mobile app. Unknown is intentional:
 * an empty KTO response must not be presented as a permissive policy.
 */
export function normalizePetPolicy(
  typeCode: string | null | undefined,
  possibleText: string | null | undefined,
): PetPolicy {
  const type = clean(typeCode).toLowerCase();
  const possible = clean(possibleText).toLowerCase();
  const text = `${type} ${possible}`.trim();

  if (!text) return 'unknown';

  if (
    /불가|불허|금지|출입\s*제한|동반\s*제한|동반\s*불허|not\s*allowed|no\s*pets/.test(
      text,
    )
  ) {
    return 'not_allowed';
  }

  if (/일부|제한|조건|문의|소형|대형|실내|실외|부분|partial|restricted/.test(text)) {
    return 'partial';
  }

  if (/가능|허용|동반|welcome|allowed|yes/.test(text)) {
    return 'allowed';
  }

  return 'unknown';
}

/** Build a compact, deterministic display note from KTO's pet fields. */
export function buildPetNote(payload: Record<string, unknown>): string | null {
  const parts = NOTE_FIELDS.map((field) => clean(payload[field])).filter(Boolean);
  if (parts.length === 0) return null;

  const note = parts.join(' · ');
  return note.length > 240 ? note.slice(0, 240) : note;
}

export function freshnessFromCheckedAt(
  checkedAt: string | null | undefined,
  now = new Date(),
  maxAgeHours = 48,
): DataFreshness {
  if (!checkedAt) return 'unknown';

  const timestamp = Date.parse(checkedAt);
  if (Number.isNaN(timestamp)) return 'unknown';

  const ageMs = now.getTime() - timestamp;
  return ageMs <= maxAgeHours * 60 * 60 * 1000 ? 'fresh' : 'stale';
}
