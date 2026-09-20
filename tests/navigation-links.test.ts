import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCourseDirectionsUrl,
  buildPlaceNavigationLinks,
  type NavigationTarget,
} from '@/lib/navigation/links';

const suwonHwaseong: NavigationTarget = {
  displayName: '수원화성',
  addressFull: '경기도 수원시 팔달구 정조로 825',
  lat: 37.28,
  lng: 127.01,
};

test('builds exact destination links when a spot has valid coordinates', () => {
  const links = buildPlaceNavigationLinks(suwonHwaseong);

  assert.equal(links.hasExactCoordinates, true);
  assert.match(links.kakao, /https:\/\/map\.kakao\.com\/link\/to\//);
  assert.match(links.kakao, /37\.28,127\.01$/);

  const google = new URL(links.google);
  assert.equal(google.searchParams.get('api'), '1');
  assert.equal(google.searchParams.get('destination'), '37.28,127.01');
  assert.equal(google.searchParams.get('travelmode'), 'walking');

  assert.match(links.naver, /map\.naver\.com\/p\/search/);
  assert.ok(links.naver.includes(encodeURIComponent(suwonHwaseong.addressFull!)));
});

test('falls back to provider search links when coordinates are missing or invalid', () => {
  const links = buildPlaceNavigationLinks({
    displayName: '행궁동 스팟',
    addressFull: '경기도 수원시 팔달구 행궁동',
    lat: 999,
    lng: null,
  });

  assert.equal(links.hasExactCoordinates, false);
  assert.match(links.kakao, /link\/search/);
  assert.match(links.google, /google\.com\/maps\/search/);
  assert.match(links.naver, /map\.naver\.com\/p\/search/);
});

test('builds an ordered walking route only when every course stop has coordinates', () => {
  const route = buildCourseDirectionsUrl([
    suwonHwaseong,
    { displayName: '화성행궁', addressFull: null, lat: 37.281, lng: 127.011 },
    { displayName: '팔달문', addressFull: null, lat: 37.282, lng: 127.012 },
  ]);

  assert.ok(route);
  const parsed = new URL(route);
  assert.equal(parsed.searchParams.get('origin'), '37.28,127.01');
  assert.equal(parsed.searchParams.get('destination'), '37.282,127.012');
  assert.equal(parsed.searchParams.get('waypoints'), '37.281,127.011');
  assert.equal(parsed.searchParams.get('travelmode'), 'walking');

  assert.equal(buildCourseDirectionsUrl([
    suwonHwaseong,
    { displayName: '좌표 준비 중', addressFull: '수원시', lat: null, lng: null },
  ]), null);
});
