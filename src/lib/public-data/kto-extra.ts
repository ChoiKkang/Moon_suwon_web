import { PublicDataClient, collectPages, type PublicDataPage } from './client';

export const SUWON_ADMIN_DISTRICT_CODES = ['41111', '41113', '41115', '41117'] as const;
export type SuwonDistrictCode = typeof SUWON_ADMIN_DISTRICT_CODES[number];
export type ExtraSource = 'photo' | 'wellness' | 'localHub' | 'related' | 'durunubi' | 'visitors';

export type PageRequester = {
  requestPage(endpoint: string, params: Record<string, string>): Promise<PublicDataPage<Record<string, string>>>;
};

export type KtoPhotoItem = Record<string, string> & { galContentId: string };
export type KtoWellnessItem = Record<string, string> & { contentId?: string; contentid?: string; title?: string };
export type KtoLocalHubItem = Record<string, string> & { hubTatsCd?: string; hubTatsNm?: string };
export type KtoRelatedItem = Record<string, string> & { baseYm?: string; signguCd?: string };
export type DurunubiItem = Record<string, string> & { crsIdx?: string; crsKorNm?: string };
export type RegionalVisitorItem = Record<string, string> & {
  baseYmd: string;
  signguCode: string;
  touDivNm: string;
  sourceItemKey: string;
};

export type ScopedCollection<T> = {
  items: T[];
  scopeCounts: Record<SuwonDistrictCode, number>;
  zeroDistricts: SuwonDistrictCode[];
};

type KtoExtraRequesters = {
  photo: PageRequester;
  wellness: PageRequester;
  localHub: PageRequester;
  related: PageRequester;
  durunubi: PageRequester;
  visitors: PageRequester;
};

const PAGE_SIZE = 100;

function asTyped<T>(items: Record<string, string>[]): T[] {
  return items as T[];
}

function firstKey(item: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = item[key]?.trim();
    if (value) return value;
  }
  return '';
}

export function createKtoExtraClient(serviceKey: string): KtoExtraClient {
  const commonParams = { MobileOS: 'ETC', MobileApp: 'moon_suwon', _type: 'json' };
  const requester = (baseUrl: string): PageRequester => new PublicDataClient({ baseUrl, serviceKey, commonParams });
  return new KtoExtraClient({
    photo: requester('https://apis.data.go.kr/B551011/PhotoGalleryService1'),
    wellness: requester('https://apis.data.go.kr/B551011/WellnessTursmService'),
    localHub: requester('https://apis.data.go.kr/B551011/LocgoHubTarService1'),
    related: requester('https://apis.data.go.kr/B551011/TarRlteTarService1'),
    durunubi: requester('https://apis.data.go.kr/B551011/Durunubi'),
    visitors: requester('https://apis.data.go.kr/B551011/DataLabService'),
  });
}

export class KtoExtraClient {
  constructor(private readonly requesters: KtoExtraRequesters) {}

  async fetchPhotos(options: { keyword: string; limit?: number }): Promise<KtoPhotoItem[]> {
    const rows = await collectPages({
      fetchPage: (pageNo) => this.requesters.photo.requestPage('gallerySearchList1', {
        keyword: options.keyword,
        arrange: 'A',
        pageNo: String(pageNo),
        numOfRows: String(PAGE_SIZE),
      }),
      identity: (item) => firstKey(item, ['galContentId', 'galContentid', 'contentid']),
      limit: options.limit,
    });
    return asTyped<KtoPhotoItem>(rows);
  }

  async fetchWellness(options: { mapX: number; mapY: number; radiusM: number; limit?: number }): Promise<KtoWellnessItem[]> {
    const rows = await collectPages({
      fetchPage: (pageNo) => this.requesters.wellness.requestPage('locationBasedList', {
        langDivCd: 'KOR',
        mapX: String(options.mapX),
        mapY: String(options.mapY),
        radius: String(options.radiusM),
        arrange: 'E',
        pageNo: String(pageNo),
        numOfRows: String(PAGE_SIZE),
      }),
      identity: (item) => firstKey(item, ['contentid', 'contentId', 'title']),
      limit: options.limit,
    });
    return asTyped<KtoWellnessItem>(rows);
  }

  async fetchLocalHub(options: { baseMonth: string; limit?: number }): Promise<ScopedCollection<KtoLocalHubItem>> {
    return this.fetchDistrictCollection('localHub', 'areaBasedList1', options, ['hubTatsCd', 'contentid', 'hubTatsNm']);
  }

  async fetchRelated(options: { baseMonth: string; limit?: number }): Promise<ScopedCollection<KtoRelatedItem>> {
    return this.fetchDistrictCollection('related', 'areaBasedList1', options, ['tAtsCd', 'rlteTatsCd', 'contentid', 'tAtsNm']) as Promise<ScopedCollection<KtoRelatedItem>>;
  }

  async fetchDurunubi(options: { limit?: number } = {}): Promise<DurunubiItem[]> {
    const rows = await collectPages({
      fetchPage: (pageNo) => this.requesters.durunubi.requestPage('courseList', {
        pageNo: String(pageNo),
        numOfRows: String(PAGE_SIZE),
      }),
      identity: (item) => firstKey(item, ['crsIdx', 'crsNo', 'crsKorNm']),
      limit: options.limit,
    });
    return asTyped<DurunubiItem>(rows);
  }

  async fetchRegionalVisitors(options: {
    startDate: string;
    endDate: string;
    districtCodes?: readonly string[];
    limit?: number;
  }): Promise<RegionalVisitorItem[]> {
    const rows: RegionalVisitorItem[] = [];
    const seen = new Set<string>();
    const districtCodes = options.districtCodes ? new Set(options.districtCodes) : null;

    for (let pageNo = 1; pageNo <= 1_000; pageNo += 1) {
      const page = await this.requesters.visitors.requestPage('locgoRegnVisitrDDList', {
        startYmd: options.startDate,
        endYmd: options.endDate,
        pageNo: String(pageNo),
        numOfRows: '1000',
      });

      for (const item of page.items) {
        const signguCode = item.signguCode ?? item.signguCd;
        if (districtCodes && !districtCodes.has(signguCode)) continue;
        const touDivNm = item.touDivNm ?? item.visitorType;
        const sourceItemKey = [item.baseYmd, signguCode, touDivNm].join(':');
        if (!item.baseYmd || !signguCode || !touDivNm || seen.has(sourceItemKey)) continue;
        seen.add(sourceItemKey);
        rows.push({ ...item, signguCode, touDivNm, sourceItemKey } as RegionalVisitorItem);
        if (options.limit !== undefined && rows.length >= options.limit) return rows;
      }

      if (page.items.length === 0) break;
      if (page.numOfRows > 0 && page.items.length < page.numOfRows) break;
      if (page.numOfRows > 0 && pageNo * page.numOfRows >= page.totalCount) break;
    }

    return rows;
  }

  private async fetchDistrictCollection<T extends KtoLocalHubItem>(
    source: 'localHub' | 'related',
    endpoint: string,
    options: { baseMonth: string; limit?: number },
    identityKeys: string[],
  ): Promise<ScopedCollection<T>> {
    const items: T[] = [];
    const seen = new Set<string>();
    const scopeCounts = {} as Record<SuwonDistrictCode, number>;
    const zeroDistricts: SuwonDistrictCode[] = [];

    for (const districtCode of SUWON_ADMIN_DISTRICT_CODES) {
      const remaining = options.limit === undefined ? undefined : Math.max(0, options.limit - items.length);
      if (remaining === 0) {
        scopeCounts[districtCode] = 0;
        continue;
      }
      const rows = await collectPages({
        fetchPage: (pageNo) => this.requesters[source].requestPage(endpoint, {
          baseYm: options.baseMonth,
          areaCd: '41',
          signguCd: districtCode,
          pageNo: String(pageNo),
          numOfRows: String(PAGE_SIZE),
        }),
        identity: (item) => {
          const sourceKey = source === 'related'
            ? `${firstKey(item, ['tAtsCd', 'originId', 'tAtsNm'])}:${firstKey(item, ['rlteTatsCd', 'relatedId', 'rlteTatsNm'])}`
            : firstKey(item, identityKeys);
          return `${districtCode}:${sourceKey}`;
        },
        limit: remaining,
      });
      scopeCounts[districtCode] = rows.length;
      if (rows.length === 0) zeroDistricts.push(districtCode);
      for (const row of rows) {
        const key = source === 'related'
          ? `${firstKey(row, ['tAtsCd', 'originId', 'tAtsNm'])}:${firstKey(row, ['rlteTatsCd', 'relatedId', 'rlteTatsNm'])}`
          : firstKey(row, identityKeys);
        const scopedKey = `${districtCode}:${key}`;
        if (!key || seen.has(scopedKey)) continue;
        seen.add(scopedKey);
        items.push(...asTyped<T>([{ ...row, signguCd: districtCode }]));
      }
    }

    return { items, scopeCounts, zeroDistricts };
  }
}
