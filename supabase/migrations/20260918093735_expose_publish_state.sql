begin;

grant select (
  place_id,
  is_published,
  display_priority,
  is_now_good_enabled,
  night_suitability_score,
  recommended_from,
  recommended_until,
  recommendation_boost
) on table editorial.place_publish_state to anon, authenticated;

drop policy if exists place_publish_state_public_published on editorial.place_publish_state;
create policy place_publish_state_public_published
on editorial.place_publish_state
for select
to anon, authenticated
using (is_published = true);

commit;
