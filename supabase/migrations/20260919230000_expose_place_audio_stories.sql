-- 오디오 해설을 공개 계약에 노출한다.
--
-- 장소 한 곳에 해설이 여러 개 붙는다(장안문 11건). 기존 v_published_places는
-- 장소당 한 행이라 컬럼을 늘려 담을 수 없다. 별도 뷰를 추가하면 기존 뷰와 RPC의
-- 컬럼 순서가 그대로 유지되므로 모바일 앱이 읽는 계약은 바뀌지 않는다.
--
-- security_invoker 뷰라서 기반 테이블에 컬럼 grant와 RLS 정책이 함께 필요하다.
-- 무장애 정보와 같은 방식이다.

begin;

grant select (
  place_id,
  story_lang_id,
  spot_title,
  audio_title,
  script,
  play_seconds,
  audio_url,
  image_url,
  lat,
  lng,
  distance_m,
  source_updated_at
) on table core.place_audio_stories to anon, authenticated;

drop policy if exists place_audio_stories_public_published on core.place_audio_stories;
create policy place_audio_stories_public_published
on core.place_audio_stories
for select
to anon, authenticated
using (public.is_published_place(place_id));

create or replace view serving.v_place_audio_stories
with (security_invoker = true)
as
select
  pas.place_id,
  p.slug as place_slug,
  pas.story_lang_id,
  pas.spot_title,
  pas.audio_title,
  pas.script,
  pas.play_seconds,
  pas.audio_url,
  pas.image_url,
  pas.lat,
  pas.lng,
  pas.distance_m,
  pas.source_updated_at
from core.place_audio_stories pas
join core.places p on p.id = pas.place_id
where p.is_active = true
  and public.is_published_place(pas.place_id)
order by pas.distance_m, pas.audio_title;

create or replace view public.v_published_place_audio_stories
with (security_invoker = true)
as
select
  place_id,
  place_slug,
  story_lang_id,
  spot_title,
  audio_title,
  script,
  play_seconds,
  audio_url,
  image_url,
  lat,
  lng,
  distance_m,
  source_updated_at
from serving.v_place_audio_stories;

grant select on serving.v_place_audio_stories to anon, authenticated;
grant select on public.v_published_place_audio_stories to anon, authenticated;

commit;

