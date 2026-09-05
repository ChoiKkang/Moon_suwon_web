import type { MetadataRoute } from 'next';
import { getPublishedPlaces } from '@/lib/places/queries';

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

  // DB에 공개된 장소 동적 페이지
  try {
    const { places } = await getPublishedPlaces();
    const placeRoutes: MetadataRoute.Sitemap = places.map((place) => ({
      url: `${siteUrl}/places/${encodeURIComponent(place.slug)}`,
      lastModified: place.sourceModifiedAt ? new Date(place.sourceModifiedAt) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticRoutes, ...placeRoutes];
  } catch {
    return staticRoutes;
  }
}
