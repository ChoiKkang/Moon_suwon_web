import type { DataFreshness, PetPolicy } from '@/lib/pet/policy';

export type ImportedPlace = {
  id: string;
  slug: string;
  displayName: string;
  addressFull: string | null;
  shortDescription: string | null;
  heroImageUrl: string | null;
  heroThumbnailUrl: string | null;
  ktoContentId: string | null;
  lat: number | null;
  lng: number | null;
  contactPhone: string | null;
  sourceModifiedAt: string | null;
  petPolicy: PetPolicy;
  petNote: string | null;
  petDataStatus: DataFreshness;
  petSourceUpdatedAt: string | null;
  nightHighlight: string | null;
  photoTip: string | null;
  shortStory: string | null;
  crowdForecast: {
    forecastDate: string | null;
    rate: number | null;
    level: string | null;
  } | null;
  crowdDataStatus: DataFreshness;
};
