import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDraftSummary, buildSyncSummary, jobLabel, statusLabel } from '../src/lib/ops/notification-copy';

test('수집 잡과 상태를 운영자용 한글로 바꾼다', () => {
  assert.equal(jobLabel('audio'), '오디오 해설');
  assert.equal(jobLabel('access'), '무장애 정보');
  assert.equal(statusLabel('completed'), '성공');
  assert.equal(statusLabel('action_required'), '조치 필요');
});

test('수집 결과에 조회·저장·오류 수를 한글 단위로 표시한다', () => {
  const body = buildSyncSummary({
    job: 'audio',
    status: 'completed',
    itemsFetched: '130',
    itemsUpserted: '55',
    errorCount: '0',
    shouldRun: 'true',
  });

  assert.match(body, /\*\*오디오 해설\*\* 수집 성공/);
  assert.match(body, /조회 130건 · 저장 55건 · 오류 0건/);
  assert.doesNotMatch(body, /job=|fetched=|upserted=/);
});

test('오류와 저장 0건을 운영 조치 문구로 안내한다', () => {
  const errorBody = buildSyncSummary({
    job: 'crowd',
    status: 'failed',
    itemsFetched: '75',
    itemsUpserted: '0',
    errorCount: '2',
    shouldRun: 'true',
  });
  assert.match(errorBody, /오류가 있습니다/);
  assert.match(errorBody, /관리자 콘솔/);

  const emptyBody = buildSyncSummary({
    job: 'pet',
    status: 'completed',
    itemsFetched: '8',
    itemsUpserted: '0',
    errorCount: '0',
    shouldRun: 'true',
  });
  assert.match(emptyBody, /새로 저장할 내용이 없습니다/);
});

test('코스 초안 결과를 공개 전 검수 흐름으로 안내한다', () => {
  const body = buildDraftSummary({ candidateCount: '5', writtenCount: '3', mode: 'write' });
  assert.match(body, /후보 5개 검토 · 초안 3개 작성/);
  assert.match(body, /비공개 상태/);
});

test('코스 초안 실행 실패를 성공으로 보이지 않게 한다', () => {
  const body = buildDraftSummary({ candidateCount: '0', writtenCount: '0', mode: 'unknown', status: 'failure' });
  assert.match(body, /실행 실패/);
  assert.doesNotMatch(body, /완료/);
});
