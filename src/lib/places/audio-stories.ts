/**
 * 오디오 해설 표시 규칙.
 *
 * 한국관광공사 오디(Odii) 오디오 가이드에서 온다. 두 종류가 섞여 있다.
 * 재생 파일이 있는 항목과, 오디 앱 안에서만 들을 수 있어 본문만 공개된 항목이다.
 * 수원화성 성곽 해설이 후자인데, 밤에 성곽을 걸으며 읽기에는 오히려 낫다.
 * 들을 수 있는 것과 읽을 수 있는 것을 섞지 않고 구분해서 보여준다.
 *
 * 본문은 상류에서 줄바꿈 없이 공백만 여러 칸 들어오는 경우가 많다. 그대로
 * 렌더하면 문장 중간이 벌어져 읽기 어려워지므로 공백을 정리한다.
 */

export type AudioStory = {
  id: string;
  spotTitle: string | null;
  audioTitle: string;
  script: string | null;
  playSeconds: number | null;
  audioUrl: string | null;
  distanceM: number | null;
};

export type AudioStoryRow = {
  story_lang_id: string;
  spot_title: string | null;
  audio_title: string;
  script: string | null;
  play_seconds: number | null;
  audio_url: string | null;
  distance_m: number | null;
};

export function mapAudioStory(row: AudioStoryRow): AudioStory {
  return {
    id: row.story_lang_id,
    spotTitle: cleanText(row.spot_title),
    audioTitle: cleanText(row.audio_title) ?? row.audio_title,
    script: cleanScript(row.script),
    playSeconds: row.play_seconds === null ? null : Number(row.play_seconds),
    audioUrl: cleanText(row.audio_url),
    distanceM: row.distance_m === null ? null : Number(row.distance_m),
  };
}

function cleanText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 문단은 남기고 줄 안의 중복 공백만 접는다. */
function cleanScript(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
  return normalized.length > 0 ? normalized : null;
}

/** 재생 길이를 "3분 12초" 형태로. */
export function formatPlayTime(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return null;
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  if (minutes === 0) return `${rest}초`;
  if (rest === 0) return `${minutes}분`;
  return `${minutes}분 ${rest}초`;
}

/**
 * 들을 수 있는 해설과 읽을 수 있는 해설로 나눈다.
 *
 * 같은 지점 해설이 제목만 다르게 중복되는 경우가 있어 제목 기준으로 한 번
 * 접는다. 가까운 순서를 유지한다.
 */
export function splitAudioStories(stories: AudioStory[]): {
  playable: AudioStory[];
  readable: AudioStory[];
} {
  const seen = new Set<string>();
  const unique = stories.filter((story) => {
    const key = story.audioTitle;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    playable: unique.filter((story) => Boolean(story.audioUrl)),
    readable: unique.filter((story) => !story.audioUrl && Boolean(story.script)),
  };
}

