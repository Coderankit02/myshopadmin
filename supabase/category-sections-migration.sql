-- ── Category Sections → HAR category ka apna Section Order row ─────────────
-- USER DEMAND (2026-08-13): "categories jo sari ek line se aa rahi hain, unke
--   beech me bhi ad strip (ya koi section) daal saken."
--
-- ⚠️ ORDER DEPENDENCY: ye migration `ad-strips-multiple-fix-migration.sql` ke
--   BAAD chalna chahiye — wo `homepage_sections_section_key_non_strip_key`
--   index ko `WHERE section_key <> 'ad_strip'` ke saath banata hai; ye wahi
--   index drop karke `NOT IN ('ad_strip','category_sections')` wala version
--   banata hai. Ulta order chalega to bhi (IF NOT EXISTS skip karega) par
--   stale predicate reh jayega.
--
-- Pehle: homepage_sections me SIRF ek 'category_sections' row hota tha → saari
--   categories ek block me ek-ke-baad-ek dikhti thin, beech me kuch nahi daal
--   sakte the.
-- Ab:   har category ka apna row (section_key='category_sections' +
--   category_id) → Section Order me drag karke kahin bhi le ja sakte ho —
--   ad strips categories ke beech bhi aa sakti hain.
--
-- FALLBACK: purana aggregate row (category_id NULL, label "Category Sections")
--   bhi rehta hai — customer side par wo saari categories dikhata hai jin ka
--   apna row NAHI hai (nayi category banane par turant dikhti hai, jab tak
--   admin "Sync Categories" na dabaye).
--
-- ✅ Idempotent: jitni baar chalayein, safe hai.
-- ▶️ Apply: supabase db query --linked -f category-sections-migration.sql
--          (ya Supabase Dashboard → SQL Editor → paste → Run)
-- ============================================================================

-- 1) category_id column (FK → categories, category delete hone par row bhi delete)
alter table public.homepage_sections
  add column if not exists category_id uuid
  references public.categories(id)
  on delete cascade;

-- 2) section_key partial unique index update: ab 'category_sections' bhi multiple
--    rows rakhta hai (har category ka ek). Baaki keys (hero, flash_sale, ...)
--    pehle jaisi unique.
drop index if exists homepage_sections_section_key_non_strip_key;
create unique index if not exists homepage_sections_section_key_non_strip_key
  on public.homepage_sections (section_key)
  where section_key not in ('ad_strip','category_sections');

-- 3) Ek category ka SIRF ek section row (duplicate rows prevent)
create unique index if not exists homepage_sections_category_id_key
  on public.homepage_sections (category_id)
  where category_id is not null;

-- 4) Backfill: har active category ka apna row — AGGREGATE position par hi
--    (layout preserve: categories pehle jahan dikhti thin, wahin rehti hain,
--    bas ab har ek ka apna section row hai jo admin drag kar sakta hai)
DO $$
DECLARE
  agg_pos int;
BEGIN
  -- aggregate row ki position (category_sections with NULL category_id)
  select sort_order into agg_pos from public.homepage_sections
    where section_key = 'category_sections' and category_id is null
    order by sort_order limit 1;
  agg_pos := coalesce(agg_pos, 8);

  -- reorder space banao (multiply by 100 — no collision)
  update public.homepage_sections set sort_order = sort_order * 100;

  -- har category ka row aggregate ke turant baad (category sort_order se)
  insert into public.homepage_sections (section_key, label, icon, category_id, sort_order, enabled)
  select
    'category_sections',
    c.name,
    '🛒',
    c.id,
    agg_pos * 100 + row_number() over (order by c.sort_order, c.name),
    true
  from public.categories c
  where c.is_active = true
    and not exists (
      select 1 from public.homepage_sections hs where hs.category_id = c.id
    );
END $$;

-- 5) Sort order renumber 1..N (idempotent, deterministic)
update public.homepage_sections hs
set sort_order = t.rn
from (
  select id, row_number() over (order by sort_order, created_at, id) as rn
  from public.homepage_sections
) t
where hs.id = t.id;

-- ── Verify ────────────────────────────────────────────────────────────────
-- select section_key, label, category_id, sort_order, enabled
--   from public.homepage_sections order by sort_order;
-- → har active category ka apna 'category_sections' row dikhna chahiye.
