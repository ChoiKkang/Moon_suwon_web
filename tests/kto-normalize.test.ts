import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeImages, normalizePlace, normalizeSlug, parseKtoTimestamp } from '../src/lib/kto/normalize';
import { toSecureImageUrl } from '../src/lib/media/urls';

test('normalizes KTO image URLs to HTTPS without changing secure URLs', () => {
  assert.equal(toSecureImageUrl(' http://tong.visitkorea.or.kr/cms/a.jpg '), 'https://tong.visitkorea.or.kr/cms/a.jpg');
  assert.equal(toSecureImageUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(toSecureImageUrl('  '), null);
});

test('normalizes KTO place identity and timestamp', () => {
  assert.equal(normalizeSlug('Hwaseong Haenggung', '12345'), 'hwaseong-haenggung-12345');
  assert.equal(parseKtoTimestamp('20260918010203'), '2026-09-18T01:02:03+09:00');
  assert.equal(parseKtoTimestamp('invalid'), null);

  const place = normalizePlace(
    {
      contentid: '12345',
      contenttypeid: '12',
      title: '화성 행궁',
      addr1: '경기도 수원시',
      mapx: '127.0123456',
      mapy: '37.2801234',
      firstimage: 'http://tong.visitkorea.or.kr/cms/hero.jpg',
    },
    { contentid: '12345', contenttypeid: '12', title: '화성 행궁', modifiedtime: '20260918010203', overview: '소개' },
  );

  assert.equal(place.lat, 37.2801234);
  assert.equal(place.lng, 127.0123456);
  assert.equal(place.source_modified_at, '2026-09-18T01:02:03+09:00');
});

test('normalizes hero and gallery image URLs', () => {
  const rows = normalizeImages(
    'place-id',
    {
      contentid: '12345',
      contenttypeid: '12',
      title: '화성 행궁',
      firstimage: 'http://tong.visitkorea.or.kr/cms/hero.jpg',
      firstimage2: 'http://tong.visitkorea.or.kr/cms/thumb.jpg',
    },
    [{
      contentid: '12345',
      originimgurl: 'http://tong.visitkorea.or.kr/cms/gallery.jpg',
      smallimageurl: 'http://tong.visitkorea.or.kr/cms/gallery-small.jpg',
      serialnum: '1',
    }],
  );

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.image_url, 'https://tong.visitkorea.or.kr/cms/hero.jpg');
  assert.equal(rows[0]?.thumbnail_url, 'https://tong.visitkorea.or.kr/cms/thumb.jpg');
  assert.equal(rows[1]?.image_url, 'https://tong.visitkorea.or.kr/cms/gallery.jpg');
});
