import { createClient } from '@/lib/supabase/server';
import type { ImportedPlace } from './types';
import { toSecureImageUrl } from '@/lib/media/urls';

type PlaceViewName = 'v_imported_places' | 'v_published_places';

type ImportedPlaceRow = {
  id: string;
  slug: string;
  display_name: string;
  address_full: string | null;
  short_description: string | null;
  hero_image_url: string | null;
  hero_thumbnail_url: string | null;
  kto_content_id: string | null;
  lat: number | string | null;
  lng: number | string | null;
  contact_phone: string | null;
  source_modified_at: string | null;
};

const PLACE_SELECT = 'id, slug, display_name, address_full, short_description, hero_image_url, hero_thumbnail_url, kto_content_id, lat, lng, contact_phone, source_modified_at';

function mapPlace(place: ImportedPlaceRow): ImportedPlace {
  return {
    id: place.id,
    slug: place.slug,
    displayName: place.display_name,
    addressFull: place.address_full,
    shortDescription: place.short_description,
    heroImageUrl: toSecureImageUrl(place.hero_image_url),
    heroThumbnailUrl: toSecureImageUrl(place.hero_thumbnail_url),
    ktoContentId: place.kto_content_id,
    lat: place.lat === null ? null : Number(place.lat),
    lng: place.lng === null ? null : Number(place.lng),
    contactPhone: place.contact_phone,
    sourceModifiedAt: place.source_modified_at,
  };
}

async function getPlacesFromView(view: PlaceViewName): Promise<{
  places: ImportedPlace[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(view)
    .select(PLACE_SELECT)
    .not('kto_content_id', 'is', null)
    .order('display_name', { ascending: true });

  if (error) {
    return { places: [], error: error.message };
  }

  return {
    places: ((data ?? []) as ImportedPlaceRow[]).map(mapPlace),
    error: null,
  };
}

export function getImportedPlaces() {
  return getPlacesFromView('v_imported_places');
}

export function getPublishedPlaces() {
  return getPlacesFromView('v_published_places');
}

export async function getPublishedPlaceBySlug(slug: string): Promise<{
  place: ImportedPlace | null;
  error: string | null;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('v_published_places')
    .select(PLACE_SELECT)
    .eq('slug', slug)
    .maybeSingle();

  if (error) {
    return { place: null, error: error.message };
  }

  return {
    place: data ? mapPlace(data as ImportedPlaceRow) : null,
    error: null,
  };
}
