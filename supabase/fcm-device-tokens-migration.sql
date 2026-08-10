-- ============================================================================
-- FCM / EXPO PUSH — device_tokens
-- Rinku Kirana & General Store
-- ✅ STATUS: PRODUCTION PAR APPLY HO CHUKA (2026-08-10) — live verified
--   (supabase db push se: 20260810150000_fcm_device_tokens.sql)
--
-- Android app (expo-notifications) device tokens store karta hai taaki
-- server-side (admin / cron) Expo Push API se notifications bhej sake.
--   • Token = Expo push token (ExponentPushToken[...]) — Android par FCM
--     ke upar chalta hai; standalone build ke liye google-services.json
--     + FCM V1 key chahiye (app.json → expo-notifications plugin).
--   • User apna token insert/update/delete kar sakta hai (RLS).
--   • Admin (is_admin_write) sab read karke push bhej sakta hai.
-- ✅ Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL UNIQUE,             -- same device par naya login = reassign
  platform   text NOT NULL DEFAULT 'android',  -- android | ios | web
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON public.device_tokens(user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- ── User apna token manage kar sakta hai ─────────────────────────────
DROP POLICY IF EXISTS "device_tokens_own_select" ON public.device_tokens;
CREATE POLICY "device_tokens_own_select" ON public.device_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "device_tokens_own_insert" ON public.device_tokens;
CREATE POLICY "device_tokens_own_insert" ON public.device_tokens
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "device_tokens_own_update" ON public.device_tokens;
CREATE POLICY "device_tokens_own_update" ON public.device_tokens
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "device_tokens_own_delete" ON public.device_tokens;
CREATE POLICY "device_tokens_own_delete" ON public.device_tokens
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── Admin (dashboard / server-side push send) ────────────────────────
DROP POLICY IF EXISTS "device_tokens_admin_all" ON public.device_tokens;
CREATE POLICY "device_tokens_admin_all" ON public.device_tokens
  FOR ALL TO authenticated
  USING (public.is_admin_write())
  WITH CHECK (public.is_admin_write());

-- ── upsert_device_token() — SECURITY DEFINER ─────────────────────────
-- App (usePush.ts) ise call karta hai. INSERT ... ON CONFLICT DO UPDATE
-- par Postgres UPDATE RLS policy bhi check karta hai — same device par
-- doosra user login kare (same Expo token) to direct upsert RLS violation
-- deta. SECURITY DEFINER ise bypass karta hai, aur user_id hamesha
-- auth.uid() hota hai — token kisi aur ko assign karna impossible.
CREATE OR REPLACE FUNCTION public.upsert_device_token(
  p_token text,
  p_platform text DEFAULT 'android'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'upsert_device_token: login required';
  END IF;
  INSERT INTO public.device_tokens (user_id, token, platform, updated_at)
  VALUES (auth.uid(), p_token, COALESCE(NULLIF(btrim(p_platform), ''), 'android'), now())
  ON CONFLICT (token)
  DO UPDATE SET
    user_id    = auth.uid(),
    platform   = EXCLUDED.platform,
    updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_device_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_device_token(text, text) TO authenticated;
