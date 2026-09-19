import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PublicDataApiError,
  PublicDataClient,
  collectPages,
  type PublicDataPage,
} from '../src/lib/public-data/client';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('a successful empty response is a zero-result page', async () => {
  const client = new PublicDataClient({
    baseUrl: 'https://example.test',
    serviceKey: 'secret-key',
    fetchImpl: async () => response({
      response: { header: { resultCode: '0000' }, body: { items: '', totalCount: 0 } },
    }),
  });

  const page = await client.requestPage('/empty', {});
  assert.deepEqual(page.items, []);
  assert.equal(page.totalCount, 0);
});

test('global limit stops pagination after two unique items', async () => {
  let calls = 0;
  const pages: PublicDataPage<{ id: string }>[] = [
    { items: [{ id: '1' }, { id: '2' }, { id: '2' }], totalCount: 4, pageNo: 1, numOfRows: 3 },
    { items: [{ id: '3' }], totalCount: 4, pageNo: 2, numOfRows: 3 },
  ];
  const rows = await collectPages({
    fetchPage: async (pageNo) => {
      calls += 1;
      return pages[pageNo - 1];
    },
    limit: 2,
    identity: (row) => row.id,
  });

  assert.deepEqual(rows.map((row) => row.id), ['1', '2']);
  assert.equal(calls, 1);
});

test('page collection removes repeats across page boundaries', async () => {
  const rows = await collectPages({
    fetchPage: async (pageNo) => pageNo === 1
      ? { items: [{ id: '1' }, { id: '2' }], totalCount: 3, pageNo, numOfRows: 2 }
      : { items: [{ id: '2' }, { id: '3' }], totalCount: 3, pageNo, numOfRows: 2 },
    identity: (row: { id: string }) => row.id,
  });
  assert.deepEqual(rows.map((row) => row.id), ['1', '2', '3']);
});

test('quota errors are safe, classified, and never expose the service key', async () => {
  const client = new PublicDataClient({
    baseUrl: 'https://example.test',
    serviceKey: 'never-log-this',
    maxRetries: 0,
    fetchImpl: async () => response({ response: { header: { resultCode: '22', resultMsg: 'LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR' } } }),
  });

  await assert.rejects(
    client.requestPage('/quota', {}),
    (error: unknown) => {
      assert.ok(error instanceof PublicDataApiError);
      assert.equal(error.resultCode, '22');
      assert.equal(error.retryable, false);
      assert.doesNotMatch(error.message, /never-log-this/);
      return true;
    },
  );
});

test('malformed success bodies fail instead of masquerading as zero results', async () => {
  const client = new PublicDataClient({
    baseUrl: 'https://example.test',
    serviceKey: 'secret-key',
    maxRetries: 0,
    fetchImpl: async () => response({ unexpected: true }),
  });

  await assert.rejects(client.requestPage('/malformed', {}), /Malformed public data response: \/malformed/);
});

test('temporary upstream result codes retry once', async () => {
  let calls = 0;
  const client = new PublicDataClient({
    baseUrl: 'https://example.test',
    serviceKey: 'secret-key',
    maxRetries: 1,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? response({ response: { header: { resultCode: '05', resultMsg: 'SERVICETIMEOUT' } } })
        : response({ response: { header: { resultCode: '0000' }, body: { items: '', totalCount: 0 } } });
    },
  });

  await client.requestPage('/temporary', {});
  assert.equal(calls, 2);
});
