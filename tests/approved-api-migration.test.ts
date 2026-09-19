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

test('review RPC mirrors decisions into every publishable candidate store', () => {
  const sql = registryMigration();
  const reviewRpc = sql.match(
    /create or replace function public\.sync_public_api_review\([\s\S]+?\n\$\$;/,
  )?.[0];
  assert.ok(reviewRpc, 'sync_public_api_review function must exist');
  assert.match(
    reviewRpc,
    /v_reviewed_at\s*:=\s*case when p_review_status = 'pending' then null else now\(\) end/,
  );

  for (const relation of [
    'core.place_photo_candidates',
    'core.place_wellness',
    'core.local_hub_candidates',
    'core.place_relations',
    'core.durunubi_courses',
  ]) {
    const update = reviewRpc.match(
      new RegExp(`update ${relation.replace('.', '\\.')}([\\s\\S]+?)where`),
    )?.[1];
    assert.ok(update, `${relation} review update must exist`);
    assert.match(update, /review_status\s*=\s*p_review_status/);
    assert.match(update, /reviewed_at\s*=\s*v_reviewed_at/);
    assert.match(update, /review_note\s*=\s*v_review_note/);
  }
});

test('public candidate lookups and foreign keys have supporting indexes', () => {
  const sql = registryMigration();
  const compactSql = sql.replace(/\s+/g, ' ');

  for (const indexClause of [
    'on core.place_photo_candidates(place_id, review_status)',
    'on core.place_wellness(place_id, review_status)',
    'on core.local_hub_candidates(place_id, review_status)',
    'on core.place_relations(origin_place_id, review_status)',
    'on core.place_relations(related_place_id)',
  ]) {
    assert.ok(compactSql.includes(indexClause), 'missing supporting index: ' + indexClause);
  }
});

test('related-place identity includes district provenance through core upsert', () => {
  const compactSql = registryMigration().replace(/\s+/g, ' ');

  assert.ok(compactSql.includes(
    'primary key(origin_source_key, related_source_key, base_month, district_code)',
  ));
  assert.ok(compactSql.includes(
    'on conflict (origin_source_key, related_source_key, base_month, district_code) do update',
  ));
});

test('approved API migrations never schema-qualify SQL conditional expressions', () => {
  const migrationNames = readdirSync('supabase/migrations').filter((name) =>
    [
      '_approved_api_registry.sql',
      '_approved_api_public_contract.sql',
      '_improve_pet_crowd_coverage.sql',
    ].some((suffix) => name.endsWith(suffix)),
  );

  assert.equal(migrationNames.length, 3, 'expected all three approved API migrations');
  for (const migrationName of migrationNames) {
    const sql = readFileSync(`supabase/migrations/${migrationName}`, 'utf8');
    assert.doesNotMatch(
      sql,
      /\bpg_catalog\.(?:coalesce|nullif|greatest|least)\s*\(/i,
      `${migrationName} must leave PostgreSQL conditional expressions unqualified`,
    );
  }
});

test('a forward migration repairs the public place RPC already applied remotely', () => {
  const migrationNames = readdirSync('supabase/migrations').filter((name) =>
    name.endsWith('_fix_approved_api_conditional_expressions.sql'),
  );

  assert.equal(migrationNames.length, 1, 'expected one forward repair migration');
  const sql = readFileSync(`supabase/migrations/${migrationNames[0]}`, 'utf8');
  assert.match(sql, /create or replace function public\.get_place_by_slug\(p_slug text\)/i);
  assert.doesNotMatch(sql, /\bpg_catalog\.(?:coalesce|nullif|greatest|least)\s*\(/i);
  assert.match(sql, /revoke all on function public\.get_place_by_slug\(text\) from public/i);
  assert.match(sql, /grant execute on function public\.get_place_by_slug\(text\) to anon, authenticated/i);
});
