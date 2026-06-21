import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard', href: '/dashboard' },
  { id: 'orders', icon: '🧾', label: 'Orders', href: '/orders' },
  { id: 'products', icon: '🛒', label: 'Products', href: '/products' },
  { id: 'categories', icon: '🗂️', label: 'Categories', href: '/categories' },
  { id: 'customers', icon: '👥', label: 'Customers', href: '/customers' },
  { id: 'inventory', icon: '📦', label: 'Inventory', href: '/inventory' },
  { id: 'payments', icon: '💳', label: 'Payments', href: '/payments' },
  { id: 'delivery', icon: '🚴', label: 'Delivery', href: '/delivery' },
  { id: 'support', icon: '🎧', label: 'Support', href: '/support' },
  { id: 'ai', icon: '🤖', label: 'Ananya AI', href: '/ai' },
  { id: 'analytics', icon: '📈', label: 'Analytics', href: '/analytics' },
  { id: 'settings', icon: '⚙️', label: 'Settings', href: '/settings' },
];

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('rk_admin_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('rk_admin_sidebar_collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  return (
    <>
      <div className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`} id="app-sidebar">
        <NavLink className="sb-logo" to="/dashboard">
          🏪 <span className="sb-logo-text">rinku<span>.admin</span></span>
        </NavLink>
        <div className="sb-nav">
          {NAV.map((n) => (
            <NavLink
              key={n.id}
              to={n.href}
              className={({ isActive }) => `sb-item${isActive ? ' on' : ''}`}
              onClick={onCloseMobile}
            >
              <span className="sb-icon">{n.icon}</span>
              <span className="sb-label">{n.label}</span>
            </NavLink>
          ))}
        </div>
        <div className="sb-toggle" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? '»' : '« Collapse'}
        </div>
      </div>
      <div className="overlay" style={{ display: mobileOpen ? 'block' : 'none' }} onClick={onCloseMobile} />
    </>
  );
}
