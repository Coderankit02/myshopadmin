import { db } from './supabase';

export function isValidAdmin(user) {
  return !!(
    user &&
    user.app_metadata &&
    user.app_metadata.role === 'admin' &&
    user.app_metadata.is_active
  );
}

export async function getUser() {
  const {
    data: { session },
  } = await db.auth.getSession();
  return session && session.user ? session.user : null;
}

export async function login(email, password) {
  if (!email || !password) {
    return { error: 'Email aur password dono zaroori hai' };
  }
  const { data, error: authErr } = await db.auth.signInWithPassword({ email, password });
  if (authErr) {
    return { error: '❌ Email ya password galat hai' };
  }
  if (data.user.app_metadata?.role !== 'admin') {
    await db.auth.signOut();
    return { error: '⛔ Ye account admin nahi hai' };
  }
  if (!data.user.app_metadata?.is_active) {
    await db.auth.signOut();
    return { error: '⛔ Ye admin account deactivate hai' };
  }
  return { user: data.user };
}

export async function logout() {
  await db.auth.signOut();
}

export function onLogout(callback) {
  const {
    data: listener,
  } = db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') callback();
  });
  return () => listener?.subscription?.unsubscribe();
}
