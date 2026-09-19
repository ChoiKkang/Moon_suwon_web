import assert from 'node:assert/strict';
import test from 'node:test';
import {
  KtoExtraClient,
  SUWON_ADMIN_DISTRICT_CODES,
  type ExtraSource,
  type PageRequester,
} from '../src/lib/public-data/kto-extra';
import type { PublicDataPage } from '../src/lib/public-data/client';

type Call = { source: ExtraSource; endpoint: string; params: Record<string, string> };

function fakeRequester(source: ExtraSource, calls: Call[], handler: (endpoint: string, params: Record<string, string>) => PublicDataPage<Record<string, string>>): PageRequester {
  return {
    requestPage: async (endpoint, params) => {
      calls.push({ source, endpoint, params });
      return handler(endpoint, params);
    },
  };
}

function clientWith(source: ExtraSource, requester: PageRequester): KtoExtraClient {
  return new KtoExtraClient({
    photo: requester,
    wellness: requester,
    localHub: requester,
    related: requester,
    durunubi: requester,
    visitors: requester,
  });
}

test('local-hub collection iterates all four Suwon districts and reports a zero district', async () => {
  const calls: Call[] = [];
  const requester = fakeRequester('localHub', calls, (_endpoint, params) => {
    const code = params.signguCd;
    const items = code === '41113' ? [] : [{ hubTatsCd: `${code}-1`, hubTatsNm: code }];
    return { items, totalCount: items.length, pageNo: 1, numOfRows: 100 };
  });

  const result = await clientWith('localHub', requester).fetchLocalHub({ baseMonth: '202607' });

  assert.deepEqual(calls.map((call) => call.params.signguCd), [...SUWON_ADMIN_DISTRICT_CODES]);
  assert.deepEqual(calls.map((call) => call.params.areaCd), ['41', '41', '41', '41']);
  assert.deepEqual(result.zeroDistricts, ['41113']);
  assert.equal(result.items.length, 3);
});

test('related collection keeps every endpoint pair and its requested district provenance', async () => {
  const calls: Call[] = [];
  const requester = fakeRequester('related', calls, (_endpoint, params) => {
    if (params.signguCd !== '41111') {
      return { items: [], totalCount: 0, pageNo: 1, numOfRows: 100 };
    }
    return {
      items: [
        { tAtsCd: 'origin', tAtsNm: '화성행궁', rlteTatsCd: 'related-1', rlteTatsNm: '수원화성박물관' },
        { tAtsCd: 'origin', tAtsNm: '화성행궁', rlteTatsCd: 'related-2', rlteTatsNm: '수원시립미술관' },
      ],
      totalCount: 2,
      pageNo: 1,
      numOfRows: 100,
    };
  });

  const result = await clientWith('related', requester).fetchRelated({ baseMonth: '202608' });

  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.rlteTatsCd), ['related-1', 'related-2']);
  assert.deepEqual(result.items.map((item) => item.signguCd), ['41111', '41111']);
});

test('related collection retains the same endpoint pair in each requested district', async () => {
  const requester = fakeRequester('related', [], (_endpoint, params) => {
    const items = ['41111', '41113'].includes(params.signguCd)
      ? [{ tAtsCd: 'origin', rlteTatsCd: 'related' }]
      : [];
    return { items, totalCount: items.length, pageNo: 1, numOfRows: 100 };
  });

  const result = await clientWith('related', requester).fetchRelated({ baseMonth: '202608' });

  assert.equal(result.items.length, 2);
  assert.deepEqual(result.items.map((item) => item.signguCd), ['41111', '41113']);
});

test('photo collection removes duplicates across page boundaries', async () => {
  const calls: Call[] = [];
  const requester = fakeRequester('photo', calls, (_endpoint, params) => {
    const pageNo = Number(params.pageNo);
    return pageNo === 1
      ? { items: [{ galContentId: '1' }, { galContentId: '2' }], totalCount: 3, pageNo, numOfRows: 2 }
      : { items: [{ galContentId: '2' }, { galContentId: '3' }], totalCount: 3, pageNo, numOfRows: 2 };
  });

  const items = await clientWith('photo', requester).fetchPhotos({ keyword: '수원' });
  assert.deepEqual(items.map((item) => item.galContentId), ['1', '2', '3']);
});

test('wellness requests include the required Korean language division', async () => {
  const calls: Call[] = [];
  const requester = fakeRequester('wellness', calls, () => ({
    items: [],
    totalCount: 0,
    pageNo: 1,
    numOfRows: 100,
  }));

  await clientWith('wellness', requester).fetchWellness({
    mapX: 127.0095,
    mapY: 37.2818,
    radiusM: 20_000,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].endpoint, 'locationBasedList');
  assert.equal(calls[0].params.langDivCd, 'KOR');
});

test('regional visitor stable keys include date, district, and visitor type', async () => {
  const requester = fakeRequester('visitors', [], () => ({
    items: [{ baseYmd: '20260801', signguCode: '41111', touDivNm: '외지인' }],
    totalCount: 1,
    pageNo: 1,
    numOfRows: 100,
  }));
  const items = await clientWith('visitors', requester).fetchRegionalVisitors({ startDate: '20260801', endDate: '20260831' });
  assert.equal(items[0].sourceItemKey, '20260801:41111:외지인');
});

test('regional visitor limit counts Suwon rows after filtering nationwide pages', async () => {
  const calls: Call[] = [];
  const requester = fakeRequester('visitors', calls, (_endpoint, params) => {
    const pageNo = Number(params.pageNo);
    return pageNo === 1
      ? {
          items: [
            { baseYmd: '20260801', signguCode: '11110', touDivNm: '외지인' },
            { baseYmd: '20260801', signguCode: '41111', touDivNm: '외지인' },
          ],
          totalCount: 4,
          pageNo,
          numOfRows: 2,
        }
      : {
          items: [
            { baseYmd: '20260801', signguCode: '41113', touDivNm: '외지인' },
            { baseYmd: '20260801', signguCode: '41115', touDivNm: '외지인' },
          ],
          totalCount: 4,
          pageNo,
          numOfRows: 2,
        };
  });

  const items = await clientWith('visitors', requester).fetchRegionalVisitors({
    startDate: '20260801',
    endDate: '20260831',
    districtCodes: SUWON_ADMIN_DISTRICT_CODES,
    limit: 2,
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(items.map((item) => item.signguCode), ['41111', '41113']);
});
