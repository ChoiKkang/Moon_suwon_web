import assert from 'node:assert/strict';
import test from 'node:test';
import { latestMidForecastBase, normalizeMidForecast, normalizeVillageForecast } from '../src/lib/public-data/weather';

const fixture = [
  { baseDate: '20260920', baseTime: '0200', fcstDate: '20260920', fcstTime: '1800', category: 'TMP', fcstValue: '19' },
  { baseDate: '20260920', baseTime: '0200', fcstDate: '20260920', fcstTime: '1800', category: 'POP', fcstValue: '30' },
  { baseDate: '20260920', baseTime: '0200', fcstDate: '20260920', fcstTime: '1800', category: 'PTY', fcstValue: '0' },
  { baseDate: '20260920', baseTime: '0200', fcstDate: '20260920', fcstTime: '1800', category: 'PCP', fcstValue: '강수없음' },
  { baseDate: '20260920', baseTime: '0200', fcstDate: '20260920', fcstTime: '1800', category: 'WSD', fcstValue: '2.4' },
  { baseDate: '20260920', baseTime: '0200', fcstDate: '20260920', fcstTime: '1800', category: 'SKY', fcstValue: '3' },
  { baseDate: '20260920', baseTime: '0200', fcstDate: '20260920', fcstTime: '2100', category: 'TMP', fcstValue: '17' },
];

test('short forecast groups categories without mixing forecast times', () => {
  const rows = normalizeVillageForecast(fixture, '2026-09-20T02:00:00+09:00');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].temperatureC, 19);
  assert.equal(rows[0].precipitationProbability, 30);
  assert.equal(rows[1].temperatureC, 17);
  assert.equal(rows[1].precipitationProbability, null);
});

test('missing or no-rain precipitation stays null rather than becoming zero', () => {
  const [row] = normalizeVillageForecast(fixture, '2026-09-20T02:00:00+09:00');
  assert.equal(row.precipitationAmountMm, null);
  assert.equal(row.precipitationText, '강수없음');
});

test('mid forecast joins weather and temperature for days 4 through 11', () => {
  const rows = normalizeMidForecast(
    { regId: '11B00000', wf4Am: '맑음', wf4Pm: '구름많음', wf11Am: '흐림', wf11Pm: '비' },
    { regId: '11B10101', taMin4: '15', taMax4: '25', taMin11: '13', taMax11: '21' },
    '2026-09-20T06:00:00+09:00',
  );
  assert.equal(rows.length, 8);
  assert.deepEqual(rows[0], {
    dayOffset: 4,
    forecastDate: '2026-09-24',
    weatherAm: '맑음',
    weatherPm: '구름많음',
    minTemperatureC: 15,
    maxTemperatureC: 25,
    issuedAt: '2026-09-20T06:00:00+09:00',
  });
  assert.equal(rows[7].weatherPm, '비');
});

test('mid forecast issue time never points into the future', () => {
  assert.equal(latestMidForecastBase(new Date('2026-09-19T16:00:00.000Z')), '202609191800');
  assert.equal(latestMidForecastBase(new Date('2026-09-19T22:00:00.000Z')), '202609200600');
  assert.equal(latestMidForecastBase(new Date('2026-09-20T10:00:00.000Z')), '202609201800');
});
