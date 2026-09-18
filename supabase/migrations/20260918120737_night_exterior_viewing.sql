-- 야간 외부 관람 가능 여부를 운영 판단값으로 기록한다.
--
-- 배경: 수원화성의 성문·수문은 유료 내부 관람 시간이 09:00~18:00으로 끝나지만,
-- 조명이 켜진 성곽을 밖에서 보는 것이 야간 관람의 핵심이다. 반면 화성어차는
-- 운행이 끝나면 이용할 수 없고, 수원향교는 담장 안 건물이라 마감 후 관람이
-- 불가능하다. 운영시간 원문만으로는 이 차이를 알 수 없으므로 운영자가 판단해
-- 명시한다.
--
-- 이 값이 true인 장소는 코스 검증에서 운영시간 충돌을 위반으로 보지 않는다.
-- 대신 코스 문구가 외부 관람 성격을 밝히도록 운영방침에서 요구한다.
-- 기본값은 false이며, 자동 수집은 이 값을 변경하지 않는다.

alter table editorial.place_publish_state
  add column if not exists night_exterior_viewing boolean not null default false,
  add column if not exists night_exterior_note text;

comment on column editorial.place_publish_state.night_exterior_viewing is
  '내부 관람 시간이 끝난 뒤에도 외부에서 야경을 볼 수 있는 장소인지에 대한 운영자 판단. 코스 운영시간 검증의 예외 근거가 된다.';
comment on column editorial.place_publish_state.night_exterior_note is
  '외부 관람으로 판단한 근거. 공개 문구가 아니라 운영 기록이다.';
