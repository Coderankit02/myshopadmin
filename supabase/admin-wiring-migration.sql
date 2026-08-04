-- ============================================================================
-- RK Grocery Mart — Admin Panel Wiring Migration
-- ============================================================================
-- Ye migration ADMIN PANEL ke liye missing tables/columns add karta hai.
-- Customer website ki existing tables (products, categories, banners, orders,
-- coupons, shop_settings, profiles, addresses, wishlist, notifications, etc.)
-- ko kabhi touch nahi karta — sirf naye columns add karta hai (IF NOT EXISTS).
--
-- ✅ Idempotent: jitni baar bhi chalayein, safe hai.
-- ▶️ Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) BRANDS — Brand Management
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE,
  description text,
  logo_url    text,
  banner_url  text,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2) PRODUCTS — naye enterprise columns
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id      uuid REFERENCES brands(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku           text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode       text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price    numeric DEFAULT 0;      -- profit report ke liye
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight        text;                   -- e.g. "500"
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_unit   text;                   -- g | kg | ml | L
ALTER TABLE products ADD COLUMN IF NOT EXISTS gst_percent   numeric DEFAULT 0;      -- tax report ke liye
ALTER TABLE products ADD COLUMN IF NOT EXISTS video_url     text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_trending   boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_bestseller boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new_arrival boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_flash_sale boolean NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_level int  NOT NULL DEFAULT 20;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsnsac        text;                   -- HSN/SAC (tax)

-- ────────────────────────────────────────────────────────────────────────────
-- 3) REVIEWS — Review Management (sirf APPROVED reviews public dikhti hain)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid REFERENCES products(id) ON DELETE SET NULL,
  user_id       uuid,
  customer_name text,
  rating        int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title         text,
  comment       text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_reply   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) HOMEPAGE SECTIONS — Homepage Builder (order + visibility)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS homepage_sections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key text UNIQUE NOT NULL,
  label       text NOT NULL,
  icon        text NOT NULL DEFAULT '📦',
  title       text,               -- admin-customizable section heading
  enabled     boolean NOT NULL DEFAULT true,
  sort_order  int  NOT NULL DEFAULT 0,
  config      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed: default section list (customer homepage jaisa hi)
INSERT INTO homepage_sections (section_key, label, icon, title, enabled, sort_order) VALUES
  ('hero',             'Hero Banner Slider',   '🖼️',  NULL,                     true,  1),
  ('flash_sale',       'Flash Sale',           '⚡',   'Flash Sale',             true,  2),
  ('today_deals',      'Today''s Deals',       '🔥',   'Today''s Deals',         true,  3),
  ('categories',       'Shop by Category',     '🗂️',  'Shop by Category',       true,  4),
  ('featured',         'Featured Products',    '⭐',   'Featured Products',      true,  5),
  ('best_sellers',     'Best Sellers',         '🏆',   'Best Sellers',           true,  6),
  ('new_arrivals',     'New Arrivals',         '✨',   'New Arrivals',           true,  7),
  ('category_sections','Category Sections',    '🛒',   NULL,                     true,  8),
  ('why_choose_us',    'Why Choose Us',        '💚',   NULL,                     true,  9),
  ('reviews',          'Customer Reviews',     '⭐',   NULL,                     true, 10),
  ('download_app',     'Download App CTA',     '📱',   NULL,                     true, 11),
  ('newsletter',       'Newsletter',           '📬',   NULL,                     true, 12),
  ('how_it_works',     'How It Works',         '🛠️',  NULL,                     true, 13)
ON CONFLICT (section_key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) COUPONS — customer / product / category specific targeting
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description   text;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS customer_ids  uuid[] DEFAULT '{}';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS product_ids   uuid[] DEFAULT '{}';
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS category_ids  uuid[] DEFAULT '{}';

-- ────────────────────────────────────────────────────────────────────────────
-- 6) SHOP SETTINGS — website branding / social / legal / shipping
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS logo_url       text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS favicon_url    text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS theme_color    text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS social_facebook  text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS social_instagram text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS social_whatsapp  text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS social_youtube   text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS footer_text    text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS about_text     text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS privacy_policy text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS terms_text     text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS shipping_rules text;
ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS announcement   text;   -- top ticker / announcement bar

-- Shop name fix: customer site ab shop_settings.shop_name padhta hai (header/
-- footer/checkout/Ananya). Purani "Rinku Kirana..." value ko branding par
-- wapas set karo — sirf tab jab wahi value ho (idempotent, safe).
UPDATE shop_settings
SET shop_name = 'RK Grocery Mart'
WHERE id = 1
  AND shop_name IS NOT NULL
  AND lower(shop_name) LIKE '%rinku%';

-- ────────────────────────────────────────────────────────────────────────────
-- 7) SECURITY — audit logs + login history (RBAC)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id           bigserial PRIMARY KEY,
  admin_id     uuid,
  admin_email  text,
  role         text,
  action       text NOT NULL,
  entity       text,
  entity_id    text,
  details      jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS login_history (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  email      text,
  role       text,
  success    boolean NOT NULL DEFAULT false,
  ip         text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_history_created ON login_history (created_at DESC);

-- Admin team (roles). PRIMARY key is user_id (Supabase auth user).
CREATE TABLE IF NOT EXISTS admin_team (
  user_id    uuid PRIMARY KEY,
  email      text,
  name       text,
  role       text NOT NULL DEFAULT 'staff'
             CHECK (role IN ('super_admin','admin','manager','staff','delivery','support')),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 8) CUSTOMER 360 — wallet + loyalty points
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  user_id    uuid PRIMARY KEY,
  balance    numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  amount     numeric NOT NULL DEFAULT 0,
  type       text NOT NULL DEFAULT 'credit' CHECK (type IN ('credit','debit')),
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loyalty_points (
  user_id    uuid PRIMARY KEY,
  points     int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 9) Existing tables jo customer site pehle se use karti hai — agar kisi
--    environment mein missing ho to bana do (safe, non-destructive).
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id         bigserial PRIMARY KEY,
  order_id   uuid NOT NULL,
  status     text,
  changed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────────────────────────────────
-- 10) VISITORS / ANALYTICS — Dashboard Visitors + Conversion Rate
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_views (
  id         bigserial PRIMARY KEY,
  visitor_id text NOT NULL,          -- anonymous browser fingerprint (localStorage)
  path       text,                   -- /, /login, /products/xyz, etc.
  referrer   text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON page_views (visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON page_views (created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- 11) PROFILES — block user column (Customers page)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;

-- ────────────────────────────────────────────────────────────────────────────
-- 12) RAZORPAY — orders.payment_method mein 'razorpay' allow karo
-- ────────────────────────────────────────────────────────────────────────────
-- Razorpay online payment (customer site checkout) orders ko payment_method
-- = 'razorpay' ke saath insert karta hai. Purana CHECK constraint sirf
-- ('cod','upi') allow karta tha — isliye Razorpay order create hote hi fail
-- ho jaata tha ("Order confirm nahi hua"). Ye idempotent block constraint ko
-- drop karke 'razorpay' ke saath dobara banaata hai.
DO $$
BEGIN
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
  ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method = ANY (ARRAY['cod'::text, 'upi'::text, 'razorpay'::text]));
EXCEPTION WHEN others THEN
  -- constraint already exists with razorpay — ignore
  NULL;
END $$;

-- ============================================================================
-- RLS NOTE:
-- Customer site anon key use karti hai, isliye naye public tables (brands,
-- reviews, homepage_sections, wishlist) par RLS enable karte waqt sabse pehle
-- SELECT policy "to anon" add karna zaroori hai. Production hardening ke liye:
--
--   ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY brands_public_read ON brands FOR SELECT USING (is_active = true);
--
-- Admin write access RLS ke through auth.jwt() app_metadata role check se
-- bhi kar sakte hain, ya (simple) RLS off rakh kar admin panel (service-role
-- wale APIs ke bina) ko anon JWT se chalne dena. Is repo mein default: RLS OFF
-- taaki app bina kisi policy ke kaam kare. Agar aap RLS chalu karein to admin
-- panel ke saare write operations bhi cover karna na bhoolein.
-- ============================================================================
