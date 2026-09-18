import { createClient } from '@/lib/supabase/server';
import type { ImportedPlace } from '@/lib/places/types';
import type { ServiceCourse } from './types';
import { toSecureImageUrl } from '@/lib/media/urls';

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
};

type CourseDetailRow = {
  course_id: string;
  order_index: number;
  place_id: string;
  place_slug: string;
  display_name: string;
  hero_image_url: string | null;
};

/**
 * A published course must only point at published place pages. Keeping this
 * check in the public adapter prevents a stale course link from becoming a
 * 404 when an operator unpublishes one of its stops.
 */
export function courseHasPublishedPlaces(placeIds: string[], publishedPlaceIds: ReadonlySet<string>): boolean {
  return placeIds.length > 0 && placeIds.every((placeId) => publishedPlaceIds.has(placeId));
}

function mapCoursePlace(detail: CourseDetailRow): ImportedPlace {
  return {
    id: detail.place_id,
    slug: detail.place_slug,
    displayName: detail.display_name,
    addressFull: null,
    shortDescription: null,
    heroImageUrl: toSecureImageUrl(detail.hero_image_url),
    heroThumbnailUrl: null,
    ktoContentId: null,
    lat: null,
    lng: null,
    contactPhone: null,
    sourceModifiedAt: null,
    petPolicy: 'unknown',
    petNote: null,
    petDataStatus: 'unknown',
    petSourceUpdatedAt: null,
    crowdForecast: null,
    crowdDataStatus: 'unknown',
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
      .select('id, slug, theme_tags, estimated_duration_min, walking_distance_km, hero_title, subtitle, route_summary, display_priority, hero_image_url')
      .order('display_priority', { ascending: true }),
    supabase
      .from('v_course_detail')
      .select('course_id, order_index, place_id, place_slug, display_name, hero_image_url')
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
