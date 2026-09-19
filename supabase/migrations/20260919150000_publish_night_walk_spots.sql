-- 신규 법정동 코드 수집으로 들어온 야간 산책 스팟 10곳을 공개한다.
--
-- KTO가 areaCode를 비운 채 lDongRegnCd/lDongSignguCd만 채우기 시작해서, 기존
-- 수집 경로는 수원 콘텐츠의 절반만 가져왔다. 경로를 고치자 관광지가 39곳에서
-- 84곳으로 늘었고 그 안에 수원화성 성곽길, 화서공원, 서호공원처럼 야경 산책의
-- 중심이 되는 장소들이 들어 있었다.
--
-- night_suitability_score는 운영방침 구간을 따른다. 성곽 야경 명소 84~95,
-- 조명 있는 성곽 구조물 72~82, 성곽 연접 산책 공원 66~68, 골목·문화재 52~58,
-- 야간 상권 46~48. 호수공원은 성곽 연접은 아니지만 조명 있는 야간 산책로라
-- 60~62를 준다.
--
-- 화서문은 성곽 4대문 중 하나이고 상시 개방이지만 KTO에 이미지가 0건이어서
-- 공개 조건(대표 이미지)을 채우지 못한다. 후보로 남겨 둔다.

create temporary table tmp_night_places (
  place_id uuid primary key,
  official_name text not null,
  short_description text not null,
  night_highlight text not null,
  photo_tip text not null,
  short_story text not null,
  night_score integer not null
) on commit drop;

insert into tmp_night_places (place_id, official_name, short_description, night_highlight, photo_tip, short_story, night_score)
values
  ('64003463-f738-45d1-8e12-d5f7b737ce15'::uuid, '수원화성 성곽길', '장안문부터 화서문까지 5.1km, 약 두 시간 성곽 한 바퀴', '성곽길은 상시 개방이라 밤에도 걸을 수 있습니다. 조명이 켜진 장안문, 팔달문, 창룡문, 화서문, 화홍문, 화성행궁을 한 동선에서 만납니다.', '5.1km 구간 중 서북각루와 화홍문 사이가 조명이 가장 고르게 들어옵니다. 성벽 곡선을 낮은 각도에서 담아 보세요.', '유네스코 세계문화유산 수원화성을 따라 걷는 역사·사적길입니다. 총 5.1km에 약 두 시간이 걸리고, 거중기와 녹로 같은 신기재로 지어진 동양 성곽의 백미를 지나갑니다.', 92),
  ('c07d7147-de3c-441a-bc74-92d37a7fb735'::uuid, '효원공원 월화원', '중국 광둥식 전통 정원, 밤 10시까지 개방', '22시까지 열어 성곽 야경과 다른 결의 정원을 볼 수 있습니다. 인공 호수와 배 모양 정자에 조명이 들어옵니다.', '창문을 통해 정원이 보이도록 설계된 구조라, 창틀을 프레임으로 삼아 안쪽 정원을 담아 보세요.', '경기도와 중국 광둥성의 우호 교류 협약에 따라 2006년 개장한 광둥식 전통 정원입니다. 건물과 정원이 조화를 이루도록 설계됐고 후원에는 흙으로 만든 가산과 인공 호수, 인공 폭포와 배 모양 정자가 있습니다.', 74),
  ('e1d8221e-d035-4095-ac4f-84184fd6fa79'::uuid, '화서공원', '화서문에서 팔달산 둘레길로 이어지는 성곽 아래 공원', '상시 개방이라 야간에도 성벽 아래를 걸을 수 있습니다. 서북각루 주변 억새가 성벽 조명을 받아 흔들립니다.', '성벽 바로 아래 억새 숲에서 서북각루를 올려다보면 성곽과 억새가 함께 들어옵니다.', '수원 화서문에서 팔달산 둘레길로 이어지는 성곽 주변 공원입니다. 산책로와 화성열차 길이 있고 넓은 잔디밭과 소나무 숲이 어우러집니다. 수원화성에서 가을 풍경이 가장 아름다운 장소로 꼽힙니다.', 68),
  ('eb3ca669-44f9-412e-b7c8-533510bf75bb'::uuid, '서호공원', '정조가 축조한 축만제, 수원팔경 서호낙조', '상시 개방입니다. 서호의 낙조는 수원팔경 중 하나로, 해가 넘어가는 시간에 맞춰 가면 가장 좋습니다.', '향토유적 제1호 항미정에서 저수지 쪽을 바라보면 낙조와 노송이 함께 들어옵니다.', '조선 정조 시기 농경지 관개를 위해 조성된 서호저수지를 중심으로 만든 공원입니다. 정조가 축조한 축만제가 남아 있고 둘레길이 수원 팔색길과 연결됩니다. 향토유적 제1호 항미정이 공원 안에 있습니다.', 66),
  ('6706a7fb-7c42-44e0-b6be-3fff0283ec90'::uuid, '[경기옛길 삼남길 제4길] 서호천길', '지지대비에서 서호공원까지, 정조의 효심이 남은 길', '상시 개방 산책로입니다. 서호공원 방향으로 걸으면 해질녘 서호낙조 시간에 도착할 수 있습니다.', '지지대비 쉼터에 삼남길과 수원팔색길 표지판이 나란히 서 있습니다. 두 표지판을 함께 담아 보세요.', '지지대비에서 출발해 서호공원 입구까지 이어지는 구간입니다. 지지대고개는 정조가 아버지 능을 찾았다 돌아가는 길이 아쉬워 행차를 늦췄다는 이야기에서 이름이 유래했습니다. 쉼터에 화장실과 편의점이 있습니다.', 66),
  ('5ba7d5a4-7987-4077-8b29-7d6e5097c5bd'::uuid, '수원화성 관광특구', '성곽과 행궁 일대를 아우르는 관광특구', '수원화성 자체는 상시 개방이라 밤에도 성곽 주변을 걸을 수 있습니다. 화성행궁 내부 관람은 18시에 끝납니다.', '특구 안 어디서든 성벽이 배경에 들어옵니다. 조명이 켜진 성곽과 상권 간판을 한 컷에 담아 보세요.', '정조대왕이 아버지 사도세자의 능침을 수원 화산으로 옮기면서 축성한 수원화성 일대입니다. 효심이 축성의 근본이 됐고 당파정치 근절과 왕도정치 실현을 위한 정치구상의 중심지로 지어졌습니다.', 48),
  ('3b84794b-f766-46ba-ac5e-be054361e91d'::uuid, '수원 공방거리', '행궁동 예술가들의 공방이 모인 골목', '골목 자체는 밤에도 지날 수 있습니다. 공방 조명이 켜진 창을 지나며 걷는 구간입니다.', '나무공예와 한지공예 공방 창문에 비치는 작업 조명이 골목 분위기를 만듭니다.', '행궁동에 예술가들이 모여 작업하는 공방길입니다. 다양한 공방과 작품 전시 공간이 있고, 나무공예와 한지공예, 리본공예, 금속공예, 규방공예 체험과 공예품 판매가 이뤄집니다.', 54),
  ('a1742974-bded-4a0a-9ad8-5a285d682d9d'::uuid, '여기산공원', '화서역 뒤 서호와 이어지는 백로 서식지 공원', '상시 개방입니다. 서호공원과 붙어 있어 서호낙조를 본 뒤 이어 걸을 수 있습니다.', '여기산 안에서 백로를 관찰할 수 있습니다. 해질 무렵 나무 위로 모여드는 모습을 담아 보세요.', '화서역 뒤편 버려져 있던 공간을 환경친화적 휴식공간으로 조성한 공원입니다. 다목적구장과 게이트볼장, 테니스장 같은 생활체육시설이 있고 여기산 내 백로를 관찰할 수 있습니다. 서호공원과 인접해 함께 이용할 수 있습니다.', 60),
  ('c3d10a74-fa9d-40b8-9bb6-e9a5e15ec24f'::uuid, '광교호수공원', '6.5km 순환보행로와 분수 9개가 있는 도심 호수공원', '상시 개방이라 야간 산책이 가능합니다. 수변 원형데크와 아치형 정자에 조명이 들어옵니다.', '수변 위 5개 원형데크에서 호수 건너 조명을 담으면 물에 반사된 빛이 함께 들어옵니다.', '아름다운 수변공간 어반레비와 6개 테마 둠벙이 어우러진 국내 최대 도심 속 호수공원입니다. 신비한 물너미와 물보석 분수 등 9개 분수시설, 총 6.5km 순환보행로, 야외공연장과 수변 원형데크가 있습니다.', 62),
  ('4bc48665-628e-49a3-a2c0-9201d9546680'::uuid, '일월호수공원', '1932년 일월저수지를 끼고 도는 한 시간 산책로', '상시 개방입니다. 일몰 감상지로 알려진 곳이라 해 질 때 맞춰 가면 좋습니다.', '저수지 수면에 일몰이 비치는 시간대가 가장 좋습니다. 산책로 초입 마을공동체 공간도 함께 담아 보세요.', '1932년 농업용수 공급을 위해 조성된 일월저수지 옆 공원입니다. 한 시간 정도 산책할 수 있고 일몰 감상지로 알려져 있습니다. 철새가 모이고 토종 어종 가물치가 서식합니다.', 60);

-- 안전장치: 대상이 기대한 10곳이고 전부 검수 대기 상태인지 확인한다.
do $$
declare
  v_matched integer;
begin
  select count(*) into v_matched
  from tmp_night_places t
  join core.place_sources ps on ps.place_id = t.place_id
  where ps.ingestion_status = 'candidate';

  if v_matched <> 10 then
    raise exception 'expected 10 candidate places, matched %', v_matched;
  end if;
end;
$$;

-- 이미지가 없으면 공개 조건을 못 채우므로 미리 막는다.
do $$
declare
  v_missing text;
begin
  select string_agg(t.official_name, ', ')
  into v_missing
  from tmp_night_places t
  where not exists (select 1 from core.place_images i where i.place_id = t.place_id);

  if v_missing is not null then
    raise exception 'places without a hero image cannot be published: %', v_missing;
  end if;
end;
$$;

insert into editorial.place_copy (place_id, short_description, night_highlight, photo_tip, short_story)
select t.place_id, t.short_description, t.night_highlight, t.photo_tip, t.short_story
from tmp_night_places t
on conflict (place_id) do update
  set short_description = coalesce(editorial.place_copy.short_description, excluded.short_description),
      night_highlight = coalesce(editorial.place_copy.night_highlight, excluded.night_highlight),
      photo_tip = coalesce(editorial.place_copy.photo_tip, excluded.photo_tip),
      short_story = coalesce(editorial.place_copy.short_story, excluded.short_story),
      updated_at = now();

update core.place_sources ps
set ingestion_status = 'approved',
    last_seen_at = now()
from tmp_night_places t
where ps.place_id = t.place_id
  and ps.ingestion_status = 'candidate';

insert into editorial.place_publish_state (place_id, is_published, published_at, night_suitability_score, is_now_good_enabled)
select t.place_id, true, now(), t.night_score, false
from tmp_night_places t
on conflict (place_id) do update
  set is_published = true,
      published_at = coalesce(editorial.place_publish_state.published_at, now()),
      night_suitability_score = excluded.night_suitability_score,
      updated_at = now();
