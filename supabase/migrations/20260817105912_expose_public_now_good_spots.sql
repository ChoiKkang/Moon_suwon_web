-- Expose the DB-owned, publish-gated current crowd recommendation view.

create or replace view public.v_now_good_spot_candidates
with (security_invoker = true) as
select *
from serving.v_now_good_spot_candidates;

grant select on public.v_now_good_spot_candidates to anon, authenticated;
