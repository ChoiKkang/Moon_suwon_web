import assert from 'node:assert/strict';
import test from 'node:test';
import { isSuwonFestival, normalizeFestival, normalizeImages, normalizePlace, normalizeSlug, parseKtoTimestamp } from '../src/lib/kto/normalize';
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

test('normalizes festival dates and public event fields', () => {
  const event = normalizeFestival({
    contentid: 'festival-1',
    title: '수원 축제',
    eventstartdate: '20260920',
    eventenddate: '20260922',
    addr1: '경기도 수원시',
    mapx: '127.01',
    mapy: '37.28',
    firstimage: 'http://example.com/event.jpg',
    modifiedtime: '20260918010203',
    program: '공연',
  });

  assert.deepEqual(event, {
    content_id: 'festival-1',
    event_name: '수원 축제',
    start_date: '2026-09-20',
    end_date: '2026-09-22',
    venue_address: '경기도 수원시',
    lat: 37.28,
    lng: 127.01,
    hero_image_url: 'https://example.com/event.jpg',
    contact_phone: null,
    event_place: null,
    play_time: null,
    usage_fee: null,
    program_raw: '공연',
    source_modified_at: '2026-09-18T01:02:03+09:00',
  });
});

test('selects Suwon festivals from the nationwide list', () => {
  const suwonByAddress = { contentid: '1', title: '가을 축제', addr1: '경기도 수원시 팔달구' } as never;
  const suwonByVenue = { contentid: '2', title: '야시장', addr1: '', eventplace: '수원남문시장' } as never;
  const suwonByTitle = { contentid: '3', title: '수원화성 미디어아트', addr1: '경기도 화성시' } as never;
  const otherCity = { contentid: '4', title: '강남 페스타', addr1: '서울특별시 강남구' } as never;
  const noLocation = { contentid: '5', title: '전국 투어' } as never;

  assert.equal(isSuwonFestival(suwonByAddress), true);
  assert.equal(isSuwonFestival(suwonByVenue), true);
  assert.equal(isSuwonFestival(suwonByTitle), true);
  assert.equal(isSuwonFestival(otherCity), false);
  assert.equal(isSuwonFestival(noLocation), false);
});
