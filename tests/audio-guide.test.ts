import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUDIO_MATCH_RADIUS_M,
  distanceMeters,
  isUsableStory,
  matchAudioStories,
} from '../src/lib/kto/audio-guide';
import { formatPlayTime, mapAudioStory, splitAudioStories } from '../src/lib/places/audio-stories';

// 팔달문과 남치는 실제 160m 거리다.
test('measures distance between two Suwon coordinates', () => {
  const d = distanceMeters(37.2775467, 127.0167508, 37.27735, 127.014525);
  assert.ok(d > 180 && d < 210, `expected ~197m, got ${Math.round(d)}m`);
});

test('rejects stories that cannot be rendered', () => {
  assert.equal(isUsableStory({ stlid: '1', audioTitle: '제목', script: '본문' }), true);
  assert.equal(isUsableStory({ stlid: '1', audioTitle: '제목', audioUrl: 'https://x/a.mp3' }), true);
  // 본문도 음원도 없으면 보여줄 것이 없다.
  assert.equal(isUsableStory({ stlid: '1', audioTitle: '제목' }), false);
  assert.equal(isUsableStory({ audioTitle: '제목', script: '본문' }), false);
  assert.equal(isUsableStory({ stlid: '1', script: '본문' }), false);
});

test('links stories only to places inside the match radius', () => {
  // 창룡문 좌표와 그 앞 해설, 그리고 2km 떨어진 해설.
  const matches = matchAudioStories(
    [{ placeId: 'p1', lat: 37.28558, lng: 127.0212 }],
    [
      { stlid: 's1', audioTitle: '청색 깃발 휘날리는 창룡문', script: '본문', mapY: '37.28556', mapX: '127.02125' },
      { stlid: 's2', audioTitle: '사통팔달 팔달문', script: '본문', mapY: '37.2775467', mapX: '127.0167508' },
    ],
  );

  assert.deepEqual(matches.map((m) => m.story.stlid), ['s1']);
  assert.ok(matches[0]!.distanceM <= AUDIO_MATCH_RADIUS_M);
});

test('keeps the closest stories when a place has many nearby', () => {
  const stories = Array.from({ length: 9 }, (_, index) => ({
    stlid: `s${index}`,
    audioTitle: `해설 ${index}`,
    script: '본문',
    // 인덱스가 커질수록 멀어진다.
    mapY: String(37.2816 + index * 0.0002),
    mapX: '127.0128',
  }));

  const matches = matchAudioStories([{ placeId: 'p1', lat: 37.2816, lng: 127.0128 }], stories, { maxPerPlace: 3 });

  assert.deepEqual(matches.map((m) => m.story.stlid), ['s0', 's1', 's2']);
});

test('skips places without usable coordinates', () => {
  const matches = matchAudioStories(
    [{ placeId: 'p1', lat: Number.NaN, lng: 127.0128 }],
    [{ stlid: 's1', audioTitle: '해설', script: '본문', mapY: '37.2816', mapX: '127.0128' }],
  );

  assert.deepEqual(matches, []);
});

test('collapses the runs of spaces the upstream script carries', () => {
  const story = mapAudioStory({
    story_lang_id: '3725',
    spot_title: '팔달문',
    audio_title: '사통팔달 팔달문',
    script: '사통팔달 팔달문  이곳은 수원화성의 남문,   팔달문이에요.',
    play_seconds: 92,
    audio_url: null,
    distance_m: 3,
  });

  assert.equal(story.script, '사통팔달 팔달문 이곳은 수원화성의 남문, 팔달문이에요.');
  assert.equal(story.audioUrl, null);
});

test('formats play time the way a visitor reads it', () => {
  assert.equal(formatPlayTime(27), '27초');
  assert.equal(formatPlayTime(120), '2분');
  assert.equal(formatPlayTime(129), '2분 9초');
  assert.equal(formatPlayTime(0), null);
  assert.equal(formatPlayTime(null), null);
});

test('separates playable audio from read-only scripts and drops duplicate titles', () => {
  const rows = [
    { story_lang_id: 'a', spot_title: null, audio_title: '월화원', script: '본문', play_seconds: 60, audio_url: 'https://x/a.mp3', distance_m: 10 },
    { story_lang_id: 'b', spot_title: null, audio_title: '사통팔달 팔달문', script: '본문', play_seconds: 30, audio_url: null, distance_m: 20 },
    { story_lang_id: 'c', spot_title: null, audio_title: '사통팔달 팔달문', script: '본문', play_seconds: 30, audio_url: null, distance_m: 40 },
  ];

  const { playable, readable } = splitAudioStories(rows.map(mapAudioStory));

  assert.deepEqual(playable.map((s) => s.id), ['a']);
  assert.deepEqual(readable.map((s) => s.id), ['b']);
});

