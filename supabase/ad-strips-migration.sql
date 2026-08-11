-- ad-strips-migration.sql
-- ============================================================
-- Homepage "Ad Strips" — mid-page auto-scrolling image strips
-- ------------------------------------------------------------
-- Admin Homepage Builder se manage hote hain (kisi bhi position par,
-- kitni bhi strips, har strip me kitni bhi images):
--   • No text overlay, no dots — sirf auto-scroll hone wali images
--   • Har image par click → category ya specific product redirect
--   • Public sirf ACTIVE sections/images dekhta hai; admin (is_admin)
--     full control rakhta hai
-- Applied via: supabase db query --linked (11 Aug 2026)

create table if not exists homepage_ad_sections (
  id         uuid primary key default gen_random_uuid(),
  title      text not null default 'Ad Strip',
  position   int  not null default 1,   -- kitne section ke BAAD dikhe (1 = hero ke baad)
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists homepage_ad_images (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid references homepage_ad_sections(id) on delete cascade,
  image_url   text not null,
  link_type   text not null default 'none' check (link_type in ('none','category','product')),
  link_value  uuid,               -- category id ya product id (link_type ke hisaab se)
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table homepage_ad_sections enable row level security;
alter table homepage_ad_images enable row level security;

create policy ad_sections_public_read on homepage_ad_sections
  for select to anon, authenticated using (is_active = true);
create policy ad_images_public_read on homepage_ad_images
  for select to anon, authenticated using (is_active = true);
create policy ad_sections_admin_all on homepage_ad_sections
  for all to authenticated using (is_admin()) with check (is_admin());
create policy ad_images_admin_all on homepage_ad_images
  for all to authenticated using (is_admin()) with check (is_admin());
