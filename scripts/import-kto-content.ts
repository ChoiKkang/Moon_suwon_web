import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
import { getRequiredServerEnv } from '../src/lib/env/server';
import { KtoClient } from '../src/lib/kto/client';
import { normalizeImages, normalizePlace } from '../src/lib/kto/normalize';

loadEnvConfig(process.cwd());

const SELECTED_TITLES = new Set([
  '연무대(동장대)',
  '동북공심돈',
  '봉돈',
  '수원통닭거리',
  '수원 지동벽화마을',
]);

const supabase = createClient(
  getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredServerEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } },
);

const kto = new KtoClient({
  serviceKey: getRequiredServerEnv('KTO_SERVICE_KEY'),
});

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function writeError(error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
}

async function upsertPlace(
  listItem: Awaited<ReturnType<KtoClient['fetchSuwonAttractions']>>[number],
) {
  const detail = await kto.fetchDetail(listItem.contentid);
  const normalized = normalizePlace(listItem, detail);

  const { data: place, error: placeError } = await supabase
    .schema('core')
    .from('places')
    .upsert(
      {
        slug: normalized.slug,
        official_name: normalized.official_name,
        address_full: normalized.address_full,
        lat: normalized.lat,
        lng: normalized.lng,
        contact_phone: normalized.contact_phone,
        source_overview_raw: normalized.source_overview_raw,
        source_modified_at: normalized.source_modified_at,
        category: normalized.category,
        is_active: true,
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single();

  if (placeError) {
    throw new Error(`Failed to upsert place ${listItem.contentid}: ${placeError.message}`);
  }

  const { error: sourceError } = await supabase
    .schema('core')
    .from('place_sources')
    .upsert(
      {
        place_id: place.id,
        kto_content_id: normalized.kto_content_id,
        kto_content_type_id: normalized.kto_content_type_id,
        sync_enabled: true,
      },
      { onConflict: 'kto_content_id' },
    );

  if (sourceError) {
    throw new Error(`Failed to upsert source ${listItem.contentid}: ${sourceError.message}`);
  }

  const images = normalizeImages(place.id, listItem, await kto.fetchImages(listItem.contentid));

  if (images.length > 0) {
    const { error: imageError } = await supabase
      .schema('core')
      .from('place_images')
      .upsert(images, { onConflict: 'place_id,source_provider,source_image_id' });

    if (imageError) {
      throw new Error(`Failed to upsert images ${listItem.contentid}: ${imageError.message}`);
    }
  }

  const { error: copyError } = await supabase
    .schema('editorial')
    .from('place_copy')
    .upsert(
      {
        place_id: place.id,
        display_name: normalized.official_name,
        short_description: normalized.source_overview_raw?.slice(0, 120) ?? null,
        og_title: `${normalized.official_name} | 달빛수원`,
        og_description: normalized.source_overview_raw?.slice(0, 150) ?? null,
      },
      { onConflict: 'place_id' },
    );

  if (copyError) {
    throw new Error(`Failed to upsert editorial copy ${listItem.contentid}: ${copyError.message}`);
  }

  return normalized.official_name;
}

async function main() {
  const attractions = await kto.fetchSuwonAttractions();
  const selected = attractions.filter((item) => SELECTED_TITLES.has(item.title));

  writeLine(`Fetched ${attractions.length} KTO Suwon attractions`);
  writeLine(`Selected ${selected.length} places for import`);

  if (selected.length === 0) {
    throw new Error('No configured KTO places were found in the Suwon attraction response');
  }

  for (const item of selected) {
    const name = await upsertPlace(item);
    writeLine(`Imported ${name}`);
  }
}

main().catch((error) => {
  writeError(error);
  process.exit(1);
});
