import { db } from './supabase';
import { uploadToCloudinary } from './cloudinary';
import { logLogin } from './audit';

// ── RBAC: Admin roles (Super Admin > Manager > Staff > Delivery / Support) ──
export const ROLES = ['super_admin', 'admin', 'manager', 'staff', 'delivery', 'support'];

// Legacy 'admin' treated as super_admin-equivalent (existing accounts keep working).
export const ROLE_RANK = {
  super_admin: 100,
  admin: 100,
  manager: 60,
  staff: 40,
  delivery: 20,
  support: 20,
};

export function getRole(user) {
  // `user.role` admin_team fallback se attached hota hai (login/getUser mein);
  // `app_metadata.role` purana system hai. Dono accept karo.
  const r = user?.role || user?.app_metadata?.role;
  return ROLES.includes(r) ? r : null;
}

export function roleLabel(role) {
  const map = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    manager: 'Manager',
    staff: 'Staff',
    delivery: 'Delivery Staff',
    support: 'Customer Support',
  };
  return map[role] || role || '—';
}

export function roleAtLeast(role, minRole) {
  return (ROLE_RANK[role] || 0) >= (ROLE_RANK[minRole] || 0);
}

/** Kyun: kuch users ka role sirf app_metadata mein hota hai (purana system),
 *  kuch ka sirf admin_team table mein (naya Team page). Dono ko check karo. */
export function isValidAdmin(user) {
  return !!(
    user &&
    user.app_metadata &&
    user.app_metadata.is_active &&
    getRole(user)
  );
}

export async function getUser() {
  const {
    data: { session },
  } = await db.auth.getSession();
  if (!session?.user) return null;

  const user = session.user;
  // Refresh ke baad bhi admin_team fallback role mile (naye Team page wale admins)
  let role = getRole(user);
  if (!role) {
    try {
      const { data: teamRow } = await db
        .from('admin_team')
        .select('role,is_active')
        .eq('user_id', user.id)
        .maybeSingle();
      if (teamRow && teamRow.is_active && ROLES.includes(teamRow.role)) role = teamRow.role;
    } catch (_) {
      /* table missing — fallback skip */
    }
  }
  return role ? { ...user, role } : null;
}

export async function login(email, password) {
  if (!email || !password) {
    return { error: 'Email aur password dono zaroori hai' };
  }
  const { data, error: authErr } = await db.auth.signInWithPassword({ email, password });

  if (authErr) {
    await logLogin({ user: null, success: false, email: email.trim() });
    return { error: '❌ Email ya password galat hai' };
  }

  const user = data.user;
  // Primary: app_metadata.role (purana system). Fallback: admin_team table row.
  let role = getRole(user);
  if (!role) {
    try {
      const { data: teamRow } = await db
        .from('admin_team')
        .select('role,is_active')
        .eq('user_id', user.id)
        .maybeSingle();
      if (teamRow && teamRow.is_active && ROLES.includes(teamRow.role)) role = teamRow.role;
    } catch (_) {
      /* table missing — fallback skip */
    }
  }

  const allowed = !!role && user.app_metadata?.is_active !== false;

  await logLogin({ user, success: allowed, role });

  if (!allowed) {
    await db.auth.signOut();
    return { error: '⛔ Ye account admin nahi hai' };
  }
  return { user: { ...user, role } };
}

export async function logout() {
  await logLogin({ user: await getUser(), success: false, role: null });
  await db.auth.signOut();
}

// Feature: Admin profile picture — Cloudinary par upload karta hai aur
// public URL ko user metadata mein save karta hai (auth.updateUser)
export async function uploadAvatar(userId, file) {
  if (!file) return { error: 'Koi file select nahi ki' };

  const { url, error: uploadErr } = await uploadToCloudinary(file, `myshop/avatars/${userId}`);
  if (uploadErr || !url) {
    return { error: `Upload nahi hua: ${uploadErr || 'Unknown error'}` };
  }

  const { data, error } = await db.auth.updateUser({ data: { avatar_url: url } });
  if (error) return { error: error.message };
  return { user: data.user, avatar_url: url };
}

export async function updateDisplayName(name) {
  const { data, error } = await db.auth.updateUser({ data: { full_name: name } });
  if (error) return { error: error.message };
  return { user: data.user };
}

export function onLogout(callback) {
  const {
    data: listener,
  } = db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback();
  });
  return () => listener?.subscription?.unsubscribe();
}
