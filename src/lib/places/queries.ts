import { createClient } from '@/lib/supabase/server';
import type { ImportedPlace } from './types';
import { toSecureImageUrl } from '@/lib/media/urls';
import type { DataFreshness, PetPolicy } from '@/lib/pet/policy';
import type { AccessibilityFacts } from './accessibility';
import { mapAudioStory, type AudioStory, type AudioStoryRow } from './audio-stories';

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
  access_route?: string | null;
  access_exit?: string | null;
  access_elevator?: string | null;
  access_parking?: string | null;
  access_public_transport?: string | null;
  access_wheelchair?: string | null;
  access_braille_block?: string | null;
  access_braille_promotion?: string | null;
  access_audio_guide?: string | null;
  access_big_print?: string | null;
  access_help_dog?: string | null;
  access_restroom?: string | null;
  access_lactation_room?: string | null;
  access_stroller?: string | null;
  access_infants_family?: string | null;
  access_etc?: string | null;
  access_source_updated_at?: string | null;
};

const PLACE_SELECT = 'id, slug, display_name, address_full, short_description, hero_image_url, hero_thumbnail_url, kto_content_id, lat, lng, contact_phone, source_modified_at, pet_policy, pet_note, pet_data_status, pet_source_updated_at, night_highlight, photo_tip, short_story, crowd_forecast_date, crowd_forecast_rate, crowd_forecast_level, crowd_data_status, access_route, access_exit, access_elevator, access_parking, access_public_transport, access_wheelchair, access_braille_block, access_braille_promotion, access_audio_guide, access_big_print, access_help_dog, access_restroom, access_lactation_room, access_stroller, access_infants_family, access_etc, access_source_updated_at';

function asAccessibility(place: ImportedPlaceRow): AccessibilityFacts {
  return {
    route: place.access_route ?? null,
    exit: place.access_exit ?? null,
    elevator: place.access_elevator ?? null,
    parking: place.access_parking ?? null,
    publicTransport: place.access_public_transport ?? null,
    wheelchair: place.access_wheelchair ?? null,
    brailleBlock: place.access_braille_block ?? null,
    braillePromotion: place.access_braille_promotion ?? null,
    audioGuide: place.access_audio_guide ?? null,
    bigPrint: place.access_big_print ?? null,
    helpDog: place.access_help_dog ?? null,
    restroom: place.access_restroom ?? null,
    lactationRoom: place.access_lactation_room ?? null,
    stroller: place.access_stroller ?? null,
    infantsFamily: place.access_infants_family ?? null,
    etc: place.access_etc ?? null,
    sourceUpdatedAt: place.access_source_updated_at ?? null,
  };
}

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
    accessibility: asAccessibility(place),
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

/**
 * 장소에 붙은 오디오 해설.
 *
 * 장소당 여러 건이라 평면 뷰에 담을 수 없어 별도 뷰에서 읽는다. 해설이 없으면
 * 화면에서 카드를 감추므로 조회 실패와 0건을 같게 취급한다.
 */
export async function getPlaceAudioStories(placeId: string): Promise<AudioStory[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_published_place_audio_stories')
    .select('story_lang_id, spot_title, audio_title, script, play_seconds, audio_url, distance_m')
    .eq('place_id', placeId)
    .order('distance_m', { ascending: true });

  if (error) return [];

  return ((data ?? []) as AudioStoryRow[]).map(mapAudioStory);
}

export async function getPublishedPlaceBySlug(slug: string): Promise<{
  place: ImportedPlace | null;
  error: string | null;
}> {
  const supabase = await createClient();

  // Hangul slugs can arrive in either Unicode normalization form: browsers and
  // macOS share URLs as NFC, while older rows were stored as decomposed NFD.
  // Both spellings render identically, so try every distinct form before
  // deciding a place does not exist.
  const candidates = [...new Set([slug, slug.normalize('NFC'), slug.normalize('NFD')])];

  for (const candidate of candidates) {
    const { data, error } = await supabase
      .from('v_published_places')
      .select(PLACE_SELECT)
      .eq('slug', candidate)
      .maybeSingle();

    if (error) {
      return { place: null, error: error.message };
    }

    if (data) {
      return { place: mapPlace(data as ImportedPlaceRow), error: null };
    }
  }

  return { place: null, error: null };
}
