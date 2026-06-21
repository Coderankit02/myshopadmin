/**
 * shared/navbar.js
 * Renders the top bar: page title, search, theme toggle, notifications, admin/logout pill.
 * Depends on: shared/auth.js (logout), shared/utils.js (theme helpers)
 *
 * Usage:
 *   <div id="navbar-mount"></div>
 *   <script>Navbar.mount(document.getElementById('navbar-mount'), {
 *     title: 'Orders',
 *     userEmail: user.email,
 *     onSearch: (term) => { ... }   // optional
 *   });</script>
 */
(function () {
  function render(opts) {
    return `
      <div class="topbar">
        <button class="icon-btn" id="hamburger">☰</button>
        <div class="tb-title">${opts.title || ''}</div>
        <div class="tb-search">
          <span>🔍</span>
          <input id="tb-search-input" placeholder="Search orders, products, customers..."/>
        </div>
        <div class="tb-right">
          <button class="icon-btn" id="theme-toggle-btn">🌙</button>
          <button class="icon-btn" id="notif-btn">🔔<span class="dot" id="notif-dot" style="display:none;"></span></button>
          <div class="admin-pill" id="logout-pill" title="${Utils.escapeHTML(opts.userEmail || '')}">👤 Admin · 🚪 Logout</div>
        </div>
      </div>
    `;
  }

  function mount(container, opts) {
    opts = opts || {};
    if (!container) return;
    container.outerHTML = render(opts);

    // Theme: restore + toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    let theme = Utils.getStoredTheme();
    Utils.applyTheme(theme);
    themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeBtn.addEventListener('click', () => {
      theme = theme === 'dark' ? 'light' : 'dark';
      Utils.applyTheme(theme);
      themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    });

    // Notifications dot
    const notifDot = document.getElementById('notif-dot');
    if (opts.notifCount && opts.notifCount > 0) notifDot.style.display = 'block';

    // Search
    const searchInput = document.getElementById('tb-search-input');
    if (opts.onSearch) {
      searchInput.addEventListener('input', (e) => opts.onSearch(e.target.value));
    }

    // Logout
    document.getElementById('logout-pill').addEventListener('click', () => {
      window.Auth.logout();
    });
  }

  window.Navbar = { mount };
})();
