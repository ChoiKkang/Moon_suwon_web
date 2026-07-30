import { createClient } from '@/lib/supabase/server';
import type { ImportedPlace } from './types';

type ImportedPlaceRow = {
  slug: string;
  display_name: string;
  address_full: string | null;
  short_description: string | null;
  hero_image_url: string | null;
  kto_content_id: string | null;
  lat: number | string | null;
  lng: number | string | null;
  contact_phone: string | null;
};

export async function getImportedPlaces(): Promise<{
  places: ImportedPlace[];
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('v_imported_places')
    .select('slug, display_name, address_full, short_description, hero_image_url, kto_content_id, lat, lng, contact_phone')
    .not('kto_content_id', 'is', null)
    .order('display_name', { ascending: true })
    .limit(12);

  if (error) {
    return {
      places: [],
      error: error.message,
    };
  }

  return {
    places: ((data ?? []) as ImportedPlaceRow[]).map((place) => ({
      slug: place.slug,
      displayName: place.display_name,
      addressFull: place.address_full,
      shortDescription: place.short_description,
      heroImageUrl: place.hero_image_url,
      ktoContentId: place.kto_content_id,
      lat: place.lat === null ? null : Number(place.lat),
      lng: place.lng === null ? null : Number(place.lng),
      contactPhone: place.contact_phone,
    })),
    error: null,
  };
}

export async function getImportedPlaceBySlug(slug: string): Promise<{
  place: ImportedPlace | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('v_imported_places')
    .select('slug, display_name, address_full, short_description, hero_image_url, kto_content_id, lat, lng, contact_phone')
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return {
      place: null,
      error: error.message,
    };
  }

  if (!data) {
    return {
      place: null,
      error: null,
    };
  }

  const row = data as ImportedPlaceRow;

  return {
    place: {
      slug: row.slug,
      displayName: row.display_name,
      addressFull: row.address_full,
      shortDescription: row.short_description,
      heroImageUrl: row.hero_image_url,
      ktoContentId: row.kto_content_id,
      lat: row.lat === null ? null : Number(row.lat),
      lng: row.lng === null ? null : Number(row.lng),
      contactPhone: row.contact_phone,
    },
    error: null,
  };
}
