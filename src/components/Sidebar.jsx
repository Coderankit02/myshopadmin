import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Har nav item ke liye allowed roles. `null` = sabhi roles.
const NAV = [
  { id: 'dashboard',   icon: '📊', label: 'Dashboard',        href: '/dashboard',   roles: null },
  { id: 'orders',      icon: '🧾', label: 'Orders',           href: '/orders',      roles: null },
  { id: 'products',    icon: '🛒', label: 'Products',         href: '/products',    roles: null },
  { id: 'categories',  icon: '🗂️', label: 'Categories',       href: '/categories',  roles: null },
  { id: 'brands',      icon: '🏷️', label: 'Brands',           href: '/brands',      roles: ['super_admin', 'admin', 'manager', 'staff'] },
  { id: 'coupons',     icon: '🎟️', label: 'Coupons',          href: '/coupons',     roles: ['super_admin', 'admin', 'manager', 'staff'] },
  { id: 'homepage',    icon: '🏠', label: 'Homepage Builder', href: '/homepage',    roles: ['super_admin', 'admin', 'manager'] },
  { id: 'banners',     icon: '🖼️', label: 'Banners',          href: '/banners',     roles: ['super_admin', 'admin', 'manager', 'staff'] },
  { id: 'reviews',     icon: '⭐', label: 'Reviews',          href: '/reviews',     roles: null },
  { id: 'customers',   icon: '👥', label: 'Customers',        href: '/customers',   roles: null },
  { id: 'inventory',   icon: '📦', label: 'Inventory',        href: '/inventory',   roles: ['super_admin', 'admin', 'manager', 'staff'] },
  { id: 'payments',    icon: '💳', label: 'Payments',         href: '/payments',    roles: ['super_admin', 'admin', 'manager', 'staff'] },
  { id: 'delivery',    icon: '🚴', label: 'Delivery',         href: '/delivery',    roles: null },
  { id: 'support',     icon: '🎧', label: 'Support',          href: '/support',     roles: null },
  { id: 'ai',          icon: '🤖', label: 'Ananya AI',        href: '/ai',          roles: ['super_admin', 'admin', 'manager'] },
  { id: 'analytics',   icon: '📈', label: 'Reports',          href: '/analytics',   roles: ['super_admin', 'admin', 'manager', 'staff'] },
  { id: 'team',        icon: '🧑‍💼', label: 'Team & Roles',     href: '/team',        roles: ['super_admin', 'admin', 'manager'] },
  { id: 'security',    icon: '🔐', label: 'Security',         href: '/security',    roles: ['super_admin', 'admin', 'manager'] },
  { id: 'settings',    icon: '⚙️', label: 'Settings',         href: '/settings',    roles: null },
];

export default function Sidebar({ mobileOpen, onCloseMobile }) {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('rk_admin_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const role = user?.role || user?.app_metadata?.role || 'staff';
  const visibleNav = NAV.filter((n) => !n.roles || n.roles.includes(role));

  useEffect(() => {
    try {
      localStorage.setItem('rk_admin_sidebar_collapsed', collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') onCloseMobile();
    }
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen, onCloseMobile]);

  return (
    <>
      <nav
        className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}
        id="app-sidebar"
        aria-label="Main navigation"
      >
        <NavLink className="sb-logo" to="/dashboard">
          🏪 <span className="sb-logo-text">RK<span>.admin</span></span>
        </NavLink>
        <div className="sb-nav">
          {visibleNav.map((n) => (
            <NavLink
              key={n.id}
              to={n.href}
              className={({ isActive }) => `sb-item${isActive ? ' on' : ''}`}
              onClick={onCloseMobile}
              title={n.label}
            >
              <span className="sb-icon" aria-hidden="true">{n.icon}</span>
              <span className="sb-label">{n.label}</span>
            </NavLink>
          ))}
        </div>
        <button
          type="button"
          className="sb-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '« Collapse'}
        </button>
      </nav>
      <div
        className="overlay"
        style={{ display: mobileOpen ? 'block' : 'none' }}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
    </>
  );
}
