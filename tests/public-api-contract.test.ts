import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);

function contractSql(): string {
  const filenames = readdirSync(migrationDirectory).filter((filename) =>
    filename.endsWith('_approved_api_public_contract.sql'),
  );

  assert.equal(filenames.length, 1, 'expected exactly one approved API public-contract migration');
  return readFileSync(new URL(filenames[0], migrationDirectory), 'utf8').toLowerCase();
}

test('place detail keeps legacy keys and adds the reviewed API blocks', () => {
  const sql = contractSql();

  for (const key of [
    'pet_policy',
    'crowd_forecast',
    'images',
    'related_places',
    'approved_photos',
    'wellness_tags',
    'weather_summary',
    'mid_weather_summary',
    'nearby_bus_arrivals',
  ]) {
    assert.match(sql, new RegExp(`'${key}'`), `${key} must remain in the place fixture`);
  }

  assert.match(sql, /'data_status'/);
  assert.match(sql, /'source_updated_at'/);
  assert.match(sql, /'fetched_at'/);
});

test('mid-range forecast is exposed as an additive reviewed app block', () => {
  const sql = contractSql();
  const placeFunction = sql.match(
    /create or replace function public.get_place_by_slug[\s\S]+?\n\$\$\s*;/,
  )?.[0];

  assert.ok(placeFunction, 'get_place_by_slug must be replaced');
  assert.match(placeFunction, /'mid_weather_summary'/);
  assert.ok(placeFunction.includes("weather.forecast_kind = 'mid'"));
  assert.ok(placeFunction.includes("weather.scope_key = '11b00000:11b10101'"));
});

test('candidate content is gated by review and related places stay published', () => {
  const sql = contractSql();

  assert.match(sql, /place_photo_candidates[\s\S]+review_status\s*=\s*'approved'/);
  assert.match(sql, /place_wellness[\s\S]+review_status\s*=\s*'approved'/);
  assert.match(sql, /place_relations[\s\S]+review_status\s*=\s*'approved'/);
  assert.match(sql, /place_relations[\s\S]+place_publish_state[\s\S]+is_published\s*=\s*true/);
});

test('Durunubi and visitor analytics do not leak into anonymous place detail', () => {
  const sql = contractSql();
  const placeFunction = sql.match(
    /create or replace function public\.get_place_by_slug[\s\S]+?\n\$\$\s*;/,
  )?.[0];

  assert.ok(placeFunction, 'get_place_by_slug must be replaced');
  assert.doesNotMatch(placeFunction, /durunubi_courses/);
  assert.doesNotMatch(placeFunction, /regional_visitor_stats/);
  assert.match(sql, /revoke all on function public\.get_place_by_slug\(text\) from public/);
  assert.match(sql, /grant execute on function public\.get_place_by_slug\(text\) to anon, authenticated/);
  assert.match(sql, /regional_visitor_stats[\s\S]+to service_role/);
});
