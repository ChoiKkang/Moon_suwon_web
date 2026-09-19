-- 대표 이미지가 없는 장소에 첫 이미지를 대표로 지정한다.
--
-- 수집 코드는 목록 응답의 firstimage만 대표로 표시했다. KTO가 이 필드를 비워
-- 보내면 상세로 19~22장을 받아도 전부 is_hero=false가 되어 화면에서 대표 이미지
-- 조회가 빈 값을 돌려준다. 수원화성 장안문·화홍문·방화수류정과 화성행궁이
-- 여기 걸려 목록과 상세 모두 "이미지 준비 중"으로 보였다. 서비스의 대표
-- 관광지들이라 체감이 특히 컸다.
--
-- 수집 코드는 같은 커밋에서 고쳤다. 이 마이그레이션은 이미 저장된 행을 보정하고,
-- 이후 수집에서 같은 상태가 생겨도 스스로 복구하도록 RPC를 남긴다.

create or replace function public.backfill_missing_hero_images()
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_updated integer;
begin
  with missing as (
    select p.id as place_id
    from core.places p
    where exists (select 1 from core.place_images pi where pi.place_id = p.id)
      and not exists (
        select 1 from core.place_images pi
        where pi.place_id = p.id and pi.is_hero = true
      )
  ),
  picked as (
    select distinct on (m.place_id) m.place_id, pi.id as image_id
    from missing m
    join core.place_images pi on pi.place_id = m.place_id
    order by m.place_id, pi.display_order, pi.created_at
  )
  update core.place_images pi
  set is_hero = true
  from picked
  where pi.id = picked.image_id;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.backfill_missing_hero_images() from public, anon, authenticated;
grant execute on function public.backfill_missing_hero_images() to service_role;

-- 지금 저장된 행을 보정한다.
select public.backfill_missing_hero_images();

