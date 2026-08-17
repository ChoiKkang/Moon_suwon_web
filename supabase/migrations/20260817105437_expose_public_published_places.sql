-- Keep public place discovery separate from imported/operational records.
-- serving.v_published_places is the DB-owned publish gate; the imported view
-- supplies the full public card fields used by the web app.

create or replace view public.v_published_places
with (security_invoker = true) as
select imported.*
from serving.v_imported_places as imported
join serving.v_published_places as published on published.id = imported.id;

grant select on public.v_published_places to anon, authenticated;
