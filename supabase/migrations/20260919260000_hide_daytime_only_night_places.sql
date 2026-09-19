-- 야간 서비스 기준에 맞지 않는 낮 시간 전용 장소는 원본과 문구를 보존한 채
-- 공개 목록에서만 제외한다. 화성어차와 수원향교는 각각 17시·15시 30분에
-- 운영이 끝나고 외부 야경 관람 대상으로도 판단하지 않았다.

begin;

do $$
declare
  matched_count integer;
begin
  select count(*)
    into matched_count
  from core.places
  where official_name in ('화성어차', '수원향교');

  if matched_count <> 2 then
    raise exception 'expected daytime-only night places, matched %', matched_count;
  end if;
end;
$$;

update editorial.place_publish_state as publish_state
set is_published = false,
    is_now_good_enabled = false,
    night_exterior_viewing = false,
    night_exterior_note = null,
    ops_memo = coalesce(
      publish_state.ops_memo,
      '야간 운영시간이 없어 야간 서비스 공개 목록에서 제외했습니다. 원본과 운영 문구는 보존합니다.'
    ),
    updated_at = now()
from core.places as place
where place.id = publish_state.place_id
  and place.official_name in ('화성어차', '수원향교')
  and publish_state.is_published = true;

commit;
