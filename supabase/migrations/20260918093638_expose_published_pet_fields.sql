begin;

grant select (
  place_id,
  pet_policy,
  pet_note_raw,
  pet_note_short,
  source_updated_at,
  data_status,
  last_checked_at
) on table core.place_pet_policies to anon, authenticated;

drop policy if exists place_pet_policies_public_published on core.place_pet_policies;
create policy place_pet_policies_public_published
on core.place_pet_policies
for select
to anon, authenticated
using (public.is_published_place(place_id));

commit;
