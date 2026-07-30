import type { ImportedPlace } from '@/lib/places/types';

export type ServiceCourseStatus = 'live' | 'curation';

export type ServiceCourse = {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  durationMinutes: number;
  distanceKm: number;
  status: ServiceCourseStatus;
  theme: string;
  primaryCta: string;
  places: ImportedPlace[];
  plannedPlaces: string[];
};
