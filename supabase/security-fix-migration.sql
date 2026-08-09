-- ============================================================================
-- SECURITY FIX MIGRATION — products write-access lockdown + stock RPC
-- Rinku Kirana & General Store
-- ============================================================================
-- ✅ STATUS: PRODUCTION PAR APPLY HO CHUKA (2026-08-09) aur live verify kiya
--    gaya — customer UPDATE/DELETE blocked, admin write kaam karta hai,
--    decrement_stock RPC order flow ke liye chalta hai.
--
--    NOTE: is DB me ek pre-existing policy "products_admin_all" (cmd=ALL, qual
--    is_admin()) maujood thi jo admin-gated hai — use intentionally CHHORA gaya
--    hai (admin ko inactive products bhi read karne ke liye chahiye). Is file ka
--    DO block sirf INSERT/UPDATE/DELETE policies hatata hai, ALL-cmd ko nahi.
--
-- WHY (live audit, 2026-08-09): koi bhi logged-in customer (normal user!)
--      products table par UPDATE/DELETE kar sakta tha — price change, product
--      delete, stock chhedna. Cause: order stock-decrement ke liye ek broad
--      "authenticated UPDATE" policy banayi gayi thi jo POORI row ko edit
--      karne deti thi (RLS column-level restrict nahi kar sakta).
--
-- FIX:
--   1) Stock decrement ab sirf `decrement_stock()` function se hota hai
--      (SECURITY DEFINER — sirf stock_quantity kam karta hai, 0 se neeche
--      kabhi nahi).
--   2) products par authenticated/public role ki saari write policies
--      (INSERT/UPDATE/DELETE) hata kar SIRF admin roles ke liye nayi
--      policies banti hain (app_metadata.role ya admin_team table check).
--
-- ✅ Idempotent: jitni baar bhi chalayein, safe hai.
-- ▶️ Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

-- ── 1) Tightly-scoped stock decrement function ──────────────────────────────
CREATE OR REPLACE FUNCTION public.decrement_stock(p_product_id uuid, p_qty int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN
    RAISE EXCEPTION 'decrement_stock: qty must be >= 1';
  END IF;
  UPDATE public.products
     SET stock_quantity = GREATEST(0, COALESCE(stock_quantity, 0) - p_qty),
         updated_at     = now()
   WHERE id = p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decrement_stock(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, int) TO service_role;

-- ── 2) products par saari NON-ADMIN write policies hatao ────────────────────
--    (SELECT/read policies chhodo — customer site ko anon read chahiye)
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname, cmd, roles
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'products'
       AND cmd IN ('INSERT','UPDATE','DELETE')
       AND (roles @> ARRAY['authenticated']::name[] OR 'public' = ANY(roles))
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.products', pol.policyname);
    RAISE NOTICE 'products policy dropped: % (cmd=%)', pol.policyname, pol.cmd;
  END LOOP;
END $$;

-- ── 3) Sirf admin roles ko products write karne do ──────────────────────────
--    Check: app_metadata.role (purana system) YA admin_team table (naya Team
--    page). Customers ki app_metadata.role null hoti hai → blocked.
DO $$
BEGIN
  DROP POLICY IF EXISTS "products_write_admin_only" ON public.products;
  DROP POLICY IF EXISTS "products_delete_admin_only" ON public.products;
  DROP POLICY IF EXISTS "products_insert_admin_only" ON public.products;
END $$;

CREATE POLICY "products_write_admin_only"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin','admin','manager','staff'))
    OR EXISTS (
      SELECT 1 FROM public.admin_team t
      WHERE t.user_id = auth.uid() AND t.is_active
        AND t.role IN ('super_admin','admin','manager','staff')
    )
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin','admin','manager','staff'))
    OR EXISTS (
      SELECT 1 FROM public.admin_team t
      WHERE t.user_id = auth.uid() AND t.is_active
        AND t.role IN ('super_admin','admin','manager','staff')
    )
  );

CREATE POLICY "products_delete_admin_only"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin','admin','manager','staff'))
    OR EXISTS (
      SELECT 1 FROM public.admin_team t
      WHERE t.user_id = auth.uid() AND t.is_active
        AND t.role IN ('super_admin','admin','manager','staff')
    )
  );

CREATE POLICY "products_insert_admin_only"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role' IN ('super_admin','admin','manager','staff'))
    OR EXISTS (
      SELECT 1 FROM public.admin_team t
      WHERE t.user_id = auth.uid() AND t.is_active
        AND t.role IN ('super_admin','admin','manager','staff')
    )
  );

-- ── 4) Verify karne ke liye (SQL Editor me dobara run karo): ─────────────────
--    SELECT schemaname, tablename, policyname, cmd, roles
--      FROM pg_policies WHERE tablename = 'products' ORDER BY cmd;
--    → write policies sirf admin check wali dikhni chahiyein.
