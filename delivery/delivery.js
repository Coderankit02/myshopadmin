/**
 * delivery/delivery.js
 * Delivery Management page logic.
 * Uses the same mock active-deliveries data as the original app, preserved as-is per scope.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Delivery', userEmail: user.email, notifCount: 3 });

  document.getElementById('delivery-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon" style="background:#1BA67222;color:#1BA672">🚴</div></div>
      <div class="stat-val">6</div><div class="stat-label">Out For Delivery</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon" style="background:#3B82F622;color:#3B82F6">📍</div></div>
      <div class="stat-val">3.2 km</div><div class="stat-label">Avg Distance</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon" style="background:#FFB80022;color:#FFB800">🆓</div></div>
      <div class="stat-val">21</div><div class="stat-label">Free Deliveries Today</div>
    </div>
    <div class="stat-card">
      <div class="stat-top"><div class="stat-icon" style="background:#8B5CF622;color:#8B5CF6">⏱️</div></div>
      <div class="stat-val">38 min</div><div class="stat-label">Avg Delivery Time</div>
    </div>
  `;

  const DELIVERIES = [
    { id: '#RK1040', cust: 'Pooja Mehta', distance: '2.4 km', charge: 'FREE', statusLabel: 'Out For Delivery', badgeClass: 'b-confirmed' },
    { id: '#RK1037', cust: 'Karan Joshi', distance: '5.1 km', charge: '₹20', statusLabel: 'Picked Up', badgeClass: 'b-packed' },
  ];

  document.getElementById('delivery-tbody').innerHTML = DELIVERIES.map(
    (d) => `
    <tr>
      <td style="font-weight:700;">${Utils.escapeHTML(d.id)}</td>
      <td>${Utils.escapeHTML(d.cust)}</td>
      <td>${Utils.escapeHTML(d.distance)}</td>
      <td>${Utils.escapeHTML(d.charge)}</td>
      <td><span class="badge ${d.badgeClass}">${d.statusLabel}</span></td>
      <td><span class="act-btn" data-action="open-map" data-id="${d.id}">🗺️ Open</span></td>
    </tr>`
  ).join('');

  document.querySelectorAll('[data-action="open-map"]').forEach((el) => {
    el.addEventListener('click', () => Toast.show('Map view — hook this up to your delivery tracking when ready.'));
  });
})();
