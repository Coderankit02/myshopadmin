import { createContext, useContext, useEffect, useState } from 'react';
import {
  getUser, isValidAdmin, login as loginApi, logout as logoutApi, onLogout,
  uploadAvatar, updateDisplayName, getRole,
} from '../lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getUser().then((u) => {
      if (!mounted) return;
      setUser(isValidAdmin(u) ? u : null);
      setLoading(false);
    });

    const unsubscribe = onLogout(() => setUser(null));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  async function login(email, password) {
    const result = await loginApi(email, password);
    if (result.user) setUser(result.user);
    return result;
  }

  async function logout() {
    await logoutApi();
    setUser(null);
  }

  // Role ko fresh re-derive karo (getRole) — stale-role bug: updateUser ke
  // response me role claim nahi hota, isliye pehle purana role blind copy hota
  // tha (admin demote hone par UI me purana access dikhta rehta tha). Ab role
  // result.user se nikaalo, na mile to hi purana rakho.
  const mergeUser = (resultUser, prev) =>
    prev ? { ...resultUser, role: getRole(resultUser) || prev.role } : resultUser;

  // Feature: profile picture — upload + reflect immediately in context
  async function updateAvatar(file) {
    if (!user) return { error: 'Not logged in' };
    const result = await uploadAvatar(user.id, file);
    if (result.user) setUser((prev) => mergeUser(result.user, prev));
    return result;
  }

  async function updateName(name) {
    const result = await updateDisplayName(name);
    if (result.user) setUser((prev) => mergeUser(result.user, prev));
    return result;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateAvatar, updateName }}>
      {children}
    </AuthContext.Provider>
  );
}

// context + hook ek saath export karna is file ka intentional pattern hai
// (provider file me hook rakhna standard hai) — fast-refresh rule ke liye disable.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
