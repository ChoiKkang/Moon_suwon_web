import assert from 'node:assert/strict';
import test from 'node:test';
import { busSnapshotStatus, isBusSnapshotFresh, normalizeBusArrivals } from '../src/lib/public-data/bus';

const NOW = '2026-09-20T12:00:00.000Z';

test('bus arrivals normalize two minute-based arrival slots to seconds', () => {
  const rows = normalizeBusArrivals([{
    stationId: '200000084',
    routeId: '200000001',
    routeName: '11-1',
    predictTime1: '3',
    locationNo1: '2',
    predictTime2: '12',
    locationNo2: '8',
  }], NOW);

  assert.deepEqual(rows.map((row) => ({ order: row.arrivalOrder, seconds: row.arrivalSeconds, stops: row.remainingStops })), [
    { order: 1, seconds: 180, stops: 2 },
    { order: 2, seconds: 720, stops: 8 },
  ]);
  assert.equal(rows[0].fetchedAt, NOW);
});

test('negative bus arrival seconds are rejected', () => {
  assert.throws(
    () => normalizeBusArrivals([{ stationId: '1', routeId: '2', predictTime1: '-1' }], NOW),
    /arrival time cannot be negative/,
  );
});

test('bus cache distinguishes fresh, stale, and expired snapshots', () => {
  const now = new Date(NOW);
  assert.equal(isBusSnapshotFresh('2026-09-20T11:58:01.000Z', now), true);
  assert.equal(busSnapshotStatus('2026-09-20T11:57:00.000Z', now), 'stale');
  assert.equal(busSnapshotStatus('2026-09-20T11:54:59.000Z', now), 'expired');
});
