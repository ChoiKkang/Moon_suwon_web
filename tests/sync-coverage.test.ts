import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  applyProcessingLimit,
  classifyCoverageRun,
  matchCrowdCoverage,
} from '@/lib/kto/coverage';

test('zero changed pet rows can still be a healthy completed run', () => {
  const status = classifyCoverageRun({ attempted: 8, succeeded: 8, changed: 0, errors: 0 });
  assert.equal(status, 'completed');
});

test('request failures preserve a partial run even when old coverage exists', () => {
  assert.equal(
    classifyCoverageRun({ attempted: 8, succeeded: 7, changed: 0, errors: 1 }),
    'partial',
  );
  assert.equal(
    classifyCoverageRun({ attempted: 0, succeeded: 0, changed: 0, errors: 1, requestFailed: true }),
    'failed',
  );
});

test('global limit dispatches at most two deterministic content or crowd rows', () => {
  const rows = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];
  const content = applyProcessingLimit(rows, 2);
  const crowd = applyProcessingLimit(rows, 2);

  assert.deepEqual(content.selected.map((row) => row.id), ['c', 'a']);
  assert.equal(content.selected.length, 2);
  assert.equal(crowd.selected.length, 2);
  assert.equal(content.limited, true);
  assert.equal(content.undispatchedCount, 1);
});

test('crowd matching accepts only one exact normalized published-place match', () => {
  const result = matchCrowdCoverage(
    [
      { tourist_attraction_name: ' 수원 화성 ', forecast_date: '2026-09-20', sigungu_code: '41115' },
      { tourist_attraction_name: '중복명소', forecast_date: '2026-09-20', sigungu_code: '41111' },
      { tourist_attraction_name: '없는명소', forecast_date: '2026-09-21', sigungu_code: '41117' },
    ],
    [
      { place_id: 'one', official_name: '수원화성', is_published: true },
      { place_id: 'two', official_name: '중복 명소', is_published: true },
      { place_id: 'three', official_name: '중복명소', is_published: true },
      { place_id: 'draft', official_name: '없는명소', is_published: false },
    ],
  );

  assert.equal(result.matchedPlaceCount, 1);
  assert.equal(result.unmatchedAttractionCount, 2);
  assert.equal(result.ambiguousAttractionCount, 1);
  assert.equal(result.forecastDateCount, 2);
  assert.deepEqual(result.scopeCounts, { '41111': 1, '41115': 1, '41117': 1 });
});

test('sync metadata persists every pet and crowd coverage counter', () => {
  const script = readFileSync(new URL('../scripts/sync-kto-data.ts', import.meta.url), 'utf8');
  for (const key of [
    'discovered_count', 'detail_attempted_count', 'detail_success_count',
    'source_empty_count', 'policy_valid_count', 'unchanged_count', 'changed_count',
    'upserted_count', 'published_covered_count', 'matched_place_count',
    'unmatched_attraction_count', 'forecast_date_count', 'scope_counts',
    'undispatched_candidate_count',
  ]) {
    assert.match(script, new RegExp(`${key}:`), `${key} must be persisted`);
  }
});

test('database crowd matching refuses ambiguous normalized names', () => {
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const filename = readdirSync(directory).find((name) => name.endsWith('_improve_pet_crowd_coverage.sql'));
  assert.ok(filename);
  const sql = readFileSync(new URL(filename, directory), 'utf8').toLowerCase();
  assert.match(sql, /count\(distinct candidate\.id\)/);
  assert.match(sql, /v_match_count\s*<>\s*1/);
  assert.match(sql, /is_published boolean/);
});
