import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

function registryMigration(): string {
  const files = readdirSync('supabase/migrations').filter((name) => name.endsWith('_approved_api_registry.sql'));
  assert.equal(files.length, 1, 'exactly one approved_api_registry migration must exist');
  return readFileSync(`supabase/migrations/${files[0]}`, 'utf8').toLowerCase();
}

test('approved API migration creates all private stores and seeds 14 APIs', () => {
  const sql = registryMigration();
  for (const relation of [
    'ops.api_registry',
    'raw.public_api_items',
    'core.place_photo_candidates',
    'core.place_wellness',
    'core.local_hub_candidates',
    'core.place_relations',
    'core.durunubi_courses',
    'core.regional_visitor_stats',
    'core.weather_forecasts',
    'core.place_bus_stops',
    'core.bus_arrival_snapshots',
  ]) {
    assert.match(sql, new RegExp(`create table if not exists ${relation.replace('.', '\\.')}`));
  }
  assert.equal((sql.match(/\('(?:kto|kma|gg|durunubi)[^']*'/g) ?? []).length >= 14, true);
});

test('approved API private stores revoke public roles and sync RPCs are service-only', () => {
  const sql = registryMigration();
  assert.match(sql, /revoke all on all tables in schema ops from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.sync_public_api_item/);
  assert.match(sql, /grant execute on function public\.sync_public_api_item[^;]+ to service_role/);
  assert.match(sql, /create or replace function public\.sync_public_api_review/);
});
