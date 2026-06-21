/**
 * analytics/analytics.js
 * Reports & Analytics page logic (maps to the original app's "Reports" section).
 * Uses the same mock report-types list, preserved as-is per scope.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Analytics', userEmail: user.email, notifCount: 3 });

  const REPORTS = ['Sales Report', 'Product Report', 'Customer Report', 'Inventory Report', 'Payment Report'];

  document.getElementById('reports-grid').innerHTML = REPORTS.map(
    (r) => `
    <div class="stat-card">
      <div class="stat-icon" style="background:var(--primary-light);color:var(--primary-dark);">📈</div>
      <div class="stat-val" style="font-size:0.96rem;">${Utils.escapeHTML(r)}</div>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="act-btn" data-report="${Utils.escapeHTML(r)}" data-format="CSV">CSV</button>
        <button class="act-btn" data-report="${Utils.escapeHTML(r)}" data-format="Excel">Excel</button>
      </div>
    </div>`
  ).join('');

  document.querySelectorAll('[data-report]').forEach((btn) => {
    btn.addEventListener('click', () => {
      Toast.show(`${btn.getAttribute('data-report')} (${btn.getAttribute('data-format')}) — hook this up to your reporting data when ready.`);
    });
  });
})();
