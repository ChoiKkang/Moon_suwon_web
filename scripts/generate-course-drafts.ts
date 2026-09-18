import { loadEnvConfig } from '@next/env';
import { appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { planCourseDrafts, type CoursePlannerPlace } from '../src/lib/courses/draft-planner';

loadEnvConfig(process.cwd());

type PlaceRow = {
  id: string;
  slug: string;
  official_name: string;
  lat: number | string;
  lng: number | string;
  category: string | null;
  is_active: boolean | null;
};
type StateRow = {
  place_id: string;
  is_published: boolean | null;
  night_suitability_score: number | string | null;
  recommendation_boost: number | string | null;
};
type CopyRow = { place_id: string; display_name: string | null };
type PetRow = { place_id: string; pet_policy: string | null };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function readLimit(): number {
  const index = process.argv.indexOf('--limit');
  if (index < 0) return 3;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 3) {
    throw new Error('--limit must be an integer between 1 and 3');
  }
  return value;
}

function asNumber(value: number | string | null | undefined): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function petReady(policy: string | null | undefined): boolean {
  return ['allowed', '가능', '동반 가능', '동반가능'].includes(String(policy ?? '').trim().toLowerCase());
}

function writeSummary(plans: ReturnType<typeof planCourseDrafts>, writtenCount: number, dryRun: boolean) {
  const lines = [
    '## Course draft generation',
    `- mode: ${dryRun ? 'dry-run' : 'write'}`,
    `- candidates: ${plans.length}`,
    `- ${dryRun ? 'would create/update' : 'created/updated'}: ${writtenCount}`,
  ];
  for (const plan of plans) lines.push(`- ${plan.heroTitle}: ${plan.placeIds.length} stops, ${plan.walkingDistanceKm.toFixed(2)} km, unpublished`);

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    appendFileSync(summaryPath, `${lines.join('\n')}\n`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

function writeGithubOutput(plans: ReturnType<typeof planCourseDrafts>, writtenCount: number, dryRun: boolean) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;
  appendFileSync(outputPath, `candidate_count=${plans.length}\nwritten_count=${writtenCount}\nmode=${dryRun ? 'dry-run' : 'write'}\n`);
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const plansLimit = readLimit();
  const [placesResult, statesResult, copiesResult, petsResult] = await Promise.all([
    supabase.schema('core').from('places').select('id, slug, official_name, lat, lng, category, is_active').eq('is_active', true),
    supabase.schema('editorial').from('place_publish_state').select('place_id, is_published, night_suitability_score, recommendation_boost'),
    supabase.schema('editorial').from('place_copy').select('place_id, display_name'),
    supabase.schema('core').from('place_pet_policies').select('place_id, pet_policy'),
  ]);

  const firstError = placesResult.error ?? statesResult.error ?? copiesResult.error ?? petsResult.error;
  if (firstError) throw new Error(`course draft source query failed: ${firstError.message}`);

  const placesById = new Map((placesResult.data as PlaceRow[]).map((place) => [place.id, place]));
  const copiesById = new Map((copiesResult.data as CopyRow[]).map((copy) => [copy.place_id, copy]));
  const petsById = new Map((petsResult.data as PetRow[]).map((pet) => [pet.place_id, pet]));
  const plannerPlaces: CoursePlannerPlace[] = [];

  for (const state of statesResult.data as StateRow[]) {
    if (state.is_published !== true) continue;
    const place = placesById.get(state.place_id);
    if (!place) continue;
    plannerPlaces.push({
      id: place.id,
      slug: place.slug,
      displayName: copiesById.get(place.id)?.display_name?.trim() || place.official_name,
      lat: asNumber(place.lat),
      lng: asNumber(place.lng),
      category: place.category,
      nightSuitabilityScore: asNumber(state.night_suitability_score),
      recommendationBoost: asNumber(state.recommendation_boost),
      petReady: petReady(petsById.get(place.id)?.pet_policy),
    });
  }

  const plans = planCourseDrafts(plannerPlaces, { maxPlans: plansLimit });
  if (plans.length === 0) {
    writeGithubOutput([], 0, dryRun);
    writeSummary([], 0, dryRun);
    return;
  }

  if (dryRun) {
    for (const plan of plans) process.stdout.write(`${plan.slug} | ${plan.routeSummary}\n`);
    writeGithubOutput(plans, plans.length, true);
    writeSummary(plans, plans.length, true);
    return;
  }

  let writtenCount = 0;
  for (const plan of plans) {
    const { data, error } = await supabase.rpc('admin_upsert_course', {
      p_payload: {
        slug: plan.slug,
        theme_tags: plan.themeTags,
        estimated_duration_min: plan.estimatedDurationMin,
        walking_distance_km: plan.walkingDistanceKm,
        recommended_start_time: plan.recommendedStartTime,
        pet_ready_flag: plan.petReadyFlag,
        is_published: false,
        display_priority: plan.displayPriority,
        ops_memo: plan.opsMemo,
        hero_title: plan.heroTitle,
        subtitle: plan.subtitle,
        route_summary: plan.routeSummary,
        og_title: plan.ogTitle,
        og_description: plan.ogDescription,
        og_image_url: null,
        place_ids: plan.placeIds,
        automation_source: plan.automationSource,
        automation_key: plan.automationKey,
      },
    });
    if (error || !data) throw new Error(`course draft ${plan.slug} failed: ${error?.message ?? 'no course id returned'}`);
    writtenCount += 1;
  }

  writeGithubOutput(plans, writtenCount, false);
  writeSummary(plans, writtenCount, false);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
