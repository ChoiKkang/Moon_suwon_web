import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifySyncStatus,
  paginatePetCandidates,
  selectPetEnrichment,
} from '@/lib/kto/pet-sync';
import type { KtoPage, KtoPetListItem } from '@/lib/kto/types';

function page(items: KtoPetListItem[], totalCount: number, pageNo: number, numOfRows = 2): KtoPage<KtoPetListItem> {
  return { items, totalCount, pageNo, numOfRows };
}

test('paginates every configured region/type and deduplicates content ids', async () => {
  const calls: string[] = [];
  const client = {
    fetchPetTourPage: async (options: { areaCode: string; sigunguCode: string; contentTypeId: string; pageNo: number; numOfRows: number }) => {
      calls.push(`${options.sigunguCode}:${options.contentTypeId}:${options.pageNo}`);
      if (options.sigunguCode === '111' && options.contentTypeId === '12' && options.pageNo === 1) {
        return page([
          { contentid: 'same', contenttypeid: '12', title: '장소 A' },
          { contentid: 'one', contenttypeid: '12', title: '장소 B' },
        ], 3, 1);
      }
      if (options.sigunguCode === '111' && options.contentTypeId === '12' && options.pageNo === 2) {
        return page([{ contentid: 'same', contenttypeid: '12', title: '장소 A' }], 3, 2);
      }
      return page([], 0, options.pageNo);
    },
  };

  const items = await paginatePetCandidates(client, {
    areaCode: '41',
    sigunguCodes: ['111', '113'],
    contentTypeIds: ['12', '38'],
    pageSize: 2,
  });

  assert.deepEqual(items.map((item) => item.contentid), ['same', 'one']);
  assert.ok(calls.includes('111:12:2'));
  assert.ok(calls.includes('113:38:1'));
});

test('honors a preview limit without skipping deterministic order', async () => {
  const client = {
    fetchPetTourPage: async () => page([
      { contentid: 'one', contenttypeid: '12', title: '1' },
      { contentid: 'two', contenttypeid: '12', title: '2' },
    ], 2, 1),
  };

  const items = await paginatePetCandidates(client, {
    areaCode: '41',
    sigunguCodes: ['111'],
    contentTypeIds: ['12'],
    pageSize: 100,
    limit: 1,
  });

  assert.deepEqual(items.map((item) => item.contentid), ['one']);
});

test('selects never checked, stale, and source-changed places for enrichment', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const selected = selectPetEnrichment([
    { kto_content_id: 'never', source_modified_at: null, last_pet_checked_at: null, data_status: 'unknown' },
    { kto_content_id: 'stale', source_modified_at: null, last_pet_checked_at: '2026-09-10T00:00:00.000Z', data_status: 'stale' },
    { kto_content_id: 'changed', source_modified_at: '2026-09-18T00:00:00.000Z', last_pet_checked_at: '2026-09-17T00:00:00.000Z', data_status: 'fresh', source_updated_at: '2026-09-16T00:00:00.000Z' },
    { kto_content_id: 'fresh', source_modified_at: '2026-09-17T00:00:00.000Z', last_pet_checked_at: '2026-09-18T00:00:00.000Z', data_status: 'fresh', source_updated_at: '2026-09-17T00:00:00.000Z' },
  ], now);

  assert.deepEqual(selected.map((row) => row.kto_content_id), ['never', 'stale', 'changed']);
});

test('classifies valid empty details as completed and item failures as partial', () => {
  assert.equal(classifySyncStatus({ listRequestFailed: false, itemErrors: 0, itemsAttempted: 44, validEmpty: 44 }), 'completed');
  assert.equal(classifySyncStatus({ listRequestFailed: false, itemErrors: 44, itemsAttempted: 44, validEmpty: 0 }), 'partial');
  assert.equal(classifySyncStatus({ listRequestFailed: true, itemErrors: 0, itemsAttempted: 0, validEmpty: 0 }), 'failed');
});
