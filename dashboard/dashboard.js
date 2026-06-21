/**
 * dashboard/dashboard.js
 * Dashboard Overview page logic.
 * Data here is the same mock/static snapshot used in the original single-file app
 * (Dashboard never read from Supabase in the original — preserved as-is per scope).
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), {
    title: 'Dashboard',
    userEmail: user.email,
    notifCount: 3,
  });

  document.getElementById('dash-date-sub').textContent =
    'Aaj ka business snapshot — ' +
    new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  /* ── Mock data (same as original index.html — replace with Supabase queries when ready) ── */
  const STATS = [
    { icon: '🧾', color: '#1BA672', label: "Today's Orders", val: '38', trend: '12%', up: true },
    { icon: '💰', color: '#FFB800', label: "Today's Revenue", val: '₹18,420', trend: '8%', up: true },
    { icon: '📅', color: '#3B82F6', label: 'Weekly Revenue', val: '₹1,12,640', trend: '5%', up: true },
    { icon: '📆', color: '#8B5CF6', label: 'Monthly Revenue', val: '₹4,82,300', trend: '2%', up: true },
    { icon: '⏳', color: '#FFB800', label: 'Pending Orders', val: '6' },
    { icon: '✅', color: '#1BA672', label: 'Delivered Orders', val: '29' },
    { icon: '❌', color: '#E63946', label: 'Cancelled Orders', val: '1', trend: '3%', up: false },
    { icon: '👥', color: '#3B82F6', label: 'Total Customers', val: '1,284', trend: '4%', up: true },
  ];

  const PRODUCTS = [
    { name: 'Amul Toned Milk 1L', cat: 'Dairy', price: 62 },
    { name: 'Tata Salt 1kg', cat: 'Grocery', price: 25 },
    { name: 'Britannia Bread', cat: 'Bakery', price: 45 },
    { name: 'Fortune Sunflower Oil 1L', cat: 'Grocery', price: 148 },
  ];

  const ORDERS = [
    { id: '#RK1042', cust: 'Anjali Sharma', date: '21 Jun, 10:42 AM', status: 'Pending' },
    { id: '#RK1041', cust: 'Vikram Singh', date: '21 Jun, 10:10 AM', status: 'Confirmed' },
    { id: '#RK1040', cust: 'Pooja Mehta', date: '21 Jun, 9:48 AM', status: 'Out For Delivery' },
    { id: '#RK1039', cust: 'Rahul Verma', date: '21 Jun, 9:02 AM', status: 'Delivered' },
    { id: '#RK1038', cust: 'Sneha Gupta', date: '20 Jun, 8:30 PM', status: 'Cancelled' },
  ];

  const WEEK_BARS = [40, 65, 52, 80, 46, 90, 70];
  const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const CATEGORIES = [
    { name: 'Dairy', pct: 42 },
    { name: 'Grocery', pct: 35 },
    { name: 'Snacks', pct: 18 },
    { name: 'Bakery', pct: 12 },
  ];

  /* ── Render stat cards (brief skeleton flash, matches original 500ms loading feel) ── */
  const statGrid = document.getElementById('stat-grid');
  statGrid.innerHTML = Array.from({ length: 8 })
    .map(() => `<div class="stat-card"><div class="skel" style="height:70px;"></div></div>`)
    .join('');

  setTimeout(() => {
    statGrid.innerHTML = STATS.map(
      (s) => `
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-icon" style="background:${s.color}22;color:${s.color}">${s.icon}</div>
          ${s.trend ? `<span class="stat-trend ${s.up ? 'trend-up' : 'trend-down'}">${s.up ? '▲' : '▼'} ${s.trend}</span>` : ''}
        </div>
        <div class="stat-val">${s.val}</div>
        <div class="stat-label">${s.label}</div>
      </div>`
    ).join('');
  }, 400);

  /* ── Revenue bars ── */
  document.getElementById('revenue-bars').innerHTML = WEEK_BARS.map(
    (v, i) => `
    <div class="bar-col">
      <div class="bar" style="height:${v}%"></div>
      <div class="bar-label">${WEEK_LABELS[i]}</div>
    </div>`
  ).join('');

  /* ── Top selling products ── */
  document.getElementById('top-products-list').innerHTML = PRODUCTS.map(
    (p) => `
    <div class="list-row">
      <div class="list-avatar">${Utils.escapeHTML(p.name[0])}</div>
      <div class="list-main">
        <div class="list-title">${Utils.escapeHTML(p.name)}</div>
        <div class="list-sub">${Utils.escapeHTML(p.cat)}</div>
      </div>
      <div class="list-val">₹${p.price}</div>
    </div>`
  ).join('');

  /* ── Recent orders ── */
  document.getElementById('recent-orders-list').innerHTML = ORDERS.map(
    (o) => `
    <div class="list-row">
      <div class="list-avatar">${Utils.escapeHTML(o.cust[0])}</div>
      <div class="list-main">
        <div class="list-title">${Utils.escapeHTML(o.id)} · ${Utils.escapeHTML(o.cust)}</div>
        <div class="list-sub">${Utils.escapeHTML(o.date)}</div>
      </div>
      <span class="badge ${Utils.statusBadgeClass(o.status)}">${o.status}</span>
    </div>`
  ).join('');

  /* ── Top categories ── */
  document.getElementById('top-categories-list').innerHTML = CATEGORIES.map(
    (c) => `
    <div class="list-row">
      <div class="list-main"><div class="list-title">${Utils.escapeHTML(c.name)}</div></div>
      <div class="list-val">${c.pct}%</div>
    </div>`
  ).join('');
})();
