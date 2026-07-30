import { writeFile } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';
import { getRequiredServerEnv } from '../src/lib/env/server';
import { KtoClient } from '../src/lib/kto/client';
import { normalizeImages, normalizePlace } from '../src/lib/kto/normalize';

loadEnvConfig(process.cwd());

const DEFAULT_OUTPUT = '/private/tmp/moon-suwon-kto-import.sql';

const SELECTED_TITLES = new Set([
  '연무대(동장대)',
  '동북공심돈',
  '봉돈',
  '수원통닭거리',
  '수원 지동벽화마을',
]);

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function writeError(error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
}

function sqlString(value: string | null): string {
  if (value === null) {
    return 'null';
  }

  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid SQL number: ${value}`);
  }

  return String(value);
}

function getOutputPath() {
  const outputFlagIndex = process.argv.indexOf('--output');
  return outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] ?? DEFAULT_OUTPUT : DEFAULT_OUTPUT;
}

async function main() {
  const kto = new KtoClient({
    serviceKey: getRequiredServerEnv('KTO_SERVICE_KEY'),
  });

  const attractions = await kto.fetchSuwonAttractions();
  const selected = attractions.filter((item) => SELECTED_TITLES.has(item.title));

  if (selected.length === 0) {
    throw new Error('No configured KTO places were found in the Suwon attraction response');
  }

  const statements = [
    'begin;',
    'set local search_path = public, core, editorial, serving, extensions;',
  ];

  for (const item of selected) {
    const detail = await kto.fetchDetail(item.contentid);
    const images = normalizeImages('00000000-0000-0000-0000-000000000000', item, await kto.fetchImages(item.contentid));
    const place = normalizePlace(item, detail);

    statements.push(`
do $$
declare
  v_place_id uuid;
begin
  insert into core.places (
    slug,
    official_name,
    address_full,
    lat,
    lng,
    contact_phone,
    source_overview_raw,
    source_modified_at,
    category,
    is_active
  )
  values (
    ${sqlString(place.slug)},
    ${sqlString(place.official_name)},
    ${sqlString(place.address_full)},
    ${sqlNumber(place.lat)},
    ${sqlNumber(place.lng)},
    ${sqlString(place.contact_phone)},
    ${sqlString(place.source_overview_raw)},
    ${sqlString(place.source_modified_at)},
    ${sqlString(place.category)},
    true
  )
  on conflict (slug) do update set
    official_name = excluded.official_name,
    address_full = excluded.address_full,
    lat = excluded.lat,
    lng = excluded.lng,
    contact_phone = excluded.contact_phone,
    source_overview_raw = excluded.source_overview_raw,
    source_modified_at = excluded.source_modified_at,
    category = excluded.category,
    is_active = excluded.is_active,
    updated_at = now()
  returning id into v_place_id;

  insert into core.place_sources (
    place_id,
    kto_content_id,
    kto_content_type_id,
    sync_enabled
  )
  values (
    v_place_id,
    ${sqlString(place.kto_content_id)},
    ${sqlString(place.kto_content_type_id)},
    true
  )
  on conflict (kto_content_id) do update set
    place_id = excluded.place_id,
    kto_content_type_id = excluded.kto_content_type_id,
    sync_enabled = excluded.sync_enabled;

  delete from core.place_images
  where place_id = v_place_id
    and source_provider = 'KTO';
`);

    for (const image of images) {
      statements.push(`
  insert into core.place_images (
    place_id,
    image_url,
    thumbnail_url,
    alt_text,
    copyright_type,
    source_provider,
    source_image_id,
    is_hero,
    display_order
  )
  values (
    v_place_id,
    ${sqlString(image.image_url)},
    ${sqlString(image.thumbnail_url)},
    ${sqlString(image.alt_text)},
    ${sqlString(image.copyright_type)},
    'KTO',
    ${sqlString(image.source_image_id)},
    ${image.is_hero ? 'true' : 'false'},
    ${image.display_order}
  );`);
    }

    statements.push(`
  insert into editorial.place_copy (
    place_id,
    display_name,
    short_description,
    og_title,
    og_description
  )
  values (
    v_place_id,
    ${sqlString(place.official_name)},
    ${sqlString(place.source_overview_raw?.slice(0, 120) ?? null)},
    ${sqlString(`${place.official_name} | 달빛수원`)},
    ${sqlString(place.source_overview_raw?.slice(0, 150) ?? null)}
  )
  on conflict (place_id) do update set
    display_name = excluded.display_name,
    short_description = excluded.short_description,
    og_title = excluded.og_title,
    og_description = excluded.og_description,
    updated_at = now();
end $$;`);
  }

  statements.push('commit;');

  const outputPath = getOutputPath();
  await writeFile(outputPath, `${statements.join('\n')}\n`, 'utf8');
  writeLine(`Wrote ${selected.length} KTO places to ${outputPath}`);
}

main().catch((error) => {
  writeError(error);
  process.exit(1);
});
