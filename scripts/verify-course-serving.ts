import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});

async function main() {
  const [homeResult, detailResult, publishedPlacesResult] = await Promise.all([
    supabase
      .from('v_home_courses')
      .select('id, slug, hero_title, spot_count')
      .order('display_priority', { ascending: true }),
    supabase
      .from('v_course_detail')
      .select('course_id, order_index, place_id')
      .order('order_index', { ascending: true }),
    supabase
      .from('v_published_places')
      .select('id, slug'),
  ]);

  if (homeResult.error) {
    throw new Error(`Failed to read v_home_courses: ${homeResult.error.message}`);
  }

  if (detailResult.error) {
    throw new Error(`Failed to read v_course_detail: ${detailResult.error.message}`);
  }

  if (publishedPlacesResult.error) {
    throw new Error(`Failed to read v_published_places: ${publishedPlacesResult.error.message}`);
  }

  const detailCounts = new Map<string, number>();
  for (const row of detailResult.data ?? []) {
    detailCounts.set(row.course_id, (detailCounts.get(row.course_id) ?? 0) + 1);
  }

  const publishedPlaceIds = new Set((publishedPlacesResult.data ?? []).map((place) => place.id as string));
  const brokenLinks = (detailResult.data ?? []).filter((row) => !publishedPlaceIds.has(row.place_id as string));
  if (brokenLinks.length > 0) {
    throw new Error(`Published course details contain ${brokenLinks.length} unpublished place links.`);
  }

  console.log(`Published courses: ${homeResult.data?.length ?? 0}`);
  for (const course of homeResult.data ?? []) {
    console.log(`${course.hero_title} | ${course.slug} | ${detailCounts.get(course.id) ?? 0} places`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
