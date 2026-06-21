import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { applyTheme, getStoredTheme } from '../lib/utils';
import PWAInstallButton from './PWAInstallButton';

export default function Navbar({ title, notifCount = 0, onSearch, onHamburger }) {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="topbar">
      <button
        type="button"
        className="icon-btn"
        id="hamburger"
        onClick={onHamburger}
        aria-label="Toggle navigation menu"
        aria-controls="app-sidebar"
      >
        ☰
      </button>
      <div className="tb-title">{title}</div>
      <div className="tb-search" role="search">
        <span aria-hidden="true">🔍</span>
        <label htmlFor="topbar-search" className="sr-only">Search orders, products, customers</label>
        <input
          id="topbar-search"
          type="search"
          placeholder="Search orders, products, customers..."
          onChange={(e) => onSearch && onSearch(e.target.value)}
        />
      </div>
      <div className="tb-right">
        <PWAInstallButton />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button type="button" className="icon-btn" aria-label={`Notifications${notifCount > 0 ? ` (${notifCount} unread)` : ''}`}>
          🔔
          <span className="dot" style={{ display: notifCount > 0 ? 'block' : 'none' }} aria-hidden="true" />
        </button>
       <button type="button" className="admin-pill" title={user?.email || ''} onClick={logout}>
  <span className="admin-pill-full">👤 Admin · 🚪 Logout</span>
  <span className="admin-pill-short">🚪 Logout</span>
</button>
      </div>
    </div>
  );
}
