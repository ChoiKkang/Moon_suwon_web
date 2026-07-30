import type { ImportedPlace } from '@/lib/places/types';
import type { ServiceCourse } from './types';

const NIGHT_WALL_ORDER = [
  '연무대(동장대)',
  '동북공심돈',
  '봉돈',
  '수원 지동벽화마을',
  '수원통닭거리',
];

function byConfiguredOrder(places: ImportedPlace[]) {
  return [...places].sort((a, b) => {
    const aIndex = NIGHT_WALL_ORDER.indexOf(a.displayName);
    const bIndex = NIGHT_WALL_ORDER.indexOf(b.displayName);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

export function getServiceCourses(places: ImportedPlace[]): ServiceCourse[] {
  const nightWallPlaces = byConfiguredOrder(
    places.filter((place) => NIGHT_WALL_ORDER.includes(place.displayName)),
  );

  return [
    {
      slug: 'night-wall-starter',
      title: '성곽 야경 입문 코스',
      subtitle: 'KTO 실데이터 기반 대표 동선',
      description:
        '연무대에서 시작해 성곽 구조물과 지동벽화마을, 수원통닭거리까지 이어지는 첫 방문자용 야간 코스입니다.',
      durationMinutes: 75,
      distanceKm: 2.4,
      status: 'live',
      theme: '검증된 공식 스팟 + 야간 산책',
      primaryCta: '실제 스팟 보기',
      places: nightWallPlaces,
      plannedPlaces: [],
    },
    {
      slug: 'photo-night-view',
      title: '사진 중심 코스',
      subtitle: '방화수류정, 화홍문, 용연 후보',
      description:
        '반사 사진, 성곽 실루엣, 조망 지점을 중심으로 별도 editorial 데이터가 필요한 촬영형 코스입니다.',
      durationMinutes: 60,
      distanceKm: 1.8,
      status: 'curation',
      theme: '야경 사진 + 포토팁',
      primaryCta: '큐레이션 방향 보기',
      places: [],
      plannedPlaces: ['방화수류정', '화홍문', '용연', '성곽 조망 지점'],
    },
    {
      slug: 'local-finish',
      title: '로컬 상권 연결 코스',
      subtitle: '관광 이후 소비 전환 동선',
      description:
        '수원통닭거리와 행궁동 상권 후보를 연결해 산책 이후 식음/카페 방문으로 이어지게 만드는 마무리 코스입니다.',
      durationMinutes: 90,
      distanceKm: 2.1,
      status: 'curation',
      theme: '관광 + 로컬 상권',
      primaryCta: '운영 후보 보기',
      places: places.filter((place) => place.displayName === '수원통닭거리'),
      plannedPlaces: ['행궁동 카페', '소품샵', '전통시장 후보'],
    },
  ];
}
