export type VillageForecastItem = {
  baseDate?: string;
  baseTime?: string;
  fcstDate: string;
  fcstTime: string;
  category: string;
  fcstValue: string;
};

export type NormalizedVillageForecast = {
  issuedAt: string;
  forecastAt: string;
  temperatureC: number | null;
  precipitationProbability: number | null;
  precipitationType: number | null;
  precipitationAmountMm: number | null;
  precipitationText: string | null;
  windSpeedMps: number | null;
  skyCode: number | null;
};

export type NormalizedMidForecast = {
  dayOffset: number;
  forecastDate: string;
  weatherAm: string | null;
  weatherPm: string | null;
  minTemperatureC: number | null;
  maxTemperatureC: number | null;
  issuedAt: string;
};

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function forecastIso(date: string, time: string): string {
  if (!/^\d{8}$/.test(date) || !/^\d{4}$/.test(time)) {
    throw new Error(`Invalid KMA forecast date/time: ${date} ${time}`);
  }
  return new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time.slice(0, 2)}:${time.slice(2, 4)}:00+09:00`).toISOString();
}

export function normalizeVillageForecast(
  items: VillageForecastItem[],
  issuedAt: string,
): NormalizedVillageForecast[] {
  const byTime = new Map<string, Map<string, string>>();
  for (const item of items) {
    if (!['TMP', 'POP', 'PTY', 'PCP', 'WSD', 'SKY'].includes(item.category)) continue;
    const key = `${item.fcstDate}:${item.fcstTime}`;
    const values = byTime.get(key) ?? new Map<string, string>();
    values.set(item.category, item.fcstValue);
    byTime.set(key, values);
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => {
      const [date, time] = key.split(':');
      const precipitationText = values.get('PCP') ?? null;
      return {
        issuedAt,
        forecastAt: forecastIso(date, time),
        temperatureC: finiteNumber(values.get('TMP')),
        precipitationProbability: finiteNumber(values.get('POP')),
        precipitationType: finiteNumber(values.get('PTY')),
        precipitationAmountMm: precipitationText && /^(?:강수없음|-)$/.test(precipitationText.trim())
          ? null
          : finiteNumber(precipitationText?.replace(/[^\d.]/g, '')),
        precipitationText,
        windSpeedMps: finiteNumber(values.get('WSD')),
        skyCode: finiteNumber(values.get('SKY')),
      };
    });
}

function addLocalDays(issuedAt: string, days: number): string {
  const localDate = issuedAt.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) throw new Error(`Invalid issuedAt: ${issuedAt}`);
  const date = new Date(`${localDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeMidForecast(
  land: Record<string, string | undefined>,
  temperature: Record<string, string | undefined>,
  issuedAt: string,
): NormalizedMidForecast[] {
  const rows: NormalizedMidForecast[] = [];
  for (let day = 4; day <= 11; day += 1) {
    const weather = land[`wf${day}`] ?? null;
    rows.push({
      dayOffset: day,
      forecastDate: addLocalDays(issuedAt, day),
      weatherAm: land[`wf${day}Am`] ?? weather,
      weatherPm: land[`wf${day}Pm`] ?? weather,
      minTemperatureC: finiteNumber(temperature[`taMin${day}`]),
      maxTemperatureC: finiteNumber(temperature[`taMax${day}`]),
      issuedAt,
    });
  }
  return rows;
}
