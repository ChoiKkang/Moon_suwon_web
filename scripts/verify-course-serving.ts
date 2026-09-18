import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
const serviceSupabase = createClient(supabaseUrl, serviceRoleKey, {
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

  const generatedResult = await serviceSupabase
    .schema('core')
    .from('courses')
    .select('id, slug, automation_source, automation_key, automation_metadata')
    .not('automation_source', 'is', null)
    .limit(100);
  if (generatedResult.error) throw new Error(`Failed to read generated course metadata: ${generatedResult.error.message}`);
  for (const course of generatedResult.data ?? []) {
    if (!course.automation_key || !course.automation_metadata || typeof course.automation_metadata !== 'object') {
      throw new Error(`Generated course ${course.slug} is missing automation provenance.`);
    }
    const metadata = course.automation_metadata as { distance_kind?: unknown; evidence?: unknown; constraint_violations?: unknown };
    if (metadata.distance_kind !== 'straight_line_estimate' && metadata.distance_kind !== 'routed') {
      throw new Error(`Generated course ${course.slug} has an invalid distance kind.`);
    }
    if (!Array.isArray(metadata.evidence) || !Array.isArray(metadata.constraint_violations)) {
      throw new Error(`Generated course ${course.slug} is missing evidence or constraint metadata.`);
    }
  }

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
  console.log(`Generated drafts with provenance: ${generatedResult.data?.length ?? 0}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
