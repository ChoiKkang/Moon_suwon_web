import { loadEnvConfig } from '@next/env';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  source_modified_at: string | null;
};
type SourceRow = { place_id: string; ingestion_status: string | null };
type StateRow = {
  place_id: string;
  is_published: boolean | null;
  night_suitability_score: number | string | null;
  recommendation_boost: number | string | null;
};
type CopyRow = { place_id: string; display_name: string | null };
type PetRow = { place_id: string; pet_policy: string | null; data_status: string | null; last_checked_at: string | null };

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

function automationMetadata(plan: ReturnType<typeof planCourseDrafts>[number], inputChecksum: string): Record<string, unknown> {
  return {
    schema_version: 1,
    automation_source: plan.automationSource,
    automation_key: plan.automationKey,
    provider: 'deterministic',
    model: null,
    prompt_version: null,
    input_checksum: inputChecksum,
    distance_kind: plan.distanceKind,
    evidence: plan.evidence,
    constraint_violations: plan.constraintViolations,
  };
}

async function main() {
  const dryRun = hasFlag('--dry-run');
  const plansLimit = readLimit();
  const [placesResult, sourcesResult, statesResult, copiesResult, imagesResult, petsResult] = await Promise.all([
    supabase.schema('core').from('places').select('id, slug, official_name, lat, lng, category, is_active, source_modified_at').eq('is_active', true),
    supabase.schema('core').from('place_sources').select('place_id, ingestion_status'),
    supabase.schema('editorial').from('place_publish_state').select('place_id, is_published, night_suitability_score, recommendation_boost'),
    supabase.schema('editorial').from('place_copy').select('place_id, display_name'),
    supabase.schema('core').from('place_images').select('place_id').eq('is_hero', true),
    supabase.schema('core').from('place_pet_policies').select('place_id, pet_policy, data_status, last_checked_at'),
  ]);

  const firstError = placesResult.error ?? sourcesResult.error ?? statesResult.error ?? copiesResult.error ?? imagesResult.error ?? petsResult.error;
  if (firstError) throw new Error(`course draft source query failed: ${firstError.message}`);

  const placesById = new Map((placesResult.data as PlaceRow[]).map((place) => [place.id, place]));
  const sourcesById = new Map((sourcesResult.data as SourceRow[]).map((source) => [source.place_id, source]));
  const copiesById = new Map((copiesResult.data as CopyRow[]).map((copy) => [copy.place_id, copy]));
  const petsById = new Map((petsResult.data as PetRow[]).map((pet) => [pet.place_id, pet]));
  const heroIds = new Set((imagesResult.data ?? []).map((row) => row.place_id as string));
  const plannerPlaces: CoursePlannerPlace[] = [];

  for (const state of statesResult.data as StateRow[]) {
    if (state.is_published !== true) continue;
    const place = placesById.get(state.place_id);
    if (!place) continue;
    const source = sourcesById.get(place.id);
    if (source?.ingestion_status === 'candidate' || source?.ingestion_status === 'rejected' || source?.ingestion_status === 'stale') continue;
    const pet = petsById.get(place.id);
    plannerPlaces.push({
      id: place.id,
      slug: place.slug,
      displayName: copiesById.get(place.id)?.display_name?.trim() || place.official_name,
      lat: asNumber(place.lat),
      lng: asNumber(place.lng),
      category: place.category,
      nightSuitabilityScore: asNumber(state.night_suitability_score),
      recommendationBoost: asNumber(state.recommendation_boost),
      petReady: petReady(pet?.pet_policy) && pet?.data_status === 'fresh',
      petPolicy: pet?.pet_policy === 'allowed' || pet?.pet_policy === 'partial' || pet?.pet_policy === 'not_allowed' || pet?.pet_policy === 'unknown' ? pet.pet_policy : 'unknown',
      petDataStatus: pet?.data_status === 'fresh' || pet?.data_status === 'stale' || pet?.data_status === 'unavailable' || pet?.data_status === 'unknown' ? pet.data_status : 'unknown',
      sourceModifiedAt: place.source_modified_at,
      hasHeroImage: heroIds.has(place.id),
      hasContent: Boolean(copiesById.get(place.id)?.display_name?.trim()),
      isPublished: true,
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

  const inputChecksum = createHash('sha256')
    .update(JSON.stringify([...plannerPlaces].sort((a, b) => a.id.localeCompare(b.id))))
    .digest('hex');
  const startedAt = new Date().toISOString();
  const generationRun = await supabase.schema('raw').from('course_generation_runs').insert({
    source: 'heuristic-v2',
    status: 'running',
    model: null,
    prompt_version: null,
    input_checksum: inputChecksum,
    metadata: { candidate_count: plannerPlaces.length, plan_count: plans.length },
    started_at: startedAt,
  }).select('id').single();
  if (generationRun.error || !generationRun.data?.id) throw new Error(`course generation run could not start: ${generationRun.error?.message ?? 'no id returned'}`);

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
    const metadataResult = await supabase.schema('core').from('courses').update({ automation_metadata: automationMetadata(plan, inputChecksum) }).eq('id', data as string);
    if (metadataResult.error) throw new Error(`course metadata ${plan.slug} failed: ${metadataResult.error.message}`);
    writtenCount += 1;
  }

  await supabase.schema('raw').from('course_generation_runs').update({
    status: 'completed',
    completed_at: new Date().toISOString(),
    metadata: { candidate_count: plannerPlaces.length, plan_count: plans.length, written_count: writtenCount },
  }).eq('id', generationRun.data.id);

  writeGithubOutput(plans, writtenCount, false);
  writeSummary(plans, writtenCount, false);
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
