export type PublicDataPage<T> = {
  items: T[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
};

type PublicDataClientOptions = {
  baseUrl: string;
  serviceKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  commonParams?: Record<string, string>;
};

type RequestOptions = {
  timeoutMs?: number;
  successCodes?: readonly string[];
};

const TEMPORARY_RESULT_CODES = new Set(['01', '02', '04', '05']);

export class PublicDataApiError extends Error {
  readonly endpoint: string;
  readonly status: number | null;
  readonly resultCode: string | null;
  readonly retryable: boolean;

  constructor(options: {
    endpoint: string;
    message: string;
    status?: number | null;
    resultCode?: string | null;
    retryable?: boolean;
  }) {
    super(options.message);
    this.name = 'PublicDataApiError';
    this.endpoint = options.endpoint;
    this.status = options.status ?? null;
    this.resultCode = options.resultCode ?? null;
    this.retryable = options.retryable ?? false;
  }
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function resultParts(payload: unknown): {
  code: string | null;
  message: string | null;
  body: Record<string, unknown> | null;
} {
  if (!payload || typeof payload !== 'object') return { code: null, message: null, body: null };
  const root = payload as Record<string, unknown>;
  const response = root.response && typeof root.response === 'object'
    ? root.response as Record<string, unknown>
    : null;
  const header = response?.header && typeof response.header === 'object'
    ? response.header as Record<string, unknown>
    : root.header && typeof root.header === 'object'
      ? root.header as Record<string, unknown>
      : null;
  const body = response?.body && typeof response.body === 'object'
    ? response.body as Record<string, unknown>
    : null;
  const code = root.resultCode ?? header?.resultCode;
  const message = root.resultMsg ?? header?.resultMsg;
  return {
    code: code === null || code === undefined ? null : String(code),
    message: message === null || message === undefined ? null : String(message),
    body,
  };
}

export class PublicDataClient {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly commonParams: Record<string, string>;

  constructor(options: PublicDataClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.serviceKey = options.serviceKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 400;
    this.commonParams = options.commonParams ?? {};
  }

  async requestPage<T>(
    endpoint: string,
    params: Record<string, string>,
    options: RequestOptions = {},
  ): Promise<PublicDataPage<T>> {
    const url = new URL(`${this.baseUrl}/${endpoint.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries({ ...this.commonParams, ...params })) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('serviceKey', this.serviceKey);

    const successCodes = new Set(options.successCodes ?? ['0000', '00', '0']);
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
      try {
        const httpResponse = await this.fetchImpl(url, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await httpResponse.json().catch(() => null) as unknown;
        const parts = resultParts(payload);

        if (!httpResponse.ok) {
          const retryable = httpResponse.status === 429 || httpResponse.status >= 500;
          throw new PublicDataApiError({
            endpoint,
            status: httpResponse.status,
            resultCode: parts.code,
            retryable,
            message: `Public data request failed: ${endpoint} ${parts.code ?? `HTTP ${httpResponse.status}`}${parts.message ? ` ${parts.message}` : ''}`,
          });
        }

        if (parts.code === null) {
          throw new PublicDataApiError({
            endpoint,
            message: `Malformed public data response: ${endpoint}`,
          });
        }

        if (!successCodes.has(parts.code)) {
          const retryable = TEMPORARY_RESULT_CODES.has(parts.code);
          throw new PublicDataApiError({
            endpoint,
            status: httpResponse.status,
            resultCode: parts.code,
            retryable,
            message: `Public data request failed: ${endpoint} ${parts.code}${parts.message ? ` ${parts.message}` : ''}`,
          });
        }

        if (!parts.body) {
          throw new PublicDataApiError({
            endpoint,
            message: `Malformed public data response: ${endpoint}`,
          });
        }

        const rawItems = parts.body.items;
        const item = rawItems && typeof rawItems === 'object'
          ? (rawItems as Record<string, unknown>).item
          : undefined;
        const items = item === undefined || item === null
          ? []
          : Array.isArray(item)
            ? item
            : [item];

        return {
          items: items as T[],
          totalCount: numberValue(parts.body.totalCount, items.length),
          pageNo: numberValue(parts.body.pageNo ?? params.pageNo, 1),
          numOfRows: numberValue(parts.body.numOfRows ?? params.numOfRows, items.length),
        };
      } catch (error: unknown) {
        const normalized = error instanceof PublicDataApiError
          ? error
          : new PublicDataApiError({
              endpoint,
              retryable: true,
              message: `Public data request failed: ${endpoint} ${error instanceof Error ? error.message : String(error)}`,
            });
        lastError = normalized;
        if (!normalized.retryable || attempt >= this.maxRetries) throw normalized;
      } finally {
        clearTimeout(timeout);
      }

      if (this.retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** attempt));
      }
    }

    throw lastError;
  }
}

export async function collectPages<T>(options: {
  fetchPage: (pageNo: number) => Promise<PublicDataPage<T>>;
  identity: (item: T) => string;
  limit?: number;
  maxPages?: number;
}): Promise<T[]> {
  const limit = options.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error('limit must be a positive integer');
  }

  const rows: T[] = [];
  const seen = new Set<string>();
  const maxPages = options.maxPages ?? 1_000;

  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    const page = await options.fetchPage(pageNo);
    for (const item of page.items) {
      const key = options.identity(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push(item);
      if (limit !== undefined && rows.length >= limit) return rows;
    }

    if (page.items.length === 0) break;
    if (seen.size >= page.totalCount) break;
    if (page.numOfRows > 0 && page.items.length < page.numOfRows) break;
  }

  return rows;
}
