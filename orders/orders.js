/**
 * orders/orders.js
 * Orders Management page logic.
 * Uses the same mock ORDERS dataset as the original app (Orders section was
 * not wired to Supabase originally — preserved as-is per scope). Filtering,
 * CSV export, and row actions are implemented client-side.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Orders', userEmail: user.email, notifCount: 3 });

  const ORDERS = [
    { id: '#RK1042', cust: 'Anjali Sharma', items: 5, total: 842, status: 'Pending', payment: 'Pending Verification', date: '21 Jun, 10:42 AM' },
    { id: '#RK1041', cust: 'Vikram Singh', items: 2, total: 215, status: 'Confirmed', payment: 'Verified', date: '21 Jun, 10:10 AM' },
    { id: '#RK1040', cust: 'Pooja Mehta', items: 8, total: 1340, status: 'Out For Delivery', payment: 'Verified', date: '21 Jun, 9:48 AM' },
    { id: '#RK1039', cust: 'Rahul Verma', items: 3, total: 410, status: 'Delivered', payment: 'Verified', date: '21 Jun, 9:02 AM' },
    { id: '#RK1038', cust: 'Sneha Gupta', items: 1, total: 60, status: 'Cancelled', payment: 'Refunded', date: '20 Jun, 8:30 PM' },
    { id: '#RK1037', cust: 'Karan Joshi', items: 6, total: 990, status: 'Packed', payment: 'Verified', date: '20 Jun, 7:55 PM' },
  ];

  const STATUSES = ['All', 'Pending', 'Confirmed', 'Packed', 'Out For Delivery', 'Delivered', 'Cancelled'];
  let filter = 'All';

  const filtersEl = document.getElementById('order-filters');
  const tbodyEl = document.getElementById('orders-tbody');

  function renderFilters() {
    filtersEl.innerHTML = STATUSES.map(
      (s) => `<span class="filter-chip ${s === filter ? 'on' : ''}" data-status="${s}">${s}</span>`
    ).join('');
    filtersEl.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        filter = chip.getAttribute('data-status');
        render();
      });
    });
  }

  function render() {
    renderFilters();
    const filtered = filter === 'All' ? ORDERS : ORDERS.filter((o) => o.status === filter);

    if (filtered.length === 0) {
      tbodyEl.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--gray);">Koi order nahi mila</td></tr>`;
      return;
    }

    tbodyEl.innerHTML = filtered.map(
      (o) => `
      <tr>
        <td style="font-weight:700;">${Utils.escapeHTML(o.id)}</td>
        <td>${Utils.escapeHTML(o.cust)}</td>
        <td>${o.items}</td>
        <td>₹${o.total}</td>
        <td>${Utils.escapeHTML(o.payment)}</td>
        <td><span class="badge ${Utils.statusBadgeClass(o.status)}">${o.status}</span></td>
        <td>${Utils.escapeHTML(o.date)}</td>
        <td><div class="row-actions">
          <button class="act-btn primary" data-action="view" data-id="${o.id}">View</button>
          <button class="act-btn" data-action="update" data-id="${o.id}">Update</button>
        </div></td>
      </tr>`
    ).join('');

    tbodyEl.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const order = ORDERS.find((o) => o.id === btn.getAttribute('data-id'));
        Modal.open({
          title: order.id,
          bodyHTML: `
            <div class="list-row"><div class="list-main"><div class="list-sub">Customer</div></div><div class="list-val">${Utils.escapeHTML(order.cust)}</div></div>
            <div class="list-row"><div class="list-main"><div class="list-sub">Items</div></div><div class="list-val">${order.items}</div></div>
            <div class="list-row"><div class="list-main"><div class="list-sub">Total</div></div><div class="list-val">₹${order.total}</div></div>
            <div class="list-row"><div class="list-main"><div class="list-sub">Payment</div></div><div class="list-val">${Utils.escapeHTML(order.payment)}</div></div>
            <div class="list-row"><div class="list-main"><div class="list-sub">Date</div></div><div class="list-val">${Utils.escapeHTML(order.date)}</div></div>
          `,
        });
      });
    });

    tbodyEl.querySelectorAll('[data-action="update"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Toast.show('Order status update — hook this up to your orders table when ready.');
      });
    });
  }

  document.getElementById('export-csv-btn').addEventListener('click', () => {
    const rows = [['Order ID', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Date']];
    const filtered = filter === 'All' ? ORDERS : ORDERS.filter((o) => o.status === filter);
    filtered.forEach((o) => rows.push([o.id, o.cust, o.items, o.total, o.payment, o.status, o.date]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'orders-export.csv';
    link.click();
    Toast.show('CSV exported', { type: 'success' });
  });

  render();
})();
