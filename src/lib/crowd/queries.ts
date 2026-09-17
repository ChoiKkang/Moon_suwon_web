import { createClient } from '@/lib/supabase/server';
import { toSecureImageUrl } from '@/lib/media/urls';

export type NowGoodSpot = {
  placeId: string;
  slug: string;
  displayName: string;
  heroImageUrl: string | null;
  forecastScore: number | null;
  crowdLevel: string | null;
  forecastAvailable: boolean;
};

type NowGoodSpotRow = {
  place_id: string;
  slug: string;
  display_name: string;
  hero_image_url: string | null;
  forecast_score: number | string | null;
  crowd_level: string | null;
  forecast_available: boolean;
};

export async function getNowGoodSpots(): Promise<{
  spots: NowGoodSpot[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_now_good_spot_candidates')
    .select('place_id, slug, display_name, hero_image_url, forecast_score, crowd_level, forecast_available')
    .order('forecast_score', { ascending: true, nullsFirst: false });

  if (error) {
    return { spots: [], error: error.message };
  }

  return {
    spots: ((data ?? []) as NowGoodSpotRow[]).map((spot) => ({
      placeId: spot.place_id,
      slug: spot.slug,
      displayName: spot.display_name,
      heroImageUrl: toSecureImageUrl(spot.hero_image_url),
      forecastScore: spot.forecast_score === null ? null : Number(spot.forecast_score),
      crowdLevel: spot.crowd_level,
      forecastAvailable: spot.forecast_available,
    })),
    error: null,
  };
}
