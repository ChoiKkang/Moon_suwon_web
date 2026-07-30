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

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function writeError(error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
}

async function main() {
  const kto = new KtoClient({
    serviceKey: getRequiredServerEnv('KTO_SERVICE_KEY'),
  });

  const attractions = await kto.fetchSuwonAttractions();
  const selected = attractions.filter((item) => SELECTED_TITLES.has(item.title));

  writeLine(`Fetched ${attractions.length} KTO Suwon attractions`);
  writeLine(`Selected ${selected.length} places for preview`);

  if (selected.length === 0) {
    throw new Error('No configured KTO places were found in the Suwon attraction response');
  }

  for (const item of selected) {
    const detail = await kto.fetchDetail(item.contentid);
    const images = await kto.fetchImages(item.contentid);
    const normalized = normalizePlace(item, detail);
    const normalizedImages = normalizeImages('preview-place-id', item, images);

    writeLine(
      JSON.stringify(
        {
          title: normalized.official_name,
          contentId: normalized.kto_content_id,
          address: normalized.address_full,
          lat: normalized.lat,
          lng: normalized.lng,
          hasOverview: Boolean(normalized.source_overview_raw),
          imageCount: normalizedImages.length,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  writeError(error);
  process.exit(1);
});
