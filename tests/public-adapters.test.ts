import assert from 'node:assert/strict';
import test from 'node:test';

import { filterCoursesContainingPlace, mapCoursePlace } from '@/lib/courses/queries';
import { mapPlace } from '@/lib/places/queries';

test('place adapter preserves the public pet and crowd contract', () => {
  const place = mapPlace({
    id: 'place-1',
    slug: 'place-1',
    display_name: '장소',
    address_full: '수원시',
    short_description: '소개',
    hero_image_url: 'http://example.com/hero.jpg',
    hero_thumbnail_url: null,
    kto_content_id: '123',
    lat: '37.28',
    lng: '127.01',
    contact_phone: null,
    source_modified_at: null,
    pet_policy: 'unknown',
    pet_note: '방문 전 문의',
    pet_data_status: 'unavailable',
    pet_source_updated_at: '2026-09-18T00:00:00Z',
    crowd_forecast_date: '2026-09-18',
    crowd_forecast_rate: '25',
    crowd_forecast_level: '여유',
    crowd_data_status: 'fresh',
  });

  assert.equal(place.petPolicy, 'unknown');
  assert.equal(place.petDataStatus, 'unavailable');
  assert.equal(place.petNote, '방문 전 문의');
  assert.deepEqual(place.crowdForecast, { forecastDate: '2026-09-18', rate: 25, level: '여유' });
  assert.equal(place.heroImageUrl, 'https://example.com/hero.jpg');
});

test('course adapter keeps an unknown stop unknown instead of partial', () => {
  const place = mapCoursePlace({
    course_id: 'course-1',
    order_index: 0,
    place_id: 'place-1',
    place_slug: 'place-1',
    display_name: '장소',
    lat: '37.28',
    lng: '127.01',
    hero_image_url: null,
    pet_policy: 'unknown',
    pet_data_status: 'unknown',
    crowd_data_status: 'stale',
    crowd_forecast_date: '2026-09-17',
    crowd_forecast_rate: 80,
    crowd_forecast_level: '혼잡',
  });

  assert.equal(place.petPolicy, 'unknown');
  assert.equal(place.petDataStatus, 'unknown');
  assert.equal(place.crowdDataStatus, 'stale');
  assert.equal(place.crowdForecast?.rate, 80);
});

test('filters a published course list to the courses that contain a place', () => {
  const courses = [
    { id: 'course-a', places: [{ id: 'place-1' }] },
    { id: 'course-b', places: [{ id: 'place-2' }] },
    { id: 'course-c', places: [{ id: 'place-1' }, { id: 'place-3' }] },
  ] as never[];

  assert.deepEqual(
    filterCoursesContainingPlace(courses as never, 'place-1').map((course) => course.id),
    ['course-a', 'course-c'],
  );
  assert.deepEqual(filterCoursesContainingPlace(courses as never, 'missing'), []);
});
