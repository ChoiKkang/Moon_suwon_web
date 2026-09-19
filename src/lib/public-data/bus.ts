export type BusArrivalSourceItem = {
  stationId: string;
  routeId: string;
  routeName?: string;
  predictTime1?: string;
  predictTime2?: string;
  predictTimeSec1?: string;
  predictTimeSec2?: string;
  locationNo1?: string;
  locationNo2?: string;
};

export type NormalizedBusArrival = {
  stationId: string;
  routeId: string;
  routeName: string | null;
  arrivalOrder: 1 | 2;
  arrivalSeconds: number;
  remainingStops: number | null;
  fetchedAt: string;
};

function nonNegativeInteger(value: string | undefined, label: string): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  if (parsed < 0) throw new Error(`${label} cannot be negative`);
  return parsed;
}

export function normalizeBusArrivals(items: BusArrivalSourceItem[], fetchedAt: string): NormalizedBusArrival[] {
  const fetched = Date.parse(fetchedAt);
  if (!Number.isFinite(fetched)) throw new Error('fetchedAt must be an ISO timestamp');
  const rows: NormalizedBusArrival[] = [];

  for (const item of items) {
    if (!item.stationId?.trim() || !item.routeId?.trim()) throw new Error('stationId and routeId are required');
    for (const arrivalOrder of [1, 2] as const) {
      const secondsValue = item[`predictTimeSec${arrivalOrder}`];
      const minuteValue = item[`predictTime${arrivalOrder}`];
      const seconds = secondsValue !== undefined
        ? nonNegativeInteger(secondsValue, 'arrival time')
        : (() => {
            const minutes = nonNegativeInteger(minuteValue, 'arrival time');
            return minutes === null ? null : minutes * 60;
          })();
      if (seconds === null) continue;
      rows.push({
        stationId: item.stationId,
        routeId: item.routeId,
        routeName: item.routeName?.trim() || null,
        arrivalOrder,
        arrivalSeconds: seconds,
        remainingStops: nonNegativeInteger(item[`locationNo${arrivalOrder}`], 'remaining stops'),
        fetchedAt,
      });
    }
  }

  return rows;
}

export function busSnapshotStatus(
  fetchedAt: string,
  now = new Date(),
): 'fresh' | 'stale' | 'expired' {
  const ageSeconds = (now.getTime() - Date.parse(fetchedAt)) / 1_000;
  if (!Number.isFinite(ageSeconds) || ageSeconds < 0 || ageSeconds > 300) return 'expired';
  if (ageSeconds <= 120) return 'fresh';
  return 'stale';
}

export function isBusSnapshotFresh(fetchedAt: string, now = new Date()): boolean {
  return busSnapshotStatus(fetchedAt, now) === 'fresh';
}
