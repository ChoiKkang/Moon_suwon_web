import type { ImportedPlace } from '@/lib/places/types';

export type ServiceCourse = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  durationMinutes: number;
  distanceKm: number | null;
  petReadyFlag: boolean;
  status: 'live';
  theme: string;
  primaryCta: string;
  places: ImportedPlace[];
  heroImageUrl: string | null;
};
