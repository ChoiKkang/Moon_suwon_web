import { createClient } from '@/lib/supabase/server';
import type { ImportedPlace } from '@/lib/places/types';
import type { ServiceCourse } from './types';
import { toSecureImageUrl } from '@/lib/media/urls';
import type { DataFreshness, PetPolicy } from '@/lib/pet/policy';

type HomeCourseRow = {
  id: string;
  slug: string;
  theme_tags: string[] | null;
  estimated_duration_min: number;
  walking_distance_km: number | string | null;
  hero_title: string;
  subtitle: string | null;
  route_summary: string | null;
  display_priority: number | null;
  hero_image_url: string | null;
  pet_ready_flag: boolean | null;
};

export type CourseDetailRow = {
  course_id: string;
  order_index: number;
  place_id: string;
  place_slug: string;
  display_name: string;
  lat?: number | string | null;
  lng?: number | string | null;
  category?: string | null;
  recommended_stay_min?: number | null;
  hero_image_url: string | null;
  night_highlight?: string | null;
  photo_tip?: string | null;
  short_story?: string | null;
  pet_policy?: PetPolicy | string | null;
  pet_note?: string | null;
  pet_data_status?: DataFreshness | string | null;
  pet_source_updated_at?: string | null;
  crowd_forecast_date?: string | null;
  crowd_forecast_rate?: number | string | null;
  crowd_forecast_level?: string | null;
  crowd_data_status?: DataFreshness | string | null;
};

/**
 * A published course must only point at published place pages. Keeping this
 * check in the public adapter prevents a stale course link from becoming a
 * 404 when an operator unpublishes one of its stops.
 */
export function courseHasPublishedPlaces(placeIds: string[], publishedPlaceIds: ReadonlySet<string>): boolean {
  return placeIds.length > 0 && placeIds.every((placeId) => publishedPlaceIds.has(placeId));
}

export function mapCoursePlace(detail: CourseDetailRow): ImportedPlace {
  const petPolicy: PetPolicy = detail.pet_policy === 'allowed' || detail.pet_policy === 'partial' || detail.pet_policy === 'not_allowed' || detail.pet_policy === 'unknown'
    ? detail.pet_policy
    : 'unknown';
  const petDataStatus: DataFreshness = detail.pet_data_status === 'fresh' || detail.pet_data_status === 'stale' || detail.pet_data_status === 'unavailable' || detail.pet_data_status === 'unknown'
    ? detail.pet_data_status
    : 'unknown';
  const crowdDataStatus: DataFreshness = detail.crowd_data_status === 'fresh' || detail.crowd_data_status === 'stale' || detail.crowd_data_status === 'unavailable' || detail.crowd_data_status === 'unknown'
    ? detail.crowd_data_status
    : 'unknown';

  return {
    id: detail.place_id,
    slug: detail.place_slug,
    displayName: detail.display_name,
    addressFull: null,
    shortDescription: null,
    heroImageUrl: toSecureImageUrl(detail.hero_image_url),
    heroThumbnailUrl: null,
    ktoContentId: null,
    lat: detail.lat === null || detail.lat === undefined ? null : Number(detail.lat),
    lng: detail.lng === null || detail.lng === undefined ? null : Number(detail.lng),
    contactPhone: null,
    sourceModifiedAt: null,
    petPolicy,
    petNote: detail.pet_note ?? null,
    petDataStatus,
    petSourceUpdatedAt: detail.pet_source_updated_at ?? null,
    nightHighlight: detail.night_highlight ?? null,
    photoTip: detail.photo_tip ?? null,
    shortStory: detail.short_story ?? null,
    crowdForecast: detail.crowd_forecast_date || detail.crowd_forecast_rate !== null && detail.crowd_forecast_rate !== undefined || detail.crowd_forecast_level
      ? {
          forecastDate: detail.crowd_forecast_date ?? null,
          rate: detail.crowd_forecast_rate === null || detail.crowd_forecast_rate === undefined ? null : Number(detail.crowd_forecast_rate),
          level: detail.crowd_forecast_level ?? null,
        }
      : null,
    crowdDataStatus,
  };
}

export async function getPublishedCourses(): Promise<{
  courses: ServiceCourse[];
  error: string | null;
}> {
  const supabase = await createClient();

  const [homeResult, detailResult, publishedPlacesResult] = await Promise.all([
    supabase
      .from('v_home_courses')
      .select('id, slug, theme_tags, estimated_duration_min, walking_distance_km, pet_ready_flag, hero_title, subtitle, route_summary, display_priority, hero_image_url')
      .order('display_priority', { ascending: true }),
    supabase
      .from('v_course_detail')
      .select('course_id, order_index, place_id, place_slug, display_name, lat, lng, category, recommended_stay_min, hero_image_url, night_highlight, photo_tip, short_story, pet_policy, pet_note, pet_data_status, pet_source_updated_at, crowd_forecast_date, crowd_forecast_rate, crowd_forecast_level, crowd_data_status')
      .order('order_index', { ascending: true }),
    supabase
      .from('v_published_places')
      .select('id')
      .not('kto_content_id', 'is', null),
  ]);

  const firstErrorMessage = homeResult.error?.message
    ?? detailResult.error?.message
    ?? publishedPlacesResult.error?.message;

  if (firstErrorMessage) {
    return {
      courses: [],
      error: firstErrorMessage,
    };
  }

  const placesByCourse = new Map<string, CourseDetailRow[]>();

  for (const detail of (detailResult.data ?? []) as CourseDetailRow[]) {
    const rows = placesByCourse.get(detail.course_id) ?? [];
    rows.push(detail);
    placesByCourse.set(detail.course_id, rows);
  }

  const publishedPlaceIds = new Set((publishedPlacesResult.data ?? []).map((place) => place.id as string));

  return {
    courses: ((homeResult.data ?? []) as HomeCourseRow[]).flatMap((course) => {
      const detailRows = (placesByCourse.get(course.id) ?? []).sort((a, b) => a.order_index - b.order_index);
      if (!courseHasPublishedPlaces(detailRows.map((place) => place.place_id), publishedPlaceIds)) {
        return [];
      }

      const places = detailRows.map(mapCoursePlace);

      return [{
        id: course.id,
        slug: course.slug,
        title: course.hero_title,
        subtitle: course.subtitle ?? '달빛수원 공개 코스',
        description: course.route_summary ?? '코스 설명을 준비 중입니다.',
        durationMinutes: course.estimated_duration_min,
        distanceKm: course.walking_distance_km === null ? null : Number(course.walking_distance_km),
        petReadyFlag: course.pet_ready_flag === true,
        status: 'live' as const,
        theme: course.theme_tags?.join(' · ') || '달빛수원 코스',
        primaryCta: '코스 스팟 보기',
        places,
        heroImageUrl: toSecureImageUrl(course.hero_image_url) ?? places[0]?.heroImageUrl ?? null,
      }];
    }),
    error: null,
  };
}
