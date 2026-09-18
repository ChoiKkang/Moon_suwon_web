import type {
  KtoApiResponse,
  KtoCrowdForecastItem,
  KtoDetailItem,
  KtoFestivalItem,
  KtoImageItem,
  KtoIntroItem,
  KtoListItem,
  KtoPage,
  KtoPetListItem,
  KtoPetTourItem,
} from './types';

const KTO_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const PET_BASE_URL = 'https://apis.data.go.kr/B551011/KorPetTourService2';
const CROWD_BASE_URL = 'https://apis.data.go.kr/B551011/TatsCnctrRateService';
const REQUEST_TIMEOUT_MS = 20_000;
const PET_REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;

export class KtoApiError extends Error {
  readonly endpoint: string;
  readonly status: number | null;
  readonly resultCode: string | null;

  constructor(endpoint: string, message: string, status: number | null = null, resultCode: string | null = null) {
    super(message);
    this.name = 'KtoApiError';
    this.endpoint = endpoint;
    this.status = status;
    this.resultCode = resultCode;
  }
}

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

  // detailIntro2 carries usetime/restdate, which the course planner needs to
  // avoid recommending a place that closes before the evening start time.
  async fetchIntro(contentId: string, contentTypeId = '12'): Promise<KtoIntroItem | null> {
    const items = await this.requestItems<KtoIntroItem>('detailIntro2', {
      contentId,
      contentTypeId,
    });

    return items[0] ?? null;
  }

  async fetchPetDetail(contentId: string): Promise<KtoPetTourItem | null> {
    const items = await this.requestItems<KtoPetTourItem>('detailPetTour2', {
      contentId,
      numOfRows: '1',
      pageNo: '1',
    }, PET_BASE_URL, PET_REQUEST_TIMEOUT_MS);

    return items[0] ?? null;
  }

  async fetchPetTourPage(options: {
    areaCode: string;
    sigunguCode: string;
    contentTypeId: string;
    pageNo: number;
    numOfRows: number;
  }): Promise<KtoPage<KtoPetListItem>> {
    return this.requestPage<KtoPetListItem>(
      'petTourSyncList2',
      {
        // KorPetTourService2 filters the legal-dong codes even though the
        // portal UI labels them as area/sigungu codes.
        lDongRegnCd: options.areaCode,
        lDongSignguCd: options.sigunguCode,
        contentTypeId: options.contentTypeId,
        numOfRows: String(options.numOfRows),
        pageNo: String(options.pageNo),
      },
      PET_BASE_URL,
      PET_REQUEST_TIMEOUT_MS,
    );
  }

  async fetchSuwonFestivals(options: {
    eventStartDate: string;
    eventEndDate: string;
    pageNo: number;
    numOfRows: number;
  }): Promise<KtoPage<KtoFestivalItem>> {
    // searchFestival2 currently returns zero rows whenever areaCode/sigunguCode
    // are supplied, and its response items carry empty areacode/sigungucode
    // fields. Request the nationwide festival list and select Suwon by address
    // so scheduled syncs keep finding local events.
    return this.requestPage<KtoFestivalItem>('searchFestival2', {
      eventStartDate: options.eventStartDate,
      eventEndDate: options.eventEndDate,
      numOfRows: String(options.numOfRows),
      pageNo: String(options.pageNo),
    });
  }

  async fetchCrowdForecasts(options: { areaCode?: string; sigunguCode?: string } = {}): Promise<KtoCrowdForecastItem[]> {
    return this.requestItems<KtoCrowdForecastItem>(
      'tatsCnctrRatedList',
      {
        areaCd: options.areaCode ?? '41',
        signguCd: options.sigunguCode ?? '41115',
        numOfRows: '1000',
        pageNo: '1',
      },
      CROWD_BASE_URL,
    );
  }

  private async requestItems<T>(
    endpoint: string,
    params: Record<string, string>,
    baseUrl = KTO_BASE_URL,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T[]> {
    const page = await this.requestPage<T>(endpoint, params, baseUrl, timeoutMs);
    return page.items;
  }

  private async requestPage<T>(
    endpoint: string,
    params: Record<string, string>,
    baseUrl = KTO_BASE_URL,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<KtoPage<T>> {
    const url = new URL(`${baseUrl}/${endpoint}`);
    url.searchParams.set('MobileOS', this.mobileOS);
    url.searchParams.set('MobileApp', this.mobileApp);
    url.searchParams.set('_type', 'json');

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    url.searchParams.set('serviceKey', this.serviceKey);

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });

        if (!response.ok) {
          let resultCode: string | null = null;
          let resultMessage: string | null = null;
          try {
            const errorPayload = (await response.json()) as KtoApiResponse<T>;
            resultCode = errorPayload.resultCode ?? errorPayload.response?.header?.resultCode ?? null;
            resultMessage = errorPayload.resultMsg ?? errorPayload.response?.header?.resultMsg ?? null;
          } catch {
            // Some gateway errors return HTML or an empty body. Keep the
            // status-only message and never include the request URL.
          }

          const error = new KtoApiError(
            endpoint,
            `KTO request failed: ${endpoint} ${resultCode ?? `HTTP ${response.status}`}${resultMessage ? ` ${resultMessage}` : ''}`,
            response.status,
            resultCode,
          );
          if (response.status < 500 && response.status !== 429) {
            throw error;
          }
          lastError = error;
        } else {
          const payload = (await response.json()) as KtoApiResponse<T>;
          const header = payload.response?.header;
          const resultCode = payload.resultCode ?? header?.resultCode;
          const resultMessage = payload.resultMsg ?? header?.resultMsg;

          if (resultCode && resultCode !== '0000') {
            throw new KtoApiError(
              endpoint,
              `KTO request failed: ${endpoint} ${resultCode}${resultMessage ? ` ${resultMessage}` : ''}`,
              response.status,
              resultCode,
            );
          }

          const body = payload.response?.body;
          const items = body?.items;
          const item = items && typeof items === 'object' ? items.item : undefined;

          if (!item) {
            return {
              items: [],
              totalCount: Number(body?.totalCount ?? 0) || 0,
              pageNo: Number(body?.pageNo ?? params.pageNo ?? 1) || 1,
              numOfRows: Number(body?.numOfRows ?? params.numOfRows ?? 0) || 0,
            };
          }

          return {
            items: (Array.isArray(item) ? item : [item]) as T[],
            totalCount: Number(body?.totalCount ?? 0) || 0,
            pageNo: Number(body?.pageNo ?? params.pageNo ?? 1) || 1,
            numOfRows: Number(body?.numOfRows ?? params.numOfRows ?? 0) || 0,
          };
        }
      } catch (error: unknown) {
        if (error instanceof KtoApiError && error.status !== null && error.status < 500 && error.status !== 429) {
          throw error;
        }
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }

    if (lastError instanceof KtoApiError) {
      throw lastError;
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new KtoApiError(endpoint, `KTO request failed: ${endpoint} ${message}`);
  }
}
