-- ============================================================================
-- REWARDS REDEEM — 100 points = ₹10 discount (website + app checkout)
-- Rinku Kirana & General Store
-- ✅ STATUS: PRODUCTION PAR APPLY HO CHUKA (2026-08-10) — live verified
--   (supabase db push se: 20260810120000 + 130000 + 140000 migrations)
--
-- Rules:
--   • Points EARNED = delivered orders × 10 (same as site/app Rewards page)
--   • Redeemable balance = earned − already-redeemed (reward_redemptions ledger)
--   • 100 points = ₹10 discount (integer division: floor(points / 10))
--   • Order creation (create_order RPC) server-side validate karta hai — client
--     kabhi bhi apne points se zyada redeem nahi kar sakta.
--   • Over-burn guard: order jitna discount absorb kar sakta hai (subtotal −
--     coupon) utne hi points ledger mein burn hote hain.
--
-- ✅ Idempotent.
-- ============================================================================

-- ── 1) orders — rewards columns ─────────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rewards_points    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rewards_discount  integer NOT NULL DEFAULT 0;

-- ── 2) reward_redemptions — redemption ledger ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  points     integer NOT NULL CHECK (points > 0),
  amount     integer NOT NULL DEFAULT 0 CHECK (amount >= 0),
  order_id   uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_user
  ON public.reward_redemptions(user_id);

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reward_redemptions_own_select" ON public.reward_redemptions;
CREATE POLICY "reward_redemptions_own_select" ON public.reward_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "reward_redemptions_admin_all" ON public.reward_redemptions;
CREATE POLICY "reward_redemptions_admin_all" ON public.reward_redemptions
  FOR ALL TO authenticated
  USING (public.is_admin_write())
  WITH CHECK (public.is_admin_write());

-- ── 3) get_redeemable_points() — server-side balance (client tamper-proof) ──
--    Privacy: sirf logged-in user apna balance, ya admin. Anon/service-role = 0.
CREATE OR REPLACE FUNCTION public.get_redeemable_points(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_user_id IS NULL OR auth.uid() IS NULL THEN
    RETURN 0; -- anon / service-role blocked
  END IF;
  IF p_user_id <> auth.uid() AND NOT public.is_admin_write() THEN
    RETURN 0; -- doosre user ka balance nahi dikhega
  END IF;
  RETURN GREATEST(0,
    (SELECT COALESCE(count(*), 0) * 10
       FROM public.orders
      WHERE user_id = p_user_id AND status = 'delivered')
    -
    (SELECT COALESCE(sum(points), 0)
       FROM public.reward_redemptions
      WHERE user_id = p_user_id)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_redeemable_points(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_redeemable_points(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_redeemable_points(uuid) TO authenticated;

-- ============================================================================
-- 4) create_order() — rewards redeem support (naya p_rewards_points param)
--    Purana 13-arg signature DROP karte hain taaki PostgREST overload se
--    ambiguous na ho. Sab logic unchanged + rewards block.
-- ============================================================================
DROP FUNCTION IF EXISTS public.create_order(uuid, jsonb, jsonb, text, text, double precision, double precision, numeric, integer, text, text, text, integer);

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
  p_location_accuracy integer DEFAULT NULL,
  p_rewards_points integer DEFAULT 0
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
  v_rewards_discount int := 0;
  v_coupon        record;
  v_line          numeric;
  v_cat_name      text;
  v_final         numeric;
  v_pids          uuid[];
  v_cats          uuid[];
  v_ok            boolean;
  v_is_blocked    boolean;
  v_delivery_charge int := 0;
  v_earned        int := 0;
  v_redeemed      int := 0;
  v_usable        int := 0;
BEGIN
  IF p_delivery_charge IS NOT NULL AND p_delivery_charge >= 0 AND p_delivery_charge <= 500 THEN
    v_delivery_charge := p_delivery_charge;
  ELSE
    v_delivery_charge := 0;
  END IF;
  IF p_user_id IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'create_order: user mismatch';
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT is_blocked INTO v_is_blocked FROM public.profiles WHERE id = v_uid;
    IF v_is_blocked THEN
      RAISE EXCEPTION 'create_order: user blocked';
    END IF;
  END IF;

  IF jsonb_array_length(p_cart) = 0 THEN
    RAISE EXCEPTION 'create_order: empty cart';
  END IF;

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
    IF COALESCE(v_prod.stock_quantity, 0) < (v_item->>'qty')::int THEN
      RAISE EXCEPTION 'create_order: insufficient stock for %', v_prod.name;
    END IF;
    v_subtotal := v_subtotal + v_prod.selling_price * (v_item->>'qty')::int;
  END LOOP;

  -- coupon — server-side full validation
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

    IF array_length(COALESCE(v_coupon.customer_ids,'{}'),1) > 0
       AND (v_uid IS NULL OR NOT (v_uid = ANY(v_coupon.customer_ids))) THEN
      RAISE EXCEPTION 'create_order: coupon not for this user';
    END IF;

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

  -- ── REWARDS REDEEM: 100 points = ₹10 (server-side validate + ledger) ──
  IF p_rewards_points IS NOT NULL AND p_rewards_points > 0 THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'create_order: rewards login required';
    END IF;

    SELECT COALESCE(count(*), 0) * 10 INTO v_earned
      FROM public.orders
     WHERE user_id = v_uid AND status = 'delivered';

    SELECT COALESCE(sum(points), 0) INTO v_redeemed
      FROM public.reward_redemptions
     WHERE user_id = v_uid;

    IF p_rewards_points > (v_earned - v_redeemed) THEN
      RAISE EXCEPTION 'create_order: insufficient reward points';
    END IF;

    -- Usable points: requested se zyada nahi, aur order jitna absorb kar sakta
    -- hai utne hi ((subtotal - coupon) tak). Ledger wahi record hota hai jo
    -- asli discount diya — over-burn impossible.
    v_usable := LEAST(p_rewards_points, GREATEST(0, (v_subtotal - v_discount)) * 10);
    v_rewards_discount := v_usable / 10; -- integer div: 100 → ₹10
    v_discount := v_discount + v_rewards_discount;
    v_discount := LEAST(v_discount, v_subtotal);
  END IF;

  v_final := GREATEST(0, v_subtotal - v_discount + v_delivery_charge);

  v_order_number := 'RK-' || to_char(now(),'YYYY') || '-' ||
                    floor(100000 + random()*900000)::int::text;

  INSERT INTO public.orders (
    user_id, order_number, status, payment_method, payment_status,
    subtotal, discount, promo_code, final_amount,
    rewards_points, rewards_discount,
    delivery_name, delivery_phone, delivery_line1, delivery_line2,
    delivery_city, delivery_pincode,
    latitude, longitude, distance_km, delivery_charge, delivery_status,
    maps_link, maps_nav_link, location_accuracy,
    created_at, updated_at
  ) VALUES (
    v_uid, v_order_number, 'pending', p_payment_method, 'pending',
    v_subtotal::int, v_discount::int, upper(btrim(COALESCE(p_promo_code,''))), v_final::int,
    v_usable, v_rewards_discount,
    p_address->>'name', p_address->>'phone', p_address->>'line1',
    COALESCE(p_address->>'line2',''), COALESCE(p_address->>'city','Jaunpur'),
    COALESCE(p_address->>'pincode',''),
    p_latitude, p_longitude, p_distance_km, v_delivery_charge,
    COALESCE(p_delivery_status,'unknown'),
    p_maps_link, p_maps_nav_link, p_location_accuracy,
    now(), now()
  ) RETURNING id INTO v_order_id;

  -- rewards ledger — redemption SIRF successful order ke saath record hota hai
  IF v_usable > 0 THEN
    INSERT INTO public.reward_redemptions (user_id, points, amount, order_id)
    VALUES (v_uid, v_usable, v_rewards_discount, v_order_id);
  END IF;

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

    UPDATE public.products
       SET stock_quantity = GREATEST(0, COALESCE(stock_quantity,0) - (v_item->>'qty')::int),
           updated_at     = now()
     WHERE id = v_prod.id;
  END LOOP;

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
    'final_amount', v_final,
    'rewards_points', v_usable,
    'rewards_discount', v_rewards_discount
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order(uuid, jsonb, jsonb, text, text, double precision, double precision, numeric, integer, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, jsonb, jsonb, text, text, double precision, double precision, numeric, integer, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(uuid, jsonb, jsonb, text, text, double precision, double precision, numeric, integer, text, text, text, integer, integer) TO anon;
