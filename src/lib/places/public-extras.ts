export type PublicDataStatus = 'fresh' | 'stale' | 'expired' | 'unknown';

export type PublicDataBlock<T> = {
  items: T[];
  dataStatus: PublicDataStatus;
  sourceUpdatedAt: string | null;
  fetchedAt: string | null;
};

export type RelatedPlace = {
  id: string;
  slug: string;
  displayName: string;
  relationScore: number | null;
};

export type WeatherSummaryItem = {
  forecastAt: string;
  category: string;
  valueText: string | null;
  valueNumber: number | null;
  unit: string | null;
};

export type BusArrival = {
  stationId: string;
  stationName: string;
  routeId: string | null;
  routeName: string | null;
  arrivalOrder: number | null;
  arrivalSeconds: number | null;
  remainingStops: number | null;
};

export type PublicPlaceExtras = {
  missionType: string | null;
  missionPrompt: string | null;
  coupleQuestion: string | null;
  relatedPlaces: PublicDataBlock<RelatedPlace>;
  weatherSummary: PublicDataBlock<WeatherSummaryItem>;
  midWeatherSummary: PublicDataBlock<WeatherSummaryItem>;
  nearbyBusArrivals: PublicDataBlock<BusArrival>;
};

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}
function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStatus(value: unknown): PublicDataStatus {
  return value === 'fresh' || value === 'stale' || value === 'expired' || value === 'unknown' ? value : 'unknown';
}

function asBlock<T>(value: unknown, parseItem: (item: unknown) => T | null): PublicDataBlock<T> {
  const record = asRecord(value);
  const items = Array.isArray(record.items)
    ? record.items.map(parseItem).filter((item): item is T => item !== null)
    : [];
  return {
    items,
    dataStatus: asStatus(record.data_status),
    sourceUpdatedAt: asText(record.source_updated_at),
    fetchedAt: asText(record.fetched_at),
  };
}

function parseRelatedPlace(value: unknown): RelatedPlace | null {
  const record = asRecord(value);
  const id = asText(record.id);
  const slug = asText(record.slug);
  const displayName = asText(record.display_name);
  if (!id || !slug || !displayName) return null;
  return { id, slug, displayName, relationScore: asNumber(record.relation_score) };
}

function parseWeatherItem(value: unknown): WeatherSummaryItem | null {
  const record = asRecord(value);
  const forecastAt = asText(record.forecast_at);
  const category = asText(record.category);
  if (!forecastAt || !category) return null;
  const valueText = asText(record.value_text);
  const valueNumber = asNumber(record.value_number);
  if (!valueText && valueNumber === null) return null;
  return {
    forecastAt,
    category,
    valueText,
    valueNumber,
    unit: asText(record.unit),
  };
}

function parseBusArrival(value: unknown): BusArrival | null {
  const record = asRecord(value);
  const stationId = asText(record.station_id);
  const stationName = asText(record.station_name);
  if (!stationId || !stationName) return null;
  return {
    stationId,
    stationName,
    routeId: asText(record.route_id),
    routeName: asText(record.route_name),
    arrivalOrder: asNumber(record.arrival_order),
    arrivalSeconds: asNumber(record.arrival_seconds),
    remainingStops: asNumber(record.remaining_stops),
  };
}

export function parsePublicPlaceExtras(value: unknown): PublicPlaceExtras {
  const record = asRecord(value);
  return {
    missionType: asText(record.mission_type),
    missionPrompt: asText(record.mission_prompt),
    coupleQuestion: asText(record.couple_question),
    relatedPlaces: asBlock(record.related_places, parseRelatedPlace),
    weatherSummary: asBlock(record.weather_summary, parseWeatherItem),
    midWeatherSummary: asBlock(record.mid_weather_summary, parseWeatherItem),
    nearbyBusArrivals: asBlock(record.nearby_bus_arrivals, parseBusArrival),
  };
}

/** The public contract intentionally suppresses expired arrivals, not just their label. */
export function shouldShowBusArrivals(block: PublicDataBlock<BusArrival>): boolean {
  return block.items.length > 0 && block.dataStatus !== 'expired';
}
