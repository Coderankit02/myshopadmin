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

// Feature: Admin profile picture — uploads to the `avatars` storage bucket and
// stores the public URL on the user's own metadata (auth.updateUser), so it's
// available everywhere via useAuth().user.user_metadata.avatar_url.
// NOTE: requires a public Supabase Storage bucket named "avatars" (Storage →
// New bucket → name "avatars" → Public bucket: ON). One-time setup, like the
// other optional tables in this project.
export async function uploadAvatar(userId, file) {
  if (!file) return { error: 'Koi file select nahi ki' };
  const ext = file.name.split('.').pop();
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await db.storage.from('avatars').upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });
  if (uploadErr) {
    return { error: `Upload nahi hua: ${uploadErr.message} (Supabase Storage mein "avatars" bucket bana hai ya nahi check karein)` };
  }

  const { data: pub } = db.storage.from('avatars').getPublicUrl(path);
  const avatar_url = pub?.publicUrl;
  if (!avatar_url) return { error: 'Public URL nahi mila' };

  const { data, error } = await db.auth.updateUser({ data: { avatar_url } });
  if (error) return { error: error.message };
  return { user: data.user, avatar_url };
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
