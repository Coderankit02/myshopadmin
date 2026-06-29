import { db } from './supabase';
import { uploadToCloudinary } from './cloudinary';

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

// Feature: Admin profile picture — Cloudinary par upload karta hai aur
// public URL ko user metadata mein save karta hai (auth.updateUser)
// Har jagah useAuth().user.user_metadata.avatar_url se milti hai
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