/**
 * shared/sidebar.js
 * Renders the left navigation sidebar into a container, and wires up
 * collapse + mobile-open behavior. Highlights the current page from
 * a data attribute on <body data-page="orders">.
 *
 * Usage (in each feature .html, near top of <body>):
 *   <div id="sidebar-mount"></div>
 *   <script src="../shared/sidebar.js"></script>
 *   <script>Sidebar.mount(document.getElementById('sidebar-mount'));</script>
 */
(function () {
  const NAV = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', href: '../dashboard/dashboard.html' },
    { id: 'orders', icon: '🧾', label: 'Orders', href: '../orders/orders.html' },
    { id: 'products', icon: '🛒', label: 'Products', href: '../products/products.html' },
    { id: 'categories', icon: '🗂️', label: 'Categories', href: '../categories/categories.html' },
    { id: 'customers', icon: '👥', label: 'Customers', href: '../customers/customers.html' },
    { id: 'inventory', icon: '📦', label: 'Inventory', href: '../inventory/inventory.html' },
    { id: 'payments', icon: '💳', label: 'Payments', href: '../payments/payments.html' },
    { id: 'delivery', icon: '🚴', label: 'Delivery', href: '../delivery/delivery.html' },
    { id: 'support', icon: '🎧', label: 'Support', href: '../support/support.html' },
    { id: 'ai', icon: '🤖', label: 'Ananya AI', href: '../ai/ai.html' },
    { id: 'analytics', icon: '📈', label: 'Analytics', href: '../analytics/analytics.html' },
    { id: 'settings', icon: '⚙️', label: 'Settings', href: '../settings/settings.html' },
  ];

  function currentPage() {
    return document.body.getAttribute('data-page') || '';
  }

  function render() {
    const active = currentPage();
    const items = NAV.map(
      (n) => `
      <a class="sb-item ${n.id === active ? 'on' : ''}" href="${n.href}" data-nav-id="${n.id}">
        <span class="sb-icon">${n.icon}</span>
        <span class="sb-label">${n.label}</span>
      </a>`
    ).join('');

    return `
      <div class="sidebar" id="app-sidebar">
        <a class="sb-logo" href="../dashboard/dashboard.html">🏪 <span class="sb-logo-text">rinku<span>.admin</span></span></a>
        <div class="sb-nav">${items}</div>
        <div class="sb-toggle" id="sb-collapse-toggle">« Collapse</div>
      </div>
      <div class="overlay" id="sidebar-overlay" style="display:none;"></div>
    `;
  }

  function mount(container) {
    if (!container) return;
    container.outerHTML = render();

    const sidebarEl = document.getElementById('app-sidebar');
    const overlayEl = document.getElementById('sidebar-overlay');
    const collapseToggle = document.getElementById('sb-collapse-toggle');
    const hamburger = document.getElementById('hamburger');

    // Restore collapsed state (desktop only, matches previous in-memory behavior
    // but persisted so navigating between real pages doesn't reset it)
    let collapsed = false;
    try {
      collapsed = localStorage.getItem('rk_admin_sidebar_collapsed') === '1';
    } catch (e) {}
    if (collapsed) sidebarEl.classList.add('collapsed');
    collapseToggle.textContent = collapsed ? '»' : '« Collapse';

    collapseToggle.addEventListener('click', () => {
      collapsed = !collapsed;
      sidebarEl.classList.toggle('collapsed', collapsed);
      collapseToggle.textContent = collapsed ? '»' : '« Collapse';
      try {
        localStorage.setItem('rk_admin_sidebar_collapsed', collapsed ? '1' : '0');
      } catch (e) {}
    });

    function setMobileOpen(open) {
      sidebarEl.classList.toggle('mobile-open', open);
      overlayEl.style.display = open ? 'block' : 'none';
    }

    if (hamburger) {
      hamburger.addEventListener('click', () => setMobileOpen(!sidebarEl.classList.contains('mobile-open')));
    }
    overlayEl.addEventListener('click', () => setMobileOpen(false));

    // Close mobile menu after navigating
    sidebarEl.querySelectorAll('.sb-item').forEach((el) => {
      el.addEventListener('click', () => setMobileOpen(false));
    });
  }

  window.Sidebar = { mount, NAV };
})();
