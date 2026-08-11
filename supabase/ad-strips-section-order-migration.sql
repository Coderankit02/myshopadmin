-- ── Ad Strips → Section Order (Homepage Builder) ──────────────────────────
-- Ad strips ab Section Order list me hi dikhti hain (drag up/down + show/hide).
-- position field (homepage_ad_sections.position) ab rendering ko control nahi
-- karta — rendering homepage_sections ke order se hoti hai.
--
-- 1) homepage_sections me ad_strip_id column (FK → homepage_ad_sections, cascade)
alter table public.homepage_sections
  add column if not exists ad_strip_id uuid
  references public.homepage_ad_sections(id)
  on delete cascade;

-- 2) Existing strips ko section order me backfill (end par)
insert into public.homepage_sections (section_key, label, icon, ad_strip_id, sort_order, enabled)
select
  'ad_strip',
  title,
  '🖼️',
  id,
  (select coalesce(max(sort_order), 0) + 1 from public.homepage_sections),
  true
from public.homepage_ad_sections s
where not exists (
  select 1 from public.homepage_sections hs where hs.ad_strip_id = s.id
);
