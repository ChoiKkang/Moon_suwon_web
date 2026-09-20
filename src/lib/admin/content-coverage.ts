import type { AdminEnrichmentCoverage } from './types';

export type PublicContentCoverageInput = {
  publishedPlaces: number;
  missionPlaces: number;
  storyPlaces: number;
  relatedPlaces: number;
  relatedItems: number;
  photoPlaces: number;
  photoItems: number;
  wellnessPlaces: number;
  wellnessItems: number;
  busPlaces: number;
  busItems: number;
  weatherItems: number;
};

function approvedNote(label: string, items: number, emptyHint: string) {
  return items > 0 ? `${label} ${items}건이 승인되어 공개 경계 안에 있습니다.` : `${label} 0건입니다. ${emptyHint}`;
}

/**
 * Build deterministic operator copy from database counts. Keeping this pure
 * makes the meaning of each coverage card testable without a Supabase client.
 */
export function buildPublicContentCoverage(input: PublicContentCoverageInput): AdminEnrichmentCoverage[] {
  return [
    {
      key: 'missions',
      label: '미션 프롬프트',
      places: input.missionPlaces,
      publishedPlaces: input.publishedPlaces,
      items: null,
      note: input.missionPlaces > 0
        ? '미션 타입과 수행 문장이 함께 있는 공개 장소입니다.'
        : '미션 타입과 프롬프트를 함께 검수해야 앱 진행 화면에서 사용할 수 있습니다.',
    },
    {
      key: 'stories',
      label: '정조의 밤 이야기',
      places: input.storyPlaces,
      publishedPlaces: input.publishedPlaces,
      items: null,
      note: input.storyPlaces > 0
        ? '공개 장소 상세와 홈 이야기 레일에서 사용할 수 있습니다.'
        : '승인된 짧은 이야기가 없어 홈 이야기 레일은 빈 상태로 유지됩니다.',
    },
    {
      key: 'related',
      label: '연관 관광지',
      places: input.relatedPlaces,
      publishedPlaces: input.publishedPlaces,
      items: input.relatedItems,
      note: approvedNote('연관 관광지', input.relatedItems, '후보·미승인 관계는 공개하지 않습니다.'),
    },
    {
      key: 'photos',
      label: '승인 관광 사진',
      places: input.photoPlaces,
      publishedPlaces: input.publishedPlaces,
      items: input.photoItems,
      note: approvedNote('승인 사진', input.photoItems, '수집 후보는 저작권 검수 전까지 공개하지 않음.'),
    },
    {
      key: 'wellness',
      label: '승인 웰니스 태그',
      places: input.wellnessPlaces,
      publishedPlaces: input.publishedPlaces,
      items: input.wellnessItems,
      note: approvedNote('승인 웰니스 정보', input.wellnessItems, '수원 범위·원천 검수 전까지 공개하지 않음.'),
    },
    {
      key: 'bus',
      label: '승인 버스 정류장',
      places: input.busPlaces,
      publishedPlaces: input.publishedPlaces,
      items: input.busItems,
      note: input.busItems > 0
        ? '승인된 장소-정류장 매핑만 도착정보 API에 연결됩니다.'
        : '승인된 장소-정류장 매핑이 없어 도착정보 API는 보류 상태입니다.',
    },
    {
      key: 'weather',
      label: '기상청 단기예보',
      places: input.weatherItems > 0 ? input.publishedPlaces : 0,
      publishedPlaces: input.publishedPlaces,
      items: input.weatherItems,
      note: input.weatherItems > 0
        ? '수원 격자 단기예보를 장소 상세의 참고 정보로 사용합니다.'
        : '최신 단기예보가 없어 날씨 블록을 숨깁니다.',
    },
  ];
}
