import type { KtoApiResponse, KtoDetailItem, KtoImageItem, KtoListItem } from './types';

const KTO_BASE_URL = 'http://apis.data.go.kr/B551011/KorService2';

type KtoClientOptions = {
  serviceKey: string;
  mobileApp?: string;
  mobileOS?: string;
};

export class KtoClient {
  private readonly serviceKey: string;
  private readonly mobileApp: string;
  private readonly mobileOS: string;

  constructor(options: KtoClientOptions) {
    this.serviceKey = options.serviceKey;
    this.mobileApp = options.mobileApp ?? 'moon_suwon';
    this.mobileOS = options.mobileOS ?? 'ETC';
  }

  async fetchSuwonAttractions(): Promise<KtoListItem[]> {
    return this.requestItems<KtoListItem>('areaBasedList2', {
      areaCode: '31',
      sigunguCode: '13',
      contentTypeId: '12',
      numOfRows: '100',
      pageNo: '1',
    });
  }

  async fetchDetail(contentId: string): Promise<KtoDetailItem | null> {
    const items = await this.requestItems<KtoDetailItem>('detailCommon2', {
      contentId,
    });

    return items[0] ?? null;
  }

  async fetchImages(contentId: string): Promise<KtoImageItem[]> {
    return this.requestItems<KtoImageItem>('detailImage2', {
      contentId,
      numOfRows: '50',
      pageNo: '1',
    });
  }

  private async requestItems<T>(endpoint: string, params: Record<string, string>): Promise<T[]> {
    const url = new URL(`${KTO_BASE_URL}/${endpoint}`);
    url.searchParams.set('MobileOS', this.mobileOS);
    url.searchParams.set('MobileApp', this.mobileApp);
    url.searchParams.set('_type', 'json');

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set('serviceKey', this.serviceKey);

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`KTO request failed: ${endpoint} ${response.status}`);
    }

    const payload = (await response.json()) as KtoApiResponse<T>;
    const header = payload.response?.header;

    if (payload.resultCode && payload.resultCode !== '0000') {
      throw new Error(
        `KTO request failed: ${endpoint} ${payload.resultCode} ${payload.resultMsg ?? ''}`.trim(),
      );
    }

    if (header?.resultCode && header.resultCode !== '0000') {
      throw new Error(
        `KTO request failed: ${endpoint} ${header.resultCode} ${header.resultMsg ?? ''}`.trim(),
      );
    }

    const items = payload.response?.body?.items;
    const item = typeof items === 'object' ? items.item : undefined;

    if (!item) {
      return [];
    }

    return Array.isArray(item) ? item : [item];
  }
}
