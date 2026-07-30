-- 사용자 프로필과 관리자 권한 판별 기반을 생성한다.
-- src/app/actions/kto.ts의 verifyAdminRole()이 public.profiles.role을 조회하므로
-- 이 테이블이 없으면 관리자 기능이 항상 권한 오류로 실패한다.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  -- Apple 로그인은 최초 1회만 이름을 전달하므로 별도 보관한다.
  auth_provider text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 본인 프로필만 조회한다.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

-- 본인 프로필의 표시 정보만 수정한다. role 변경은 아래 트리거로 차단한다.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 권한 상승을 막기 위해 일반 사용자의 role 변경을 거부한다.
create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
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

-- 신규 가입 시 프로필 행을 자동 생성한다.
-- Apple은 email을 private relay로 전달할 수 있고 이름은 최초 1회만 제공한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, auth_provider)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'nickname',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    new.raw_app_meta_data ->> 'provider'
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

-- 기존 사용자에 대한 프로필 보정. 이미 있는 행은 건드리지 않는다.
insert into public.profiles (id, email, display_name, auth_provider)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(coalesce(u.email, ''), '@', 1)
  ),
  u.raw_app_meta_data ->> 'provider'
from auth.users as u
on conflict (id) do nothing;
