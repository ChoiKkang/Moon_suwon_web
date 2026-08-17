-- Keep the public course detail API aligned with the published course list.
-- serving.v_course_detail contains internal course rows; only courses present
-- in public.v_home_courses may be exposed to anon/authenticated clients.

create or replace view public.v_course_detail
with (security_invoker = true) as
select detail.*
from serving.v_course_detail as detail
where exists (
  select 1
  from public.v_home_courses as home
  where home.id = detail.course_id
);

grant select on public.v_course_detail to anon, authenticated;
