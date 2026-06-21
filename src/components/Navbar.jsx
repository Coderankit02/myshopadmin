import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { applyTheme, getStoredTheme } from '../lib/utils';

export default function Navbar({ title, notifCount = 0, onSearch, onHamburger }) {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(getStoredTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <div className="topbar">
      <button className="icon-btn" id="hamburger" onClick={onHamburger}>
        ☰
      </button>
      <div className="tb-title">{title}</div>
      <div className="tb-search">
        <span>🔍</span>
        <input
          placeholder="Search orders, products, customers..."
          onChange={(e) => onSearch && onSearch(e.target.value)}
        />
      </div>
      <div className="tb-right">
        <button className="icon-btn" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <button className="icon-btn">
          🔔
          <span className="dot" style={{ display: notifCount > 0 ? 'block' : 'none' }} />
        </button>
        <div className="admin-pill" title={user?.email || ''} onClick={logout}>
          👤 Admin · 🚪 Logout
        </div>
      </div>
    </div>
  );
}
