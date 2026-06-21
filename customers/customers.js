/**
 * customers/customers.js
 * Customers Management page logic.
 * Uses the same mock CUSTOMERS dataset as the original app, preserved as-is per scope.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Customers', userEmail: user.email, notifCount: 3 });

  const CUSTOMERS = [
    { name: 'Anjali Sharma', phone: '98765 43210', orders: 14, spend: 8420, joined: 'Mar 2025' },
    { name: 'Vikram Singh', phone: '91234 56780', orders: 6, spend: 2310, joined: 'Jan 2026' },
    { name: 'Pooja Mehta', phone: '99887 76655', orders: 22, spend: 15600, joined: 'Aug 2024' },
  ];

  const tbodyEl = document.getElementById('customers-tbody');

  function render() {
    tbodyEl.innerHTML = CUSTOMERS.map(
      (c, i) => `
      <tr>
        <td style="font-weight:700;">${Utils.escapeHTML(c.name)}</td>
        <td>${Utils.escapeHTML(c.phone)}</td>
        <td>${c.orders}</td>
        <td>₹${Utils.formatINR(c.spend)}</td>
        <td>${Utils.escapeHTML(c.joined)}</td>
        <td><div class="row-actions">
          <button class="act-btn primary" data-action="view" data-idx="${i}">View</button>
          <button class="act-btn danger" data-action="block" data-idx="${i}">Block</button>
        </div></td>
      </tr>`
    ).join('');

    tbodyEl.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = CUSTOMERS[Number(btn.getAttribute('data-idx'))];
        Modal.open({
          title: c.name,
          bodyHTML: `
            <div class="list-row"><div class="list-main"><div class="list-sub">Phone</div></div><div class="list-val">${Utils.escapeHTML(c.phone)}</div></div>
            <div class="list-row"><div class="list-main"><div class="list-sub">Orders</div></div><div class="list-val">${c.orders}</div></div>
            <div class="list-row"><div class="list-main"><div class="list-sub">Total Spend</div></div><div class="list-val">₹${Utils.formatINR(c.spend)}</div></div>
            <div class="list-row"><div class="list-main"><div class="list-sub">Joined</div></div><div class="list-val">${Utils.escapeHTML(c.joined)}</div></div>
          `,
        });
      });
    });

    tbodyEl.querySelectorAll('[data-action="block"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const c = CUSTOMERS[Number(btn.getAttribute('data-idx'))];
        const confirmed = await Modal.confirm({
          title: 'Block customer?',
          message: `Block ${Utils.escapeHTML(c.name)} from placing new orders?`,
          confirmLabel: 'Block',
          danger: true,
        });
        if (confirmed) Toast.show('Block customer — hook this up to your customers table when ready.');
      });
    });
  }

  render();
})();
