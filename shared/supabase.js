/**
 * shared/supabase.js
 * Single Supabase client instance, reused by every page.
 * Loaded AFTER the supabase-js CDN script and BEFORE any feature script.
 *
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 * <script src="../shared/supabase.js"></script>
 */
(function () {
  const SUPABASE_URL = 'https://pffaflasgwhydkmxwkky.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable__tFDYhkM3blZ0pIVT0YxLA_YvkKq79L';

  // Reuse a single client across page navigations within the same tab
  // (window.rkAdmin persists only for the life of one page load, but this
  // guard avoids creating two clients if this script is ever included twice).
  if (!window.rkAdmin) {
    window.rkAdmin = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // Export under a clear, stable name for feature modules to consume.
  window.db = window.rkAdmin;
})();
