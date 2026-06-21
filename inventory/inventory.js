/**
 * inventory/inventory.js
 * Inventory Management page logic.
 * Uses the same mock PRODUCTS dataset as the original app, preserved as-is per scope.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Inventory', userEmail: user.email, notifCount: 3 });

  const PRODUCTS = [
    { name: 'Amul Toned Milk 1L', stock: 120 },
    { name: 'Tata Salt 1kg', stock: 8 },
    { name: 'Britannia Bread', stock: 0 },
    { name: 'Fortune Sunflower Oil 1L', stock: 64 },
    { name: 'Maggi Noodles 2-min', stock: 300 },
  ];

  document.getElementById('inventory-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon" style="background:#3B82F622;color:#3B82F6">📦</div></div>
      <div class="stat-val">412</div><div class="stat-label">Total SKUs</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon" style="background:#FFB80022;color:#FFB800">⚠️</div></div>
      <div class="stat-val">14</div><div class="stat-label">Low Stock</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon" style="background:#E6394622;color:#E63946">🚫</div></div>
      <div class="stat-val">5</div><div class="stat-label">Out of Stock</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon" style="background:#1BA67222;color:#1BA672">🔄</div></div>
      <div class="stat-val">9</div><div class="stat-label">Restocked Today</div>
    </div>
  `;

  const lowStock = PRODUCTS.filter((p) => p.stock < 150);
  document.getElementById('inventory-tbody').innerHTML = lowStock
    .map(
      (p) => `
    <tr>
      <td style="font-weight:700;">${Utils.escapeHTML(p.name)}</td>
      <td>${p.stock}</td>
      <td>20</td>
      <td><span class="badge ${p.stock === 0 ? 'b-cancelled' : 'b-pending'}">${p.stock === 0 ? 'Out of Stock' : 'Low Stock'}</span></td>
    </tr>`
    )
    .join('');
})();
