-- The public compatibility alias can safely inherit the published-only
-- security-invoker boundary now that its source view has explicit grants and
-- publish-aware RLS policies.

begin;

create or replace view public.v_imported_places
with (security_invoker = true)
as
select imported.id, imported.slug, imported.official_name, imported.display_name,
  imported.address_full, imported.lat, imported.lng, imported.contact_phone,
  imported.source_overview_raw, imported.short_description, imported.category,
  imported.kto_content_id, imported.kto_content_type_id, imported.hero_image_url,
  imported.hero_thumbnail_url, imported.source_modified_at, imported.is_active
from serving.v_imported_places imported
join serving.v_published_places published on published.id = imported.id;

drop policy if exists places_admin_all on core.places;
drop policy if exists place_sources_admin_all on core.place_sources;
drop policy if exists place_images_admin_all on core.place_images;
drop policy if exists place_copy_admin_all on editorial.place_copy;

commit;
