-- ============================================================================
-- RLS HARDENING — PART 2 (audit follow-up fixes)
-- Rinku Kirana & General Store
-- ============================================================================
-- ✅ STATUS: PRODUCTION PAR APPLY HO CHUKA (2026-08-09) — live verified
--
-- Full RLS audit ke baad mile vulnerabilities (priority wise):
--   🔴 order_status_history   — "Admin can manage status history" (authenticated
--                               ALL=true) + "order_status_history_all" (public
--                               ALL=true): KOI BHI (even anon) kisi bhi order ka
--                               status history insert/update/delete kar sakta tha.
--   🔴 ananya_chat_sessions   — anon SELECT/UPDATE = true: koi bhi kisi bhi
--                               session ko padh/change kar sakta tha (session
--                               hijack + privacy).
--   🔴 ananya_chat_messages   — anon SELECT = true: kisi bhi customer ki chat
--                               (PII: phone, address, orders) koi bhi padh sakta
--                               tha. "message_owner" me `auth.uid() IS NULL`
--                               escape tha → anon ke liye EXISTS hamesha true.
--   🔴 orders / order_items   — "orders_own_all" (authenticated ALL) + public
--                               INSERT policies: customer apna order UPDATE/
--                               DELETE kar sakta tha (final_amount, status,
--                               payment_status tamper) aur direct REST se
--                               tampered totals ke saath order INSERT.
--   🔴 payment_verifications  — "payment_verifications_own_all" (ALL): customer
--                               apni verification ko UPDATE karke status='paid'
--                               flip kar sakta tha (payment bypass!).
--   🔴 category_images        — "category_images_write" (public ALL,
--                               auth.role()='authenticated'): koi bhi logged-in
--                               user category images write kar sakta tha.
--   🟠 notifications          — "Service role can insert notifications" (public
--                               INSERT=true): koi bhi fake/phishing notification
--                               insert kar sakta tha.
--   🟠 is_admin()             — delivery/support roles bhi is_admin()=true dete
--                               the → wo products/catalog write kar sakte the.
--                               Naya is_admin_write() = sirf super_admin/admin/
--                               manager/staff.
--   🟠 product_image_prompts  — RLS=false (koi policy nahi).
--
-- FIX SUMMARY:
--   1) is_admin_write() — strict catalog-write check (no delivery/support).
--   2) order_status_history — write sirf is_admin(); public/authenticated ALL
--      policies dropped.
--   3) ananya chat — owner-based (user_id = auth.uid(), chat ab login-required
--      hai) + admin via is_admin(). Saari anon/public-true policies dropped.
--   4) orders/order_items — customer direct INSERT dropped; order creation ab
--      sirf create_order() RPC se hota hai jo DB prices + coupon server-side
--      verify karta hai. Customer SELECT own order ka use karta hai.
--   5) payment_verifications — customer UPDATE/DELETE dropped (sirf INSERT +
--      SELECT own). Admin approve is_admin() se.
--   6) category_images / notifications — open writes dropped.
--   7) Catalog tables (products/categories/brands/coupons/banners/homepage/
--      category_images/product_images/shop_settings/wallets/wallet_transactions/
--      loyalty_points/admin_team/audit_logs/login_history) → is_admin_write().
--   8) product_image_prompts — RLS ON + admin-only policy.
--   9) create_order() RPC — SECURITY DEFINER, server-side total verification
--      (COD / UPI / Razorpay sab ke liye). Client cart prices IGNORE hote hain.
--
-- ✅ Idempotent. Edge-function se production par apply + live verify ho chuka.
-- ▶️ Supabase Dashboard → SQL Editor → paste → Run (ya edge function re-run).
-- ============================================================================

-- ── 0) is_admin_write() — catalog/settings/money tables ke liye strict check ─
--    delivery/support ko products & money tables par write se rokta hai.
CREATE OR REPLACE FUNCTION public.is_admin_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (to_regclass('public.admin_team') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.admin_team t
       WHERE t.user_id = auth.uid() AND t.is_active = true
         AND t.role IN ('super_admin','admin','manager','staff')
     ))
    OR COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN
       ('super_admin','admin','manager','staff');
$function$;

-- ── 1) order_status_history — write sirf admin ──────────────────────────────
DROP POLICY IF EXISTS "Admin can manage status history" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_all"        ON public.order_status_history;
-- (order_status_history_admin_all — is_admin() — rehne diya)

-- ── 2) ananya_chat_sessions — owner + admin ─────────────────────────────────
DROP POLICY IF EXISTS "admin_panel_read_sessions"  ON public.ananya_chat_sessions;
DROP POLICY IF EXISTS "admin_panel_update_sessions" ON public.ananya_chat_sessions;
DROP POLICY IF EXISTS "ai_sessions_public_read"     ON public.ananya_chat_sessions;
DROP POLICY IF EXISTS "ai_sessions_public_update"   ON public.ananya_chat_sessions;
DROP POLICY IF EXISTS "anon_session_update"         ON public.ananya_chat_sessions;
DROP POLICY IF EXISTS "anon_session_insert"         ON public.ananya_chat_sessions;
DROP POLICY IF EXISTS "ai_sessions_public_insert"   ON public.ananya_chat_sessions;
DROP POLICY IF EXISTS "session_owner"               ON public.ananya_chat_sessions;
DROP POLICY IF EXISTS "ai_sessions_admin_all"       ON public.ananya_chat_sessions;

DROP POLICY IF EXISTS "ananya_sessions_owner_all" ON public.ananya_chat_sessions;
CREATE POLICY "ananya_sessions_owner_all" ON public.ananya_chat_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "ananya_sessions_admin_all" ON public.ananya_chat_sessions;
CREATE POLICY "ananya_sessions_admin_all" ON public.ananya_chat_sessions
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── 3) ananya_chat_messages — owner (session se) + admin ────────────────────
DROP POLICY IF EXISTS "admin_panel_read_messages"  ON public.ananya_chat_messages;
DROP POLICY IF EXISTS "admin_panel_insert_messages" ON public.ananya_chat_messages;
DROP POLICY IF EXISTS "ai_messages_public_read"     ON public.ananya_chat_messages;
DROP POLICY IF EXISTS "ai_messages_public_insert"   ON public.ananya_chat_messages;
DROP POLICY IF EXISTS "anon_message_select"         ON public.ananya_chat_messages;
DROP POLICY IF EXISTS "anon_message_insert"         ON public.ananya_chat_messages;
DROP POLICY IF EXISTS "message_owner"               ON public.ananya_chat_messages;
DROP POLICY IF EXISTS "ai_messages_admin_all"       ON public.ananya_chat_messages;

DROP POLICY IF EXISTS "ananya_messages_owner_all" ON public.ananya_chat_messages;
CREATE POLICY "ananya_messages_owner_all" ON public.ananya_chat_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ananya_chat_sessions s
      WHERE s.id = ananya_chat_messages.session_id
        AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ananya_chat_sessions s
      WHERE s.id = ananya_chat_messages.session_id
        AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "ananya_messages_admin_all" ON public.ananya_chat_messages;
CREATE POLICY "ananya_messages_admin_all" ON public.ananya_chat_messages
  FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ── 4) orders — customer direct INSERT/UPDATE/DELETE band, SELECT own rehta ─
DROP POLICY IF EXISTS "orders_own_all"       ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "orders_own_insert"    ON public.orders;
DROP POLICY IF EXISTS "orders_user_insert"   ON public.orders;

-- ── 5) order_items — customer direct INSERT band, SELECT own rehta ──────────
DROP POLICY IF EXISTS "Users can insert order items"     ON public.order_items;
DROP POLICY IF EXISTS "Users can insert own order items" ON public.order_items;
DROP POLICY IF EXISTS "order_items_own"                  ON public.order_items;
DROP POLICY IF EXISTS "order_items_own_all"              ON public.order_items;

-- ── 6) payment_verifications — customer UPDATE/DELETE band ──────────────────
DROP POLICY IF EXISTS "payment_verifications_own_all" ON public.payment_verifications;

-- ── 7) category_images — open authenticated write band ──────────────────────
DROP POLICY IF EXISTS "category_images_write" ON public.category_images;

-- ── 8) notifications — public INSERT band ───────────────────────────────────
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- ── 9) Catalog/settings/money tables → is_admin_write() ─────────────────────
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT tablename, policyname, cmd, roles
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'products','categories','brands','banners','coupons',
         'homepage_sections','category_images','product_images',
         'shop_settings','admin_team','wallets','wallet_transactions',
         'loyalty_points','audit_logs','login_history'
       )
       AND (roles @> ARRAY['authenticated']::name[] OR 'public' = ANY(roles))
       AND policyname LIKE '%admin_all%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','categories','brands','banners','coupons',
    'homepage_sections','category_images','product_images',
    'shop_settings','admin_team','wallets','wallet_transactions',
    'loyalty_points','audit_logs','login_history']
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I
         FOR ALL TO authenticated
         USING (public.is_admin_write())
         WITH CHECK (public.is_admin_write())',
      t || '_admin_all', t
    );
  END LOOP;
END $$;

-- ── 10) product_image_prompts — RLS ON + admin-only ─────────────────────────
ALTER TABLE public.product_image_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pim_admin_all" ON public.product_image_prompts;
CREATE POLICY "pim_admin_all" ON public.product_image_prompts
  FOR ALL TO authenticated
  USING (public.is_admin_write())
  WITH CHECK (public.is_admin_write());

-- ============================================================================
-- 11) create_order() RPC — server-side order creation + total verification
--     COD / UPI / Razorpay — sab flow isi se order banate hain.
--     Client cart prices IGNORE ki jaati hain; DB selling_price se subtotal
--     recompute hota hai; coupon server-side validate hota hai.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_order(
  p_user_id uuid,
  p_cart jsonb,               -- [{id, qty, e}]
  p_address jsonb,            -- {name, phone, line1, line2, city, pincode}
  p_payment_method text,
  p_promo_code text DEFAULT NULL,
  p_latitude double precision DEFAULT NULL,
  p_longitude double precision DEFAULT NULL,
  p_distance_km numeric DEFAULT NULL,
  p_delivery_charge integer DEFAULT 0,
  p_delivery_status text DEFAULT 'unknown',
  p_maps_link text DEFAULT NULL,
  p_maps_nav_link text DEFAULT NULL,
  p_location_accuracy integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid           uuid := p_user_id;
  v_order_id      uuid;
  v_order_number  text;
  v_item          jsonb;
  v_prod          record;
  v_subtotal      numeric := 0;
  v_discount      numeric := 0;
  v_coupon        record;
  v_line          numeric;
  v_cat_name      text;
  v_final         numeric;
  v_pids          uuid[];
  v_cats          uuid[];
  v_ok            boolean;
  v_is_blocked    boolean;
  v_delivery_charge int := 0;
BEGIN
  -- HARDENING (review follow-up): delivery_charge client se aata hai —
  -- security boundary hone ke naate clamp (0..500). 0 se kam ya 500 se zyada
  -- bheja gaya charge ignore karke 0 set karte hain (₹0 = koi fee nahi).
  IF p_delivery_charge IS NOT NULL AND p_delivery_charge >= 0 AND p_delivery_charge <= 500 THEN
    v_delivery_charge := p_delivery_charge;
  ELSE
    v_delivery_charge := 0;
  END IF;
  -- auth: guest (p_user_id NULL) ya same logged-in user
  IF p_user_id IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'create_order: user mismatch';
  END IF;

  -- blocked check
  IF v_uid IS NOT NULL THEN
    SELECT is_blocked INTO v_is_blocked FROM public.profiles WHERE id = v_uid;
    IF v_is_blocked THEN
      RAISE EXCEPTION 'create_order: user blocked';
    END IF;
  END IF;

  IF jsonb_array_length(p_cart) = 0 THEN
    RAISE EXCEPTION 'create_order: empty cart';
  END IF;

  -- subtotal sirf DB selling_price se (client price IGNORE)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart) LOOP
    SELECT id, name, unit_value, selling_price, original_price, category_id,
           stock_quantity, is_active
      INTO v_prod
      FROM public.products
     WHERE id = (v_item->>'id')::uuid;

    IF NOT FOUND OR NOT v_prod.is_active THEN
      RAISE EXCEPTION 'create_order: product unavailable: %', COALESCE(v_item->>'name','?');
    END IF;

    IF (v_item->>'qty')::int < 1 THEN
      RAISE EXCEPTION 'create_order: invalid quantity';
    END IF;

    -- HARDENING (review follow-up): oversell guard — stock sufficient hona
    -- chahiye, warna order reject (pehle GREATEST(0,...) clamp karta tha jo
    -- stock 1 par qty 5 ka order accept kar leta tha).
    IF COALESCE(v_prod.stock_quantity, 0) < (v_item->>'qty')::int THEN
      RAISE EXCEPTION 'create_order: insufficient stock for %', v_prod.name;
    END IF;

    v_subtotal := v_subtotal + v_prod.selling_price * (v_item->>'qty')::int;
  END LOOP;

  -- coupon — server-side full validation (useCouponValidator jaisa)
  IF p_promo_code IS NOT NULL AND btrim(p_promo_code) <> '' THEN
    SELECT * INTO v_coupon
      FROM public.coupons
     WHERE code = upper(btrim(p_promo_code))
       AND is_active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'create_order: invalid coupon';
    END IF;
    IF v_coupon.expiry_date IS NOT NULL AND v_coupon.expiry_date < CURRENT_DATE THEN
      RAISE EXCEPTION 'create_order: coupon expired';
    END IF;
    IF v_coupon.usage_limit IS NOT NULL
       AND COALESCE(v_coupon.used_count,0) >= v_coupon.usage_limit THEN
      RAISE EXCEPTION 'create_order: coupon usage limit reached';
    END IF;
    IF v_coupon.min_order IS NOT NULL AND v_subtotal < v_coupon.min_order THEN
      RAISE EXCEPTION 'create_order: minimum order not met';
    END IF;

    -- customer restriction
    IF array_length(COALESCE(v_coupon.customer_ids,'{}'),1) > 0
       AND (v_uid IS NULL OR NOT (v_uid = ANY(v_coupon.customer_ids))) THEN
      RAISE EXCEPTION 'create_order: coupon not for this user';
    END IF;

    -- product/category restriction
    IF array_length(COALESCE(v_coupon.product_ids,'{}'),1) > 0
       OR array_length(COALESCE(v_coupon.category_ids,'{}'),1) > 0 THEN
      SELECT array_agg(DISTINCT (x->>'id')::uuid) INTO v_pids
        FROM jsonb_array_elements(p_cart) x;
      SELECT array_agg(DISTINCT category_id) INTO v_cats
        FROM public.products WHERE id = ANY(v_pids);

      IF array_length(COALESCE(v_coupon.product_ids,'{}'),1) > 0 THEN
        SELECT EXISTS (
          SELECT 1 FROM unnest(v_pids) p WHERE p = ANY(v_coupon.product_ids)
        ) INTO v_ok;
        IF NOT v_ok THEN
          RAISE EXCEPTION 'create_order: coupon not valid for these products';
        END IF;
      END IF;

      IF array_length(COALESCE(v_coupon.category_ids,'{}'),1) > 0 THEN
        SELECT EXISTS (
          SELECT 1 FROM unnest(v_cats) c WHERE c = ANY(v_coupon.category_ids)
        ) INTO v_ok;
        IF NOT v_ok THEN
          RAISE EXCEPTION 'create_order: coupon not valid for these categories';
        END IF;
      END IF;
    END IF;

    v_discount := CASE
      WHEN v_coupon.discount_type = 'percent'
        THEN round(v_subtotal * v_coupon.discount_value / 100)
      ELSE v_coupon.discount_value
    END;
    v_discount := LEAST(v_discount, v_subtotal);
  END IF;

  v_final := GREATEST(0, v_subtotal - v_discount + v_delivery_charge);

  -- order number: 6-digit + year (collision-resistant)
  v_order_number := 'RK-' || to_char(now(),'YYYY') || '-' ||
                    floor(100000 + random()*900000)::int::text;

  -- insert order
  INSERT INTO public.orders (
    user_id, order_number, status, payment_method, payment_status,
    subtotal, discount, promo_code, final_amount,
    delivery_name, delivery_phone, delivery_line1, delivery_line2,
    delivery_city, delivery_pincode,
    latitude, longitude, distance_km, delivery_charge, delivery_status,
    maps_link, maps_nav_link, location_accuracy,
    created_at, updated_at
  ) VALUES (
    v_uid, v_order_number, 'pending', p_payment_method, 'pending',
    v_subtotal::int, v_discount::int, upper(btrim(COALESCE(p_promo_code,''))), v_final::int,
    p_address->>'name', p_address->>'phone', p_address->>'line1',
    COALESCE(p_address->>'line2',''), COALESCE(p_address->>'city','Jaunpur'),
    COALESCE(p_address->>'pincode',''),
    p_latitude, p_longitude, p_distance_km, v_delivery_charge,
    COALESCE(p_delivery_status,'unknown'),
    p_maps_link, p_maps_nav_link, p_location_accuracy,
    now(), now()
  ) RETURNING id INTO v_order_id;

  -- insert items (DB price + DB name/unit/category) + stock decrement
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_cart) LOOP
    SELECT id, name, unit_value, selling_price, original_price, category_id
      INTO v_prod
      FROM public.products
     WHERE id = (v_item->>'id')::uuid;

    SELECT name INTO v_cat_name FROM public.categories WHERE id = v_prod.category_id;

    v_line := (v_prod.selling_price * (v_item->>'qty')::int);

    INSERT INTO public.order_items (
      order_id, product_id, name, unit, emoji, category,
      price, old_price, qty, line_total
    ) VALUES (
      v_order_id, v_prod.id, v_prod.name, COALESCE(v_prod.unit_value,''),
      COALESCE(v_item->>'e',''), COALESCE(v_cat_name,'General'),
      v_prod.selling_price::int,
      CASE WHEN v_prod.original_price IS NOT NULL
           THEN v_prod.original_price::int ELSE NULL END,
      (v_item->>'qty')::int, v_line::int
    );

    -- stock decrement (decrement_stock jaisa hi behavior)
    UPDATE public.products
       SET stock_quantity = GREATEST(0, COALESCE(stock_quantity,0) - (v_item->>'qty')::int),
           updated_at     = now()
     WHERE id = v_prod.id;
  END LOOP;

  -- coupon usage increment
  IF p_promo_code IS NOT NULL AND btrim(p_promo_code) <> '' THEN
    UPDATE public.coupons
       SET used_count = COALESCE(used_count,0) + 1
     WHERE code = upper(btrim(p_promo_code));
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'final_amount', v_final
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order(
  uuid, jsonb, jsonb, text, text, double precision, double precision,
  numeric, integer, text, text, text, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(
  uuid, jsonb, jsonb, text, text, double precision, double precision,
  numeric, integer, text, text, text, integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(
  uuid, jsonb, jsonb, text, text, double precision, double precision,
  numeric, integer, text, text, text, integer
) TO anon;

-- ============================================================================
-- VERIFY (SQL Editor me dobara run karo):
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--    WHERE tablename IN ('orders','order_items','ananya_chat_sessions',
--                        'ananya_chat_messages','order_status_history',
--                        'payment_verifications','category_images','products')
--    ORDER BY tablename, policyname;
-- ============================================================================
