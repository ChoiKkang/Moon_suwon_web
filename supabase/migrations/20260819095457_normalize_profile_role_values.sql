-- Keep the role contract consistent with the remote database and the admin guard.
-- This migration is idempotent for projects that already contain USER/ADMIN values.
update public.profiles
set role = upper(role)
where role is not null;

alter table public.profiles
  alter column role set default 'USER';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('USER', 'ADMIN'));
