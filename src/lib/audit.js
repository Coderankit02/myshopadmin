import { db } from './supabase';

/**
 * audit.js — Security: Audit Logs + Login History
 *
 * `audit()` har important admin action ko `audit_logs` table mein likhta hai
 * (best-effort — agar table abhi setup nahi hai to silently skip).
 * `logLogin()` har login attempt (success/fail) ko `login_history` mein likhta hai.
 */

/** Log an admin action. entity/entityId = kis cheez par action hua (e.g. 'product', '<uuid>'). */
export async function audit(action, entity, entityId, details = {}) {
  try {
    const { data } = await db.auth.getUser();
    const user = data?.user;
    await db.from('audit_logs').insert({
      admin_id: user?.id || null,
      admin_email: user?.email || null,
      role: user?.app_metadata?.role || null,
      action,
      entity,
      entity_id: entityId != null ? String(entityId) : null,
      details: details || {},
    });
  } catch (_) {
    /* audit is best-effort — table missing ho to app crash mat karo */
  }
}

/** Log a login attempt (success/fail) to login_history. */
export async function logLogin({ user, success, role }) {
  try {
    await db.from('login_history').insert({
      user_id: user?.id || null,
      email: user?.email || null,
      role: role || user?.app_metadata?.role || null,
      success: !!success,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch (_) {
    /* best-effort */
  }
}
