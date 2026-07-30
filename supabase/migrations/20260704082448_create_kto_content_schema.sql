create schema if not exists core;
create schema if not exists editorial;
create schema if not exists serving;

create extension if not exists pgcrypto;

create table if not exists core.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  official_name text not null,
  address_full text,
  lat numeric(10,7) not null,
  lng numeric(10,7) not null,
  contact_phone text,
  source_overview_raw text,
  short_description text,
  recommended_stay_min int default 30,
  category text,
  is_active boolean default true,
  source_modified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists core.place_sources (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null unique references core.places(id) on delete cascade,
  kto_content_id text not null unique,
  kto_content_type_id text not null,
  sync_enabled boolean default true,
  created_at timestamptz default now()
);

create table if not exists core.place_images (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references core.places(id) on delete cascade,
  image_url text not null,
  thumbnail_url text,
  alt_text text,
  copyright_type text,
  source_provider text default 'KTO',
  source_image_id text,
  is_hero boolean default false,
  display_order int default 0,
  created_at timestamptz default now(),
  unique (place_id, source_provider, source_image_id)
);

alter table core.place_images add column if not exists thumbnail_url text;
alter table core.place_images add column if not exists alt_text text;
alter table core.place_images add column if not exists copyright_type text;
alter table core.place_images add column if not exists source_provider text default 'KTO';
alter table core.place_images add column if not exists source_image_id text;

create unique index if not exists place_images_place_source_image_key
on core.place_images(place_id, source_provider, source_image_id);

create table if not exists editorial.place_copy (
  place_id uuid primary key references core.places(id) on delete cascade,
  display_name text,
  short_description text,
  night_highlight text,
  photo_tip text,
  mission_title text,
  mission_body text,
  mission_radius_m int default 80,
  og_title text,
  og_description text,
  og_image_url text,
  updated_at timestamptz default now()
);

alter table editorial.place_copy add column if not exists short_description text;
alter table editorial.place_copy add column if not exists night_highlight text;
alter table editorial.place_copy add column if not exists photo_tip text;
alter table editorial.place_copy add column if not exists mission_title text;
alter table editorial.place_copy add column if not exists mission_body text;
alter table editorial.place_copy add column if not exists mission_radius_m int default 80;
alter table editorial.place_copy add column if not exists og_title text;
alter table editorial.place_copy add column if not exists og_description text;
alter table editorial.place_copy add column if not exists og_image_url text;
alter table editorial.place_copy add column if not exists updated_at timestamptz default now();

alter table core.places enable row level security;
alter table core.place_sources enable row level security;
alter table core.place_images enable row level security;
alter table editorial.place_copy enable row level security;

drop policy if exists "Public can read active places" on core.places;
create policy "Public can read active places"
on core.places
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Public can read sources for active places" on core.place_sources;
create policy "Public can read sources for active places"
on core.place_sources
for select
to anon, authenticated
using (
  exists (
    select 1
    from core.places p
    where p.id = place_sources.place_id
      and p.is_active = true
  )
);

drop policy if exists "Public can read images for active places" on core.place_images;
create policy "Public can read images for active places"
on core.place_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from core.places p
    where p.id = place_images.place_id
      and p.is_active = true
  )
);

drop policy if exists "Public can read copy for active places" on editorial.place_copy;
create policy "Public can read copy for active places"
on editorial.place_copy
for select
to anon, authenticated
using (
  exists (
    select 1
    from core.places p
    where p.id = place_copy.place_id
      and p.is_active = true
  )
);

create or replace view serving.v_imported_places
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.official_name,
  coalesce(pc.display_name, p.official_name) as display_name,
  p.address_full,
  p.lat,
  p.lng,
  p.contact_phone,
  p.source_overview_raw,
  coalesce(pc.short_description, p.short_description) as short_description,
  p.category,
  ps.kto_content_id,
  ps.kto_content_type_id,
  hero.image_url as hero_image_url,
  hero.thumbnail_url as hero_thumbnail_url,
  p.source_modified_at,
  p.is_active
from core.places p
left join core.place_sources ps on ps.place_id = p.id
left join editorial.place_copy pc on pc.place_id = p.id
left join lateral (
  select image_url, thumbnail_url
  from core.place_images pi
  where pi.place_id = p.id and pi.is_hero = true
  order by pi.display_order asc, pi.created_at asc
  limit 1
) hero on true
where p.is_active = true;

grant usage on schema core to anon, authenticated;
grant usage on schema editorial to anon, authenticated;
grant usage on schema serving to anon, authenticated;
grant select on core.places to anon, authenticated;
grant select on core.place_sources to anon, authenticated;
grant select on core.place_images to anon, authenticated;
grant select on editorial.place_copy to anon, authenticated;
grant select on serving.v_imported_places to anon, authenticated;

create or replace view public.v_imported_places
with (security_invoker = true) as
select *
from serving.v_imported_places;

grant select on public.v_imported_places to anon, authenticated;
