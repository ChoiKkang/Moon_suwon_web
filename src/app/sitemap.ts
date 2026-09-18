import type { MetadataRoute } from 'next';
import { getPublishedPlaces } from '@/lib/places/queries';
import { getAllUpcomingEvents } from '@/lib/events/queries';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const now = new Date();

  // 정적 기본 페이지
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/courses`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/events`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${siteUrl}/terms`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  // DB에 공개된 장소·행사 동적 페이지
  try {
    const [{ places }, { events }] = await Promise.all([getPublishedPlaces(), getAllUpcomingEvents()]);
    const placeRoutes: MetadataRoute.Sitemap = places.map((place) => ({
      url: `${siteUrl}/places/${encodeURIComponent(place.slug)}`,
      lastModified: place.sourceModifiedAt ? new Date(place.sourceModifiedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
    const eventRoutes: MetadataRoute.Sitemap = events.map((event) => ({
      url: `${siteUrl}/events/${encodeURIComponent(event.eventContentId)}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    return [...staticRoutes, ...placeRoutes, ...eventRoutes];
  } catch {
    return staticRoutes;
  }
}
