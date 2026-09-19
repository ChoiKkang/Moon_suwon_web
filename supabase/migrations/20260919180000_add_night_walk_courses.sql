-- 새로 공개된 장소를 실제 동선으로 잇는 코스 3개를 추가한다.
--
-- 공개 장소가 20곳에서 50곳으로 늘었는데 코스는 4개 그대로였다. 수원화성 성곽길,
-- 서호공원, 야간 영업 음식점이 상세 페이지로만 접근되고 동선에 들어가지 못했다.
--
-- 기존 코스 4개는 전부 성곽 주변이고 음식점 종점이 없다. 세 코스는 각각 다른
-- 결을 맡는다: 성곽 동편을 한 바퀴 돌고 통닭거리에서 마무리하는 코스, 서호
-- 낙조를 보는 코스, 성곽 서편 골목에서 카페로 이어지는 코스.
--
-- 거리는 좌표 직선거리 합이다. 실제 도보 거리가 아니라는 점은 운영방침에 적혀
-- 있고 운영자가 현장 판단으로 보정한다.
--
-- automation_source는 비워 둔다. 사람이 구성한 코스이므로 자동화 근거 메타데이터를
-- 요구하는 course:verify 검사 대상이 아니다.

create temporary table tmp_course_defs (
  slug text primary key,
  theme_tags text[] not null,
  duration_min integer not null,
  distance_km numeric(5,2) not null,
  start_time text not null,
  pet_ready boolean not null,
  hero_title text not null,
  subtitle text not null,
  route_summary text not null,
  display_priority integer not null
) on commit drop;

insert into tmp_course_defs values
  ('course-fortress-loop-night',
   array['성곽','야경','야식'], 150, 2.92, '19:00', false,
   '성곽 한 바퀴 야식 코스',
   '성곽 동편을 돌고 통닭거리에서 마무리하는 코스',
   '수원화성 성곽길에서 출발해 봉돈, 창룡문, 연무대, 방화수류정, 화홍문을 지나 수원통닭거리로 내려옵니다. 화홍문은 저녁에 내부 관람이 끝나므로 조명이 켜진 외관을 성곽 밖에서 감상합니다. 마지막 진미통닭은 23시까지 영업해 늦게 도착해도 괜찮습니다.',
   10),
  ('course-seoho-sunset',
   array['호수','낙조','산책'], 90, 0.70, '18:00', false,
   '서호 낙조 산책 코스',
   '수원팔경 서호낙조를 보고 백로 서식지까지 걷는 코스',
   '서호공원 항미정에서 저수지 낙조를 본 뒤 여기산공원으로 넘어갑니다. 정조가 축조한 축만제와 백로 서식지를 한 동선에서 봅니다. 성곽 야경과 달리 해가 넘어가는 시간에 맞춰 출발하는 코스입니다.',
   20),
  ('course-west-alley-cafe',
   array['골목','카페','야경'], 120, 0.51, '19:00', false,
   '성곽 서편 골목 카페 코스',
   '화서문 앞 공원에서 행리단길 카페까지 짧게 걷는 코스',
   '화서공원에서 성벽 아래 억새길을 걷고 킵댓 본점, 행리단길, 레드브릭커피하우스로 이어집니다. 전체 500m대라 오래 걷기 부담스러운 날에 맞고, 레드브릭 루프탑에서 성곽 방향을 볼 수 있습니다.',
   30);

create temporary table tmp_course_stops (
  slug text not null,
  order_index integer not null,
  place_name text not null,
  primary key (slug, order_index)
) on commit drop;

insert into tmp_course_stops values
  ('course-fortress-loop-night', 1, '수원화성 성곽길'),
  ('course-fortress-loop-night', 2, '봉돈'),
  ('course-fortress-loop-night', 3, '창룡문'),
  ('course-fortress-loop-night', 4, '연무대(동장대)'),
  ('course-fortress-loop-night', 5, '방화수류정(동북각루)'),
  ('course-fortress-loop-night', 6, '화홍문(華虹門)'),
  ('course-fortress-loop-night', 7, '진미통닭'),
  ('course-seoho-sunset', 1, '서호공원'),
  ('course-seoho-sunset', 2, '여기산공원'),
  ('course-west-alley-cafe', 1, '화서공원'),
  ('course-west-alley-cafe', 2, '킵댓 본점'),
  ('course-west-alley-cafe', 3, '행리단길'),
  ('course-west-alley-cafe', 4, '레드브릭커피하우스');

-- 안전장치: 모든 정차지가 공개된 장소여야 한다. 비공개 장소가 섞인 코스는
-- 공개 계약(get_course_by_slug)에서 아예 조회되지 않는다.
do $$
declare
  v_missing text;
begin
  select string_agg(distinct t.place_name, ', ')
  into v_missing
  from tmp_course_stops t
  where not exists (
    select 1
    from core.places p
    join editorial.place_publish_state s on s.place_id = p.id and s.is_published = true
    where p.official_name = t.place_name
  );

  if v_missing is not null then
    raise exception 'course stops are not published places: %', v_missing;
  end if;
end;
$$;

insert into core.courses (slug, theme_tags, estimated_duration_min, walking_distance_km, recommended_start_time, pet_ready_flag)
select d.slug, d.theme_tags, d.duration_min, d.distance_km, d.start_time, d.pet_ready
from tmp_course_defs d
on conflict (slug) do update
  set theme_tags = excluded.theme_tags,
      estimated_duration_min = excluded.estimated_duration_min,
      walking_distance_km = excluded.walking_distance_km,
      recommended_start_time = excluded.recommended_start_time,
      updated_at = now();

insert into core.course_places (course_id, place_id, order_index)
select c.id, p.id, t.order_index
from tmp_course_stops t
join tmp_course_defs d on d.slug = t.slug
join core.courses c on c.slug = t.slug
join core.places p on p.official_name = t.place_name
on conflict (course_id, order_index) do update
  set place_id = excluded.place_id;

insert into editorial.course_copy (course_id, hero_title, subtitle, route_summary)
select c.id, d.hero_title, d.subtitle, d.route_summary
from tmp_course_defs d
join core.courses c on c.slug = d.slug
on conflict (course_id) do update
  set hero_title = coalesce(editorial.course_copy.hero_title, excluded.hero_title),
      subtitle = coalesce(editorial.course_copy.subtitle, excluded.subtitle),
      route_summary = coalesce(editorial.course_copy.route_summary, excluded.route_summary),
      updated_at = now();

insert into editorial.course_publish_state (course_id, is_published, published_at, display_priority)
select c.id, true, now(), d.display_priority
from tmp_course_defs d
join core.courses c on c.slug = d.slug
on conflict (course_id) do update
  set is_published = true,
      published_at = coalesce(editorial.course_publish_state.published_at, now()),
      display_priority = excluded.display_priority,
      updated_at = now();
