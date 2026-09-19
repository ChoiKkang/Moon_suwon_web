import type {
  KtoApiResponse,
  KtoAudioStoryItem,
  KtoCrowdForecastItem,
  KtoDetailItem,
  KtoFestivalItem,
  KtoImageItem,
  KtoIntroItem,
  KtoListItem,
  KtoPage,
  KtoPetListItem,
  KtoPetTourItem,
  KtoWithTourItem,
} from './types';

const KTO_BASE_URL = 'https://apis.data.go.kr/B551011/KorService2';
const PET_BASE_URL = 'https://apis.data.go.kr/B551011/KorPetTourService2';
// 무장애 여행 정보는 별도 서비스다. KorService2에는 detailWithTour2가 없다.
const WITH_BASE_URL = 'https://apis.data.go.kr/B551011/KorWithService2';
// 오디오 가이드는 오디(Odii) 서비스다. 오퍼레이션 이름과 langCode 표기가 다른
// 서비스와 달라서 소문자 'ko'만 값을 돌려준다. 'Kor'이나 'KOR'을 보내면
// resultCode 0000에 0건으로 응답해 조용히 빈 결과가 된다.
const ODII_BASE_URL = 'https://apis.data.go.kr/B551011/Odii';
const ODII_LANG_CODE = 'ko';
const CROWD_BASE_URL = 'https://apis.data.go.kr/B551011/TatsCnctrRateService';
const REQUEST_TIMEOUT_MS = 20_000;
// KorPetTourService2 is the slowest of the three services. Its old 15s budget
// was shorter than the default, so slow-but-healthy replies were aborted and
// logged as sync errors. Healthy replies measured well under 1s, so the extra
// room only covers genuinely slow responses.
const PET_REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;
// Retries multiply the per-attempt timeout, which can outlive the sync
// workflow's 30 minute budget when a whole batch stalls. Cap the total time
// spent on one logical request so a degraded upstream fails fast enough for the
// run to finish and report errors instead of being killed mid-run.
const MAX_TOTAL_REQUEST_MS = 45_000;
// Suwon in the legal-dong code system: region 41 (경기도), districts 111 장안구,
// 113 권선구, 115 팔달구, 117 영통구. The pet service already filters on these,
// and the content service needs them too because newer rows carry no legacy
// areaCode.
const SUWON_LDONG_REGION_CODE = '41';
const SUWON_LDONG_DISTRICT_CODES = ['111', '113', '115', '117'] as const;

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

  /**
   * Every Suwon item for one content type, following pagination.
   *
   * The previous single-page call was fine for 관광지(12) at 39 rows but silently
   * truncated any larger type: 음식점(39) alone returns 186. Walk the pages until
   * totalCount is covered so a type is either fully collected or not requested.
   *
   * Queries the legal-dong codes per district rather than the legacy
   * areaCode/sigunguCode pair. KTO is migrating to lDongRegnCd/lDongSignguCd and
   * leaves the legacy fields blank on newer rows, so the old query returned
   * barely half of what Suwon actually has: 관광지 39 of 84, 문화시설 19 of 42.
   * Among the rows it never saw were 수원화성 성곽길, 수원 화령전 and the 삼남길
   * walking course, all of which belong in a night walking service.
   */
  async fetchSuwonContentByType(contentTypeId: string, pageSize = 100): Promise<KtoListItem[]> {
    const collected: KtoListItem[] = [];
    const seen = new Set<string>();

    for (const districtCode of SUWON_LDONG_DISTRICT_CODES) {
      let districtCount = 0;

      for (let pageNo = 1; ; pageNo += 1) {
        const page = await this.requestPage<KtoListItem>('areaBasedList2', {
          lDongRegnCd: SUWON_LDONG_REGION_CODE,
          lDongSignguCd: districtCode,
          contentTypeId,
          numOfRows: String(pageSize),
          pageNo: String(pageNo),
        });

        if (page.items.length === 0) break;

        for (const item of page.items) {
          // A contentid can repeat across pages when upstream ordering shifts
          // mid-walk, and the district loops can overlap on boundary rows.
          if (item.contentid && !seen.has(item.contentid)) {
            seen.add(item.contentid);
            collected.push(item);
          }
        }

        districtCount += page.items.length;
        if (districtCount >= page.totalCount || page.items.length < pageSize) break;
      }
    }

    return collected;
  }

  async fetchSuwonAttractions(): Promise<KtoListItem[]> {
    return this.fetchSuwonContentByType('12');
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

  /**
   * 장소별 무장애 여행 정보. 값이 없는 장소도 HTTP 200에 빈 items로 응답하므로
   * null과 "데이터 없음"을 같게 취급한다.
   */
  async fetchAccessibility(contentId: string): Promise<KtoWithTourItem | null> {
    const items = await this.requestItems<KtoWithTourItem>('detailWithTour2', {
      contentId,
      numOfRows: '1',
      pageNo: '1',
    }, WITH_BASE_URL);

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

  /**
   * 수원 일대의 오디오 해설 전체. 좌표 기반 조회만 가능해 화성행궁을 중심으로
   * 반경을 넓게 잡고 받은 뒤, 장소 연결은 호출한 쪽에서 좁힌다.
   *
   * 상류가 한 페이지에 100건까지만 주므로 totalCount를 채울 때까지 넘긴다.
   */
  async fetchAudioStoriesNear(options: {
    mapX: number;
    mapY: number;
    radiusM: number;
    pageSize?: number;
  }): Promise<KtoAudioStoryItem[]> {
    const pageSize = options.pageSize ?? 100;
    const collected: KtoAudioStoryItem[] = [];
    const seen = new Set<string>();

    for (let pageNo = 1; ; pageNo += 1) {
      const page = await this.requestPage<KtoAudioStoryItem>(
        'storyLocationBasedList',
        {
          langCode: ODII_LANG_CODE,
          mapX: String(options.mapX),
          mapY: String(options.mapY),
          radius: String(options.radiusM),
          numOfRows: String(pageSize),
          pageNo: String(pageNo),
        },
        ODII_BASE_URL,
      );

      if (page.items.length === 0) break;

      for (const item of page.items) {
        const key = item.stlid ?? '';
        if (key && !seen.has(key)) {
          seen.add(key);
          collected.push(item);
        }
      }

      if (collected.length >= page.totalCount || page.items.length < pageSize) break;
    }

    return collected;
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

  /**
   * 구 단위 방문 집중도 예측 전체.
   *
   * 페이지를 끝까지 넘긴다. 이전에는 numOfRows=1000으로 한 페이지만 받았는데
   * 상류가 요청값을 무시하고 100건으로 잘라 보낸다. 팔달구는 관광지 35곳 x 30일
   * = 1050건이라 첫 페이지에는 이름 순 앞쪽 4곳만 들어왔고, 수원화성과 화성행궁,
   * 팔달문, 창룡문처럼 서비스가 실제로 쓰는 관광지는 뒷 페이지에 있어 예측이
   * 붙지 않았다. 공개 장소 50곳 중 15곳만 혼잡도를 갖고 있던 이유다.
   */
  async fetchCrowdForecasts(options: { areaCode?: string; sigunguCode?: string } = {}): Promise<KtoCrowdForecastItem[]> {
    const pageSize = 100;
    const collected: KtoCrowdForecastItem[] = [];

    for (let pageNo = 1; ; pageNo += 1) {
      const page = await this.requestPage<KtoCrowdForecastItem>(
        'tatsCnctrRatedList',
        {
          areaCd: options.areaCode ?? '41',
          signguCd: options.sigunguCode ?? '41115',
          numOfRows: String(pageSize),
          pageNo: String(pageNo),
        },
        CROWD_BASE_URL,
      );

      if (page.items.length === 0) break;
      collected.push(...page.items);
      if (collected.length >= page.totalCount || page.items.length < pageSize) break;
    }

    return collected;
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
    const startedAt = Date.now();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      // Leave at least one second of headroom, otherwise the attempt cannot
      // make progress and only burns the remaining budget.
      const remainingMs = MAX_TOTAL_REQUEST_MS - (Date.now() - startedAt);
      if (attempt > 0 && remainingMs < 1_000) break;
      const attemptTimeoutMs = attempt === 0 ? timeoutMs : Math.min(timeoutMs, remainingMs);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);

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
        const backoffMs = RETRY_BASE_DELAY_MS * 2 ** attempt;
        if (MAX_TOTAL_REQUEST_MS - (Date.now() - startedAt) <= backoffMs) break;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    if (lastError instanceof KtoApiError) {
      throw lastError;
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new KtoApiError(endpoint, `KTO request failed: ${endpoint} ${message}`);
  }
}
