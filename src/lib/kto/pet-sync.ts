import type { KtoPage, KtoPetListItem } from './types';

export type PetDiscoveryConfig = {
  areaCode: string;
  sigunguCodes: string[];
  contentTypeIds: string[];
  pageSize?: number;
  limit?: number;
};

export type PetPageClient = {
  fetchPetTourPage(options: {
    areaCode: string;
    sigunguCode: string;
    contentTypeId: string;
    pageNo: number;
    numOfRows: number;
  }): Promise<KtoPage<KtoPetListItem>>;
};

export type PetEnrichmentRow = {
  kto_content_id: string;
  source_modified_at: string | null;
  source_updated_at?: string | null;
  last_pet_checked_at: string | null;
  data_status: string | null;
  is_published?: boolean;
};

export async function paginatePetCandidates(
  client: PetPageClient,
  config: PetDiscoveryConfig,
): Promise<KtoPetListItem[]> {
  const pageSize = Math.max(1, Math.min(config.pageSize ?? 100, 1000));
  const limit = config.limit === undefined ? null : Math.max(0, config.limit);
  const seen = new Set<string>();
  const candidates: KtoPetListItem[] = [];

  if (limit === 0) return candidates;

  for (const sigunguCode of config.sigunguCodes) {
    for (const contentTypeId of config.contentTypeIds) {
      let pageNo = 1;

      while (true) {
        const page = await client.fetchPetTourPage({
          areaCode: config.areaCode,
          sigunguCode,
          contentTypeId,
          pageNo,
          numOfRows: pageSize,
        });

        for (const item of page.items) {
          if (!item.contentid || seen.has(item.contentid)) continue;
          seen.add(item.contentid);
          Object.defineProperties(item, {
            __areaCode: { value: config.areaCode, enumerable: false },
            __sigunguCode: { value: sigunguCode, enumerable: false },
            __contentTypeId: { value: contentTypeId, enumerable: false },
          });
          candidates.push(item);
          if (limit !== null && candidates.length >= limit) return candidates;
        }

        const rowsPerPage = page.numOfRows || pageSize;
        const totalCount = page.totalCount || page.items.length;
        if (page.items.length === 0 || pageNo * rowsPerPage >= totalCount) break;
        pageNo += 1;
      }
    }
  }

  return candidates;
}

export function selectPetEnrichment(
  rows: PetEnrichmentRow[],
  now = new Date(),
  maxAgeHours = 24 * 30,
): PetEnrichmentRow[] {
  return rows.filter((row) => {
    if (!row.last_pet_checked_at) return true;

    const status = row.data_status?.toLowerCase();
    if (status === 'stale' || status === 'unavailable' || status === 'unknown') return true;

    if (
      row.source_modified_at &&
      row.source_updated_at &&
      Date.parse(row.source_modified_at) > Date.parse(row.source_updated_at)
    ) {
      return true;
    }

    const checkedAt = Date.parse(row.last_pet_checked_at);
    return Number.isNaN(checkedAt)
      || now.getTime() - checkedAt > maxAgeHours * 60 * 60 * 1000;
  }).sort((left, right) => {
    const publishedDifference = Number(Boolean(right.is_published)) - Number(Boolean(left.is_published));
    if (publishedDifference !== 0) return publishedDifference;
    const leftUnchecked = left.last_pet_checked_at ? 1 : 0;
    const rightUnchecked = right.last_pet_checked_at ? 1 : 0;
    if (leftUnchecked !== rightUnchecked) return leftUnchecked - rightUnchecked;
    return 0;
  });
}

export type SyncStatusInput = {
  configurationMissing?: boolean;
  listRequestFailed?: boolean;
  itemErrors: number;
  itemsAttempted: number;
  validEmpty: number;
};

export type SyncStatus = 'completed' | 'partial' | 'failed';

export function classifySyncStatus(stats: SyncStatusInput): SyncStatus {
  if (stats.configurationMissing || stats.listRequestFailed) return 'failed';
  if (stats.itemErrors > 0) return 'partial';
  return 'completed';
}
