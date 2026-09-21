import assert from 'node:assert/strict';
import test from 'node:test';

import { formatWeatherValue, getWeatherCategoryLabel } from '@/lib/places/weather-display';

test('KMA sky codes become visitor-friendly Korean labels', () => {
  assert.equal(getWeatherCategoryLabel('SKY'), '하늘 상태');
  assert.equal(formatWeatherValue('SKY', null, 1, null), '맑음');
  assert.equal(formatWeatherValue('SKY', null, 3, null), '구름 많음');
  assert.equal(formatWeatherValue('SKY', null, 4, null), '흐림');
});

test('precipitation codes and text do not expose raw zero or duplicate units', () => {
  assert.equal(getWeatherCategoryLabel('PTY'), '비/눈');
  assert.equal(formatWeatherValue('PTY', null, 0, null), '없음');
  assert.equal(formatWeatherValue('PTY', null, 1, null), '비');
  assert.equal(formatWeatherValue('PCP', '강수없음', null, 'mm'), '없음');
  assert.equal(formatWeatherValue('PCP', '1.5mm', null, 'mm'), '1.5mm');
  assert.equal(formatWeatherValue('POP', null, 0, '%'), '0%');
});

test('missing weather values stay honest instead of rendering undefined', () => {
  assert.equal(formatWeatherValue('SKY', null, null, null), '정보 없음');
  assert.equal(formatWeatherValue('TMP', null, null, '℃'), '정보 없음');
});
