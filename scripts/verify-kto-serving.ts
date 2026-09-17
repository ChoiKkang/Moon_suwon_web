import { createClient } from '@supabase/supabase-js';
import { loadEnvConfig } from '@next/env';
import { getRequiredServerEnv } from '../src/lib/env/server';

loadEnvConfig(process.cwd());

const supabase = createClient(
  getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_URL'),
  getRequiredServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  { auth: { persistSession: false } },
);

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function writeError(error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
}

async function main() {
  const { data, error } = await supabase
    .from('v_imported_places')
    .select('slug, display_name, address_full, hero_image_url, kto_content_id')
    .limit(20);

  if (error) {
    throw new Error(`Failed to read the public serving.v_imported_places view with the anonymous key: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('The public serving.v_imported_places view returned 0 rows');
  }

  writeLine(`Public serving rows: ${data.length}`);

  for (const row of data) {
    writeLine(`${row.display_name} | ${row.kto_content_id} | ${row.hero_image_url ?? 'no image'}`);
  }
}

main().catch((error) => {
  writeError(error);
  process.exit(1);
});
