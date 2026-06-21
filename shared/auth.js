/**
 * shared/auth.js
 * Role-based authentication helpers, shared by every page.
 * Depends on: shared/supabase.js (must load first, defines window.db)
 *
 * Public API (window.Auth):
 *   Auth.requireAdmin()        -> Promise<user>  Redirects to login if not a valid admin.
 *                                  Call this at the top of every protected page.
 *   Auth.login(email, pass)    -> Promise<{user}|{error}> Same 3-check pattern as before:
 *                                  1) Supabase password check
 *                                  2) app_metadata.role === 'admin'
 *                                  3) app_metadata.is_active === true
 *   Auth.logout()              -> Promise<void>  Signs out and redirects to login.
 *   Auth.getUser()             -> Promise<user|null>  Current session user, or null.
 *   Auth.onLogout(callback)    -> subscribes to SIGNED_OUT events.
 */
(function () {
  function isValidAdmin(user) {
    return !!(
      user &&
      user.app_metadata &&
      user.app_metadata.role === 'admin' &&
      user.app_metadata.is_active
    );
  }

  async function getUser() {
    const { data: { session } } = await window.db.auth.getSession();
    return session && session.user ? session.user : null;
  }

  /**
   * Call at the top of every protected feature page (dashboard, orders, etc).
   * Resolves with the user object if authenticated + admin + active.
   * Otherwise redirects to the login page and never resolves (navigation interrupts execution).
   */
  async function requireAdmin() {
    const user = await getUser();
    if (!isValidAdmin(user)) {
      window.location.href = computeLoginRedirect();
      // Return a never-resolving promise so callers' `await` doesn't continue
      // running page logic during the redirect.
      return new Promise(() => {});
    }
    return user;
  }

  function computeLoginRedirect() {
    // Pages live at /admin/<feature>/<feature>.html — home/login page lives at /admin/index.html
    // Using a relative path keeps this working whether admin/ is served from root or a subpath.
    return '../index.html';
  }

  async function login(email, password) {
    if (!email || !password) {
      return { error: 'Email aur password dono zaroori hai' };
    }
    const { data, error: authErr } = await window.db.auth.signInWithPassword({ email, password });
    if (authErr) {
      return { error: '❌ Email ya password galat hai' };
    }
    if (data.user.app_metadata?.role !== 'admin') {
      await window.db.auth.signOut();
      return { error: '⛔ Ye account admin nahi hai' };
    }
    if (!data.user.app_metadata?.is_active) {
      await window.db.auth.signOut();
      return { error: '⛔ Ye admin account deactivate hai' };
    }
    return { user: data.user };
  }

  async function logout() {
    await window.db.auth.signOut();
    window.location.href = computeLoginRedirect();
  }

  function onLogout(callback) {
    const { data: listener } = window.db.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') callback();
    });
    return () => listener?.subscription?.unsubscribe();
  }

  window.Auth = { requireAdmin, login, logout, getUser, onLogout, isValidAdmin };
})();
