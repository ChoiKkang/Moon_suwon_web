import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePublicPlaceExtras, shouldShowBusArrivals } from '@/lib/places/public-extras';

test('public place extras trims mission copy and keeps approved related places', () => {
  const extras = parsePublicPlaceExtras({
    mission_type: ' photo ',
    mission_prompt: '  성곽의 불빛을 한 장 담아보세요.  ',
    couple_question: '  오늘 가장 오래 머문 장면은 무엇인가요? ',
    related_places: {
      items: [
        { id: 'place-2', slug: 'jang-an-mun', display_name: '장안문', relation_score: '0.91' },
        { id: null, slug: 'broken', display_name: '노출하면 안 되는 행', relation_score: 'bad' },
      ],
      data_status: 'stale',
      fetched_at: '2026-09-20T15:00:00Z',
    },
  });

  assert.equal(extras.missionType, 'photo');
  assert.equal(extras.missionPrompt, '성곽의 불빛을 한 장 담아보세요.');
  assert.equal(extras.coupleQuestion, '오늘 가장 오래 머문 장면은 무엇인가요?');
  assert.deepEqual(extras.relatedPlaces.items, [
    { id: 'place-2', slug: 'jang-an-mun', displayName: '장안문', relationScore: 0.91 },
  ]);
  assert.equal(extras.relatedPlaces.dataStatus, 'stale');
});

test('malformed optional blocks become safe empty blocks', () => {
  const extras = parsePublicPlaceExtras({
    related_places: { items: [{ id: 'missing-name' }], data_status: 'not-a-status' },
    weather_summary: { items: [{ forecast_at: 'not-a-date', category: 'TMP', value_number: 'bad' }] },
    nearby_bus_arrivals: { items: [{ station_id: 's1', station_name: '행궁동', arrival_seconds: '120' }], data_status: 'expired' },
  });

  assert.deepEqual(extras.relatedPlaces.items, []);
  assert.equal(extras.relatedPlaces.dataStatus, 'unknown');
  assert.deepEqual(extras.weatherSummary.items, []);
  assert.deepEqual(extras.nearbyBusArrivals.items, [
    {
      stationId: 's1',
      stationName: '행궁동',
      routeId: null,
      routeName: null,
      arrivalOrder: null,
      arrivalSeconds: 120,
      remainingStops: null,
    },
  ]);
  assert.equal(shouldShowBusArrivals(extras.nearbyBusArrivals), false);
});

test('missing payloads never throw and fresh bus data is displayable', () => {
  const extras = parsePublicPlaceExtras(null);
  assert.equal(extras.missionPrompt, null);
  assert.deepEqual(extras.weatherSummary.items, []);
  assert.equal(shouldShowBusArrivals({
    items: [{ stationId: 's1', stationName: '화성행궁', routeId: '11', routeName: '11', arrivalOrder: 1, arrivalSeconds: 180, remainingStops: 2 }],
    dataStatus: 'fresh',
    sourceUpdatedAt: null,
    fetchedAt: null,
  }), true);
});
