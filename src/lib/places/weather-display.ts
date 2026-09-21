const WEATHER_CATEGORY_LABELS: Record<string, string> = {
  TMP: '기온',
  TMN: '최저 기온',
  TMX: '최고 기온',
  SKY: '하늘 상태',
  PTY: '비/눈',
  PCP: '강수량',
  POP: '비 올 확률',
  WSD: '바람',
};

const SKY_LABELS: Record<number, string> = {
  1: '맑음',
  3: '구름 많음',
  4: '흐림',
};

const PRECIPITATION_LABELS: Record<number, string> = {
  0: '없음',
  1: '비',
  2: '비/눈',
  3: '눈',
  4: '소나기',
  5: '빗방울',
  6: '빗방울/눈날림',
  7: '눈날림',
};

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function appendUnit(value: string, unit: string | null): string {
  if (!unit || value.endsWith(unit) || (unit === '%' && value.endsWith('%'))) return value;
  return `${value}${unit}`;
}

export function getWeatherCategoryLabel(category: string): string {
  return WEATHER_CATEGORY_LABELS[category] ?? category;
}

export function formatWeatherValue(
  category: string,
  valueText: string | null,
  valueNumber: number | null,
  unit: string | null,
): string {
  const text = valueText?.trim() || null;

  if (category === 'SKY' && valueNumber !== null) {
    return SKY_LABELS[valueNumber] ?? '하늘 상태 확인 중';
  }
  if (category === 'PTY' && valueNumber !== null) {
    return PRECIPITATION_LABELS[valueNumber] ?? '강수 형태 확인 중';
  }
  if (category === 'PCP' && (!text || text === '-' || text === '강수없음')) {
    return valueNumber !== null && valueNumber > 0
      ? appendUnit(formatNumber(valueNumber), unit ?? 'mm')
      : '없음';
  }

  const base = text ?? (valueNumber !== null ? formatNumber(valueNumber) : null);
  return base ? appendUnit(base, unit) : '정보 없음';
}
