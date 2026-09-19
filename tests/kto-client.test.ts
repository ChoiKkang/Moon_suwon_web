import assert from 'node:assert/strict';
import test from 'node:test';

import { KtoClient, KtoApiError } from '@/lib/kto/client';

const originalFetch = globalThis.fetch;

function response(payload: unknown, init: { status?: number; ok?: boolean } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => payload,
  } as Response;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('fetches a paginated pet list from the dedicated KTO pet endpoint', async () => {
  let requestedUrl = '';
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return response({
      response: {
        header: { resultCode: '0000' },
        body: {
          totalCount: 3,
          pageNo: 2,
          numOfRows: 1,
          items: { item: { contentid: 'pet-1', contenttypeid: '12', title: '반려동물 장소' } },
        },
      },
    });
  }) as typeof fetch;

  const page = await new KtoClient({ serviceKey: 'secret-key' }).fetchPetTourPage({
    areaCode: '41',
    sigunguCode: '111',
    contentTypeId: '12',
    pageNo: 2,
    numOfRows: 1,
  });

  const url = new URL(requestedUrl);
  assert.equal(url.origin + url.pathname, 'https://apis.data.go.kr/B551011/KorPetTourService2/petTourSyncList2');
  assert.equal(url.searchParams.get('lDongRegnCd'), '41');
  assert.equal(url.searchParams.get('lDongSignguCd'), '111');
  assert.equal(url.searchParams.get('contentTypeId'), '12');
  assert.equal(url.searchParams.get('pageNo'), '2');
  assert.equal(url.searchParams.get('numOfRows'), '1');
  assert.equal(page.totalCount, 3);
  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].contentid, 'pet-1');
});

test('requests searchFestival2 without area filters', async () => {
  let requestedUrl = '';
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return response({
      response: {
        header: { resultCode: '0000' },
        body: {
          totalCount: 0,
          items: '',
        },
      },
    });
  }) as typeof fetch;

  const page = await new KtoClient({ serviceKey: 'secret-key' }).fetchSuwonFestivals({
    eventStartDate: '20260918',
    eventEndDate: '20261018',
    pageNo: 1,
    numOfRows: 100,
  });

  const url = new URL(requestedUrl);
  assert.equal(url.pathname, '/B551011/KorService2/searchFestival2');
  // searchFestival2 returns zero rows when areaCode/sigunguCode are supplied,
  // so the client requests the nationwide list and callers filter by address.
  assert.equal(url.searchParams.get('areaCode'), null);
  assert.equal(url.searchParams.get('sigunguCode'), null);
  assert.equal(url.searchParams.get('eventStartDate'), '20260918');
  assert.equal(url.searchParams.get('eventEndDate'), '20261018');
  assert.equal(page.totalCount, 0);
  assert.deepEqual(page.items, []);
});

test('uses the dedicated pet base for detail requests', async () => {
  let requestedUrl = '';
  globalThis.fetch = (async (input) => {
    requestedUrl = String(input);
    return response({
      response: {
        header: { resultCode: '0000' },
        body: { items: { item: { contentid: 'pet-1', acmpyPsblCpam: '가능' } } },
      },
    });
  }) as typeof fetch;

  const item = await new KtoClient({ serviceKey: 'secret-key' }).fetchPetDetail('pet-1');
  assert.equal(new URL(requestedUrl).pathname, '/B551011/KorPetTourService2/detailPetTour2');
  assert.equal(item?.acmpyPsblCpam, '가능');
});

test('content pagination stops once its processing limit is reached', async () => {
  const requestedPages: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    requestedPages.push(`${url.searchParams.get('lDongSignguCd')}:${url.searchParams.get('pageNo')}`);
    return response({
      response: {
        header: { resultCode: '0000' },
        body: {
          totalCount: 5,
          pageNo: 1,
          numOfRows: 100,
          items: { item: [
            { contentid: 'one', contenttypeid: '12', title: '1' },
            { contentid: 'two', contenttypeid: '12', title: '2' },
            { contentid: 'three', contenttypeid: '12', title: '3' },
          ] },
        },
      },
    });
  }) as typeof fetch;

  const items = await new KtoClient({ serviceKey: 'secret-key' }).fetchSuwonContentByType('12', 100, 2);

  assert.deepEqual(items.map((item) => item.contentid), ['one', 'two']);
  assert.deepEqual(requestedPages, ['111:1']);
});

test('retries a transient 429 and returns a valid zero-item page', async () => {
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) return response({}, { status: 429, ok: false });
    return response({
      response: { header: { resultCode: '0000' }, body: { totalCount: 0, items: '' } },
    });
  }) as typeof fetch;

  const page = await new KtoClient({ serviceKey: 'secret-key' }).fetchPetTourPage({
    areaCode: '41',
    sigunguCode: '111',
    contentTypeId: '12',
    pageNo: 1,
    numOfRows: 100,
  });

  assert.equal(attempts, 2);
  assert.equal(page.totalCount, 0);
  assert.deepEqual(page.items, []);
});

test('does not retry non-transient KTO errors', async () => {
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    return response({ response: { header: { resultCode: '03', resultMsg: 'invalid key' } } }, { status: 200 });
  }) as typeof fetch;

  await assert.rejects(
    () => new KtoClient({ serviceKey: 'secret-key' }).fetchPetDetail('bad'),
    (error: unknown) => error instanceof KtoApiError && error.resultCode === '03',
  );
  assert.equal(attempts, 1);
});

// Retries multiply the per-attempt timeout. The sync workflow has a 30 minute
// budget, so a stalled upstream must stop consuming attempts once the total
// request budget is spent instead of running the full retry ladder.
test('stops retrying once the total request budget is exhausted', async () => {
  let attempts = 0;
  const realSetTimeout = globalThis.setTimeout;
  // Collapse backoff waits so the test stays fast while keeping real timing math.
  globalThis.setTimeout = ((fn: () => void, ms?: number) =>
    realSetTimeout(fn, ms && ms > 50 ? 1 : ms)) as typeof globalThis.setTimeout;

  globalThis.fetch = (async (_input, init?: RequestInit) => {
    attempts += 1;
    // Simulate an upstream that never answers: reject the way fetch does when
    // the AbortController fires, after burning the whole attempt budget.
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
      });
    });
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => new KtoClient({ serviceKey: 'secret-key' }).fetchPetDetail('264408'),
      (error: unknown) => error instanceof KtoApiError && /aborted/i.test((error as Error).message),
    );
    // Four attempts is the configured ceiling; the budget must not allow more.
    assert.ok(attempts >= 1 && attempts <= 4, `unexpected attempt count: ${attempts}`);
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
});
