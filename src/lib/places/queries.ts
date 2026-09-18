import { createClient } from '@/lib/supabase/server';
import type { ImportedPlace } from './types';
import { toSecureImageUrl } from '@/lib/media/urls';
import type { DataFreshness, PetPolicy } from '@/lib/pet/policy';

type PlaceViewName = 'v_imported_places' | 'v_published_places';

export type ImportedPlaceRow = {
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
  pet_policy?: string | null;
  pet_note?: string | null;
  pet_data_status?: string | null;
  pet_source_updated_at?: string | null;
  night_highlight?: string | null;
  photo_tip?: string | null;
  short_story?: string | null;
  crowd_forecast_date?: string | null;
  crowd_forecast_rate?: number | string | null;
  crowd_forecast_level?: string | null;
  crowd_data_status?: string | null;
};

const PLACE_SELECT = 'id, slug, display_name, address_full, short_description, hero_image_url, hero_thumbnail_url, kto_content_id, lat, lng, contact_phone, source_modified_at, pet_policy, pet_note, pet_data_status, pet_source_updated_at, night_highlight, photo_tip, short_story, crowd_forecast_date, crowd_forecast_rate, crowd_forecast_level, crowd_data_status';

function asPetPolicy(value: string | null | undefined): PetPolicy {
  return value === 'allowed' || value === 'partial' || value === 'not_allowed' || value === 'unknown' ? value : 'unknown';
}

function asFreshness(value: string | null | undefined): DataFreshness {
  return value === 'fresh' || value === 'stale' || value === 'unavailable' || value === 'unknown' ? value : 'unknown';
}

export function mapPlace(place: ImportedPlaceRow): ImportedPlace {
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
    petPolicy: asPetPolicy(place.pet_policy),
    petNote: place.pet_note ?? null,
    petDataStatus: asFreshness(place.pet_data_status),
    petSourceUpdatedAt: place.pet_source_updated_at ?? null,
    nightHighlight: place.night_highlight ?? null,
    photoTip: place.photo_tip ?? null,
    shortStory: place.short_story ?? null,
    crowdForecast: place.crowd_forecast_date || place.crowd_forecast_rate !== null && place.crowd_forecast_rate !== undefined || place.crowd_forecast_level
      ? {
          forecastDate: place.crowd_forecast_date ?? null,
          rate: place.crowd_forecast_rate === null || place.crowd_forecast_rate === undefined ? null : Number(place.crowd_forecast_rate),
          level: place.crowd_forecast_level ?? null,
        }
      : null,
    crowdDataStatus: asFreshness(place.crowd_data_status),
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
