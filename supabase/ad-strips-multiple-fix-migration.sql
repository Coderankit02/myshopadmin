-- ── Ad Strips → MULTIPLE strips fix (Homepage Builder) ─────────────────────
-- ⚠️ ORDER DEPENDENCY: iske BAAD `category-sections-migration.sql` chalao — wo
--   isi index (`homepage_sections_section_key_non_strip_key`) ko drop karke
--   `NOT IN ('ad_strip','category_sections')` wale predicate se banata hai.
-- ROOT CAUSE (live verified 2026-08-13):
--   homepage_sections.section_key par UNIQUE constraint hai. Admin + Add Strip
--   dabata hai to pehli strip ke liye row ban jaata hai (section_key='ad_strip'),
--   lekin 2nd strip ke liye wahi insert fail ho jaata hai:
--     duplicate key value violates unique constraint
--     "homepage_sections_section_key_key"
--   Aur admin code (Homepage.jsx addStrip) us error ko silently ignore karta
--   hai → strip homepage_ad_sections me banti hai par Section Order me kabhi
--   nahi aati → homepage par kabhi dikhti nahi. Isliye "sirf ek hi ad add
--   ho raha hai".
--
-- FIX:
--   1) section_key ka UNIQUE constraint hatana (ab koi bhi section row apne
--      ad_strip_id se distinct hota hai).
--   2) Partial unique index: ad_strip rows ke liye duplicate ALLOW, baaki
--      section_keys (hero, flash_sale, ...) pehle jaisi unique rehti hain.
--   3) Jo strips homepage_ad_sections me pehle se hain par homepage_sections
--      me row nahi hai, unhe Section Order me backfill karna (end par).
--
-- ✅ Idempotent: jitni baar bhi chalayein, safe hai.
-- ▶️ Apply: supabase db query --linked -f ad-strips-multiple-fix-migration.sql
--          (ya Supabase Dashboard → SQL Editor → paste → Run)
-- ============================================================================

-- 1) section_key par JO BHI unique constraint/index ho, use hatao (name-agnostic)
--    — constraint ka naam alag ho (jaise fresh setup me) to bhi kaam kare
DO $$
DECLARE obj text;
BEGIN
  -- unique constraints on section_key
  FOR obj IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'public.homepage_sections'::regclass
      AND c.contype = 'u'
      AND a.attname = 'section_key'
  LOOP
    EXECUTE format('ALTER TABLE public.homepage_sections DROP CONSTRAINT %I', obj);
  END LOOP;
  -- unique indexes on section_key (jo constraint nahi, index hain)
  FOR obj IN
    SELECT c.relname
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = 'public.homepage_sections'::regclass
      AND i.indisunique
      AND a.attname = 'section_key'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', obj);
  END LOOP;
END $$;

-- 2) Partial unique index — ad_strip ke ilawa baaki keys unique
create unique index if not exists homepage_sections_section_key_non_strip_key
  on public.homepage_sections (section_key)
  where section_key <> 'ad_strip';

-- 3) Existing strips backfill (Section Order ke end par, jo missing hain)
insert into public.homepage_sections (section_key, label, icon, ad_strip_id, sort_order, enabled)
select
  'ad_strip',
  s.title,
  '🖼️',
  s.id,
  (select coalesce(max(sort_order), 0) + 1 from public.homepage_sections),
  true
from public.homepage_ad_sections s
where not exists (
  select 1 from public.homepage_sections hs where hs.ad_strip_id = s.id
);

-- 4) Sort order renumber 1..N — backfill ke time saare missing strips ko ek hi
--    max+1 milta hai (duplicate sort_order) → customer site par order unstable
--    hota hai. Isliye poore table ko current order ke hisaab se renumber karo.
update public.homepage_sections hs
set sort_order = t.rn
from (
  select id, row_number() over (order by sort_order, created_at, id) as rn
  from public.homepage_sections
) t
where hs.id = t.id;

-- ── Verify ────────────────────────────────────────────────────────────────
-- select section_key, label, ad_strip_id, sort_order, enabled
--   from public.homepage_sections order by sort_order;
-- → HAR strip ka ek section row dikhna chahiye.
