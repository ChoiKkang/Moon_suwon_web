/**
 * 오디오 해설을 장소에 잇는 규칙.
 *
 * 오디(Odii) API는 contentId를 주지 않는다. 테마/스토리 식별자와 좌표만 있어
 * 좌표로 이어야 한다. 반경은 시행착오로 정했다. 80m면 팔달산 성곽 시설물이
 * 빠지고, 250m면 우만동 갈빗집에 성곽 해설이 붙는다. 120m가 성곽 위 시설물을
 * 대부분 잡고 상권 장소에 엉뚱한 해설이 붙지 않는 지점이다.
 *
 * 한 장소에 붙는 해설 수도 제한한다. 장안문 반경에는 '수원화성의 가치' 같은
 * 개요 해설이 여러 건 겹쳐 있어 전부 노출하면 목록이 해설로 뒤덮인다.
 */

import type { KtoAudioStoryItem } from './types';

/** 좌표 매칭 반경. */
export const AUDIO_MATCH_RADIUS_M = 120;
/** 장소 한 곳에 붙일 해설 수 상한. 가까운 순으로 남긴다. */
export const AUDIO_MAX_PER_PLACE = 6;

export type AudioMatchTarget = {
  placeId: string;
  lat: number;
  lng: number;
};

export type AudioMatch = {
  placeId: string;
  story: KtoAudioStoryItem;
  distanceM: number;
};

/** 두 좌표 사이 거리(m). 하버사인. 수원 규모에서는 오차가 무시할 수준이다. */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const earthRadiusM = 6_371_000;
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** 저장할 값이 있는 해설인지. 제목 없는 행은 화면에 쓸 수 없다. */
export function isUsableStory(story: KtoAudioStoryItem): boolean {
  const hasId = Boolean(story.stlid && story.stlid.trim());
  const hasTitle = Boolean(story.audioTitle && story.audioTitle.trim());
  const hasBody = Boolean(
    (story.script && story.script.trim()) || (story.audioUrl && story.audioUrl.trim()),
  );
  return hasId && hasTitle && hasBody;
}

/**
 * 장소별로 가까운 해설을 고른다.
 *
 * 같은 해설이 인접한 두 장소에 함께 붙는 것은 허용한다. 화홍문과 방화수류정은
 * 실제로 40m 거리라 두 장소 모두에서 같은 해설을 듣는 편이 자연스럽다.
 */
export function matchAudioStories(
  targets: AudioMatchTarget[],
  stories: KtoAudioStoryItem[],
  options: { radiusM?: number; maxPerPlace?: number } = {},
): AudioMatch[] {
  const radiusM = options.radiusM ?? AUDIO_MATCH_RADIUS_M;
  const maxPerPlace = options.maxPerPlace ?? AUDIO_MAX_PER_PLACE;
  const usable = stories.filter(isUsableStory).filter((story) => {
    const lat = Number(story.mapY);
    const lng = Number(story.mapX);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });

  const matches: AudioMatch[] = [];

  for (const target of targets) {
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) continue;

    const near = usable
      .map((story) => ({
        placeId: target.placeId,
        story,
        distanceM: Math.round(
          distanceMeters(target.lat, target.lng, Number(story.mapY), Number(story.mapX)),
        ),
      }))
      .filter((candidate) => candidate.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM || compareTitle(a.story, b.story))
      .slice(0, maxPerPlace);

    matches.push(...near);
  }

  return matches;
}

function compareTitle(a: KtoAudioStoryItem, b: KtoAudioStoryItem): number {
  return (a.audioTitle ?? '').localeCompare(b.audioTitle ?? '', 'ko');
}

