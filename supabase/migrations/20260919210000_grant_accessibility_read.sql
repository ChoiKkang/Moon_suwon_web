-- 접근성 뷰가 anon으로 읽히게 한다.
--
-- serving.v_imported_places는 security_invoker 뷰라서 호출자 권한으로 기반
-- 테이블을 읽는다. core.place_accessibility에 grant와 RLS 정책이 없으면
-- "permission denied for table place_accessibility"로 조회가 실패한다.
--
-- 반려동물 정책과 같은 방식이다: 공개된 장소의 행만 읽히고, 노출할 컬럼만
-- 지정한다. 원본 수집 시각 같은 운영 컬럼은 주지 않는다.

begin;

grant select (
  place_id,
  route_note,
  exit_note,
  elevator_note,
  parking_note,
  public_transport_note,
  wheelchair_note,
  braille_block_note,
  braille_promotion_note,
  audio_guide_note,
  big_print_note,
  help_dog_note,
  restroom_note,
  lactation_room_note,
  stroller_note,
  infants_family_note,
  etc_note,
  source_updated_at
) on table core.place_accessibility to anon, authenticated;

drop policy if exists place_accessibility_public_published on core.place_accessibility;
create policy place_accessibility_public_published
on core.place_accessibility
for select
to anon, authenticated
using (public.is_published_place(place_id));

commit;
