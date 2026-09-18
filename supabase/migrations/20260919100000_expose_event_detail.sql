-- 행사는 랜딩 카드로만 노출되어 있었다. core.events에는 프로그램 소개, 이용
-- 요금, 운영 시간, 좌표, 문의처가 모두 채워져 있는데 공개 뷰가 일부만 내보내
-- 상세 페이지를 만들 수 없었다.
--
-- 상세 페이지에 필요한 필드를 추가한다. 기존 컬럼 순서는 유지하고 끝에만
-- append해 컬럼 순서에 의존하는 모바일 앱 소비자가 영향을 받지 않게 한다.
-- 공개 범위는 기존과 동일하게 end_date >= current_date가 통제한다.
begin;

-- 이 뷰는 security_invoker이므로 호출자 권한으로 기반 테이블을 읽는다. 컬럼
-- 단위 grant가 없으면 뷰 자체는 만들어져도 anon 조회가 permission denied로
-- 실패하므로, 새로 노출하는 컬럼에만 select 권한을 추가한다.
grant select (program_raw, contact_phone, lat, lng) on table core.events to anon, authenticated;

create or replace view public.v_upcoming_events
with (security_invoker = true)
as
select
  id,
  event_content_id,
  event_name,
  start_date,
  end_date,
  venue_address,
  event_place,
  play_time,
  usage_fee,
  hero_image_url,
  program_raw,
  contact_phone,
  lat,
  lng
from core.events
where end_date >= current_date
order by start_date asc, event_name asc;

grant select on public.v_upcoming_events to anon, authenticated;

commit;
