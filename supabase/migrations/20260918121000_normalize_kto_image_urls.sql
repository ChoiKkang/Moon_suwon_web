-- KTO may return the same image once with http:// and once with https://.
-- Remove only normalized URL duplicates before upgrading the remaining rows so
-- the unique place/image URL constraint cannot abort the cleanup.
begin;

with ranked as (
  select
    id,
    row_number() over (
      partition by place_id, regexp_replace(image_url, '^http://', 'https://', 1, 0, 'i')
      order by is_hero desc nulls last, display_order asc nulls last, created_at asc, id asc
    ) as row_number
  from core.place_images
)
delete from core.place_images images
using ranked
where images.id = ranked.id
  and ranked.row_number > 1;

update core.place_images
set
  image_url = regexp_replace(image_url, '^http://', 'https://', 1, 0, 'i'),
  thumbnail_url = case
    when thumbnail_url is null then null
    else regexp_replace(thumbnail_url, '^http://', 'https://', 1, 0, 'i')
  end
where image_url ~* '^http://'
   or thumbnail_url ~* '^http://';

update core.events
set hero_image_url = regexp_replace(hero_image_url, '^http://', 'https://', 1, 0, 'i')
where hero_image_url ~* '^http://';

commit;
