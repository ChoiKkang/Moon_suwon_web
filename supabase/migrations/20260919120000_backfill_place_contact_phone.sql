-- Fill place contact numbers from detailIntro2.infocenter.
--
-- KTO returns an empty `tel` for every Suwon attraction and publishes the public
-- enquiry line as detailIntro2.infocenter instead. The sync only read `tel`, so
-- all 20 published places rendered "연락처 정보 없음" even though the raw payloads
-- already held a usable number.
--
-- Backfill from the raw payloads we have already collected. Only rows that are
-- still null are touched, so a manually corrected number is never overwritten.
-- The intro text is free form ("수원종합관광안내소 031-228-4672", or two lines for
-- 화성행궁), so keep the first line and require it to contain digits.

with intro as (
  select
    ps.place_id,
    btrim(split_part(
      regexp_replace(r.payload_json ->> 'infocenter', '<[^>]*>', ' ', 'g'),
      chr(10), 1
    )) as raw_line
  from core.place_sources ps
  join raw.kto_kor_content r
    on r.content_id = ps.kto_content_id
   and r.source_endpoint like 'detailIntro2%'
  where nullif(btrim(coalesce(r.payload_json ->> 'infocenter', '')), '') is not null
),
cleaned as (
  select
    place_id,
    left(btrim(regexp_replace(split_part(split_part(raw_line, ',', 1), '/', 1), '\s+', ' ', 'g')), 120) as phone
  from intro
)
update core.places p
set contact_phone = cleaned.phone,
    updated_at = now()
from cleaned
where cleaned.place_id = p.id
  and p.contact_phone is null
  and cleaned.phone ~ '[0-9]{2,}';
