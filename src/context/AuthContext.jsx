import { createContext, useContext, useEffect, useState } from 'react';
import {
  getUser, isValidAdmin, login as loginApi, logout as logoutApi, onLogout,
  uploadAvatar, updateDisplayName,
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

  // Feature: profile picture — upload + reflect immediately in context (Navbar avatar etc.)
  async function updateAvatar(file) {
    if (!user) return { error: 'Not logged in' };
    const result = await uploadAvatar(user.id, file);
    if (result.user) setUser(result.user);
    return result;
  }

  async function updateName(name) {
    const result = await updateDisplayName(name);
    if (result.user) setUser(result.user);
    return result;
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateAvatar, updateName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
