-- 야간 콘셉트에서 제외한 낮 시간 전용 장소는 다음 자동 수집 뒤에도
-- 운영자에게 공개 후보로 다시 떠오르지 않도록 원천 검수 상태도 반려로 기록한다.
-- 장소·문구·이미지는 삭제하지 않으며, 운영자가 재검토할 수 있다.

begin;

update core.place_sources as source
set ingestion_status = 'rejected',
    last_seen_at = now()
from core.places as place
where place.id = source.place_id
  and place.official_name in ('화성어차', '수원향교')
  and source.ingestion_status = 'approved';

commit;
