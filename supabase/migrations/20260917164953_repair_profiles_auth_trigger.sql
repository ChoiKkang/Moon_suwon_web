-- Repair the profile/auth contract for projects that already have a legacy
-- public.profiles table as well as fresh installs using the newer shape.
--
-- The admin guard reads only profiles.role, but profile creation must satisfy
-- every NOT NULL column on the legacy table.  Keep both column names during
-- the transition so existing data and the current application remain safe.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  auth_provider text,
  role text not null default 'USER',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists auth_provider text,
  add column if not exists nickname text,
  add column if not exists provider text,
  add column if not exists provider_sub text,
  add column if not exists is_private_email boolean not null default false;

-- Fill both the legacy and current profile fields from Auth before enforcing
-- the legacy table's NOT NULL provider fields.
update public.profiles as p
set
  email = coalesce(p.email, u.email),
  display_name = coalesce(
    p.display_name,
    p.nickname,
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'nickname',
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  nickname = coalesce(
    p.nickname,
    p.display_name,
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'nickname',
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  avatar_url = coalesce(
    p.avatar_url,
    u.raw_user_meta_data ->> 'avatar_url',
    u.raw_user_meta_data ->> 'picture'
  ),
  auth_provider = coalesce(p.auth_provider, u.raw_app_meta_data ->> 'provider', i.provider),
  provider = coalesce(p.provider, u.raw_app_meta_data ->> 'provider', i.provider, 'unknown'),
  provider_sub = coalesce(nullif(p.provider_sub, ''), i.provider_id, u.id::text),
  is_private_email = coalesce(
    p.is_private_email,
    lower(coalesce(u.email, '')) like '%@privaterelay.appleid.com'
  ),
  updated_at = now()
from auth.users as u
left join lateral (
  select provider, provider_id
  from auth.identities
  where user_id = u.id
  order by created_at desc nulls last
  limit 1
) as i on true
where p.id = u.id;

-- Create profiles for Auth users created before the trigger was installed.
insert into public.profiles (
  id,
  email,
  display_name,
  nickname,
  avatar_url,
  auth_provider,
  provider,
  provider_sub,
  is_private_email,
  role
)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'nickname',
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'nickname',
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
  coalesce(u.raw_app_meta_data ->> 'provider', i.provider),
  coalesce(u.raw_app_meta_data ->> 'provider', i.provider, 'unknown'),
  coalesce(i.provider_id, u.id::text),
  lower(coalesce(u.email, '')) like '%@privaterelay.appleid.com',
  'USER'
from auth.users as u
left join lateral (
  select provider, provider_id
  from auth.identities
  where user_id = u.id
  order by created_at desc nulls last
  limit 1
) as i on true
where not exists (
  select 1 from public.profiles as existing where existing.id = u.id
)
on conflict (id) do nothing;

-- Keep one role vocabulary across legacy and fresh installations.
alter table public.profiles
  alter column role drop default;

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = case when upper(coalesce(role, '')) = 'ADMIN' then 'ADMIN' else 'USER' end;

alter table public.profiles
  add constraint profiles_role_check check (role in ('USER', 'ADMIN'));

alter table public.profiles
  alter column role set default 'USER',
  alter column provider set not null,
  alter column provider_sub set not null;

alter table public.profiles enable row level security;

grant select, insert, update on table public.profiles to authenticated;

drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Users can insert profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- A user may edit their display fields but cannot promote themselves.  Auth
-- service-role SQL (which has no auth.uid()) remains able to administer roles.
create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'role 컬럼은 직접 변경할 수 없습니다.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_change on public.profiles;
create trigger profiles_prevent_role_change
before update on public.profiles
for each row
execute function public.prevent_profile_role_change();

-- Keep profile creation atomic with OAuth user creation.  provider_sub falls
-- back to the Auth UUID because auth.identities can be inserted after the
-- auth.users row trigger fires.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  provider_name text := coalesce(new.raw_app_meta_data ->> 'provider', 'unknown');
  profile_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'nickname',
    split_part(coalesce(new.email, ''), '@', 1)
  );
  profile_avatar text := coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture'
  );
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    nickname,
    avatar_url,
    auth_provider,
    provider,
    provider_sub,
    is_private_email,
    role
  )
  values (
    new.id,
    new.email,
    profile_name,
    profile_name,
    profile_avatar,
    provider_name,
    provider_name,
    coalesce(new.raw_user_meta_data ->> 'sub', new.id::text),
    lower(coalesce(new.email, '')) like '%@privaterelay.appleid.com',
    'USER'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();
