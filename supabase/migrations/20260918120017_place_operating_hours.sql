-- 코스 초안이 실제 방문 가능 시간을 검증할 수 있게 KTO detailIntro2의
-- 운영시간·휴무일 원문을 보관한다.
--
-- 배경: 공개 장소 20곳 중 7곳은 19시 전에 닫는다(화성행궁·장안문·화홍문·
-- 팔달문 18:00, 화성어차 17:00, 수원향교 15:30). 코스 초안은 19:00 시작을
-- 권하므로, 운영시간 없이는 문 닫은 곳을 야간 코스로 추천하게 된다. 이 값은
-- 사실 데이터이므로 core에 두고, 표시 문구는 editorial에서 관리한다.
--
-- 원문을 그대로 보관하고 파싱 결과를 따로 두지 않는다. KTO 표기가
-- "하절기(3~10월) 09:00~18:00" 처럼 자유 형식이라 구조화는 검증 코드에서
-- 보수적으로 수행하고, 판단 근거는 항상 원문으로 되돌릴 수 있게 한다.

alter table core.places
  add column if not exists operating_hours_raw text,
  add column if not exists rest_day_raw text,
  add column if not exists operating_hours_updated_at timestamptz;

comment on column core.places.operating_hours_raw is
  'KTO detailIntro2 usetime 원문. 자유 형식이며 파싱은 소비 측에서 보수적으로 수행한다.';
comment on column core.places.rest_day_raw is
  'KTO detailIntro2 restdate 원문.';
