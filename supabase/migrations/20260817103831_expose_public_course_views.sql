-- Expose the DB-owned serving course views through the public Data API schema.
-- The application only reads these aliases; course rows remain owned by the
-- ingestion/editorial workflow in core and editorial schemas.

create or replace view public.v_home_courses
with (security_invoker = true) as
select *
from serving.v_home_courses;

create or replace view public.v_course_detail
with (security_invoker = true) as
select *
from serving.v_course_detail;

grant select on public.v_home_courses to anon, authenticated;
grant select on public.v_course_detail to anon, authenticated;
