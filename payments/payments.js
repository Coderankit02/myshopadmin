/**
 * payments/payments.js
 * Payments Management page logic.
 * This is the ONE section that talks to real Supabase tables in the original
 * app (`payment_verifications`, `orders`). All queries below are preserved
 * exactly — only the rendering layer changed from React to vanilla DOM.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Payments', userEmail: user.email, notifCount: 3 });

  let list = [];
  let filter = 'all';
  let search = '';
  let stats = { pending: 0, paid: 0, rejected: 0 };

  const statsEl = document.getElementById('payments-stats');
  const filtersEl = document.getElementById('payment-filters');
  const tbodyEl = document.getElementById('payments-tbody');
  const searchInput = document.getElementById('payment-search');

  function renderStats() {
    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-top"><div class="stat-icon" style="background:#FFB80022;color:#FFB800">⏳</div></div>
        <div class="stat-val">${stats.pending}</div><div class="stat-label">Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-top"><div class="stat-icon" style="background:#1BA67222;color:#1BA672">✅</div></div>
        <div class="stat-val">${stats.paid}</div><div class="stat-label">Paid / Verified</div>
      </div>
      <div class="stat-card">
        <div class="stat-top"><div class="stat-icon" style="background:#E6394622;color:#E63946">🚫</div></div>
        <div class="stat-val">${stats.rejected}</div><div class="stat-label">Rejected</div>
      </div>
      <div class="stat-card">
        <div class="stat-top"><div class="stat-icon" style="background:#3B82F622;color:#3B82F6">💰</div></div>
        <div class="stat-val">${stats.pending + stats.paid + stats.rejected}</div><div class="stat-label">Total Requests</div>
      </div>
    `;
  }

  function renderFilters() {
    const options = ['all', 'pending', 'paid', 'rejected'];
    filtersEl.innerHTML = options
      .map((s) => `<span class="filter-chip ${filter === s ? 'on' : ''}" data-status="${s}">${s[0].toUpperCase() + s.slice(1)}</span>`)
      .join('');
    filtersEl.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        filter = chip.getAttribute('data-status');
        load();
      });
    });
  }

  function renderTable() {
    if (list.length === 0) {
      tbodyEl.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--gray);">Koi payment request nahi mili</td></tr>`;
      return;
    }
    tbodyEl.innerHTML = list
      .map(
        (item) => `
      <tr>
        <td style="font-weight:700;">#${Utils.escapeHTML(item.order_number || '—')}</td>
        <td>${Utils.escapeHTML(item.customer_name)}</td>
        <td>₹${item.amount ?? '—'}</td>
        <td>${Utils.escapeHTML(item.utr)}</td>
        <td>${Utils.formatDateTime(item.created_at)}</td>
        <td><span class="badge ${item.status === 'paid' ? 'b-delivered' : item.status === 'rejected' ? 'b-cancelled' : 'b-pending'}">${item.status}</span></td>
        <td><button class="act-btn primary" data-action="view" data-id="${item.id}">View</button></td>
      </tr>`
      )
      .join('');

    tbodyEl.querySelectorAll('[data-action="view"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = list.find((x) => String(x.id) === btn.getAttribute('data-id'));
        openDetail(item);
      });
    });
  }

  function showLoadingRow() {
    tbodyEl.innerHTML = `<tr><td colspan="7"><div class="skel" style="height:20px;"></div></td></tr>`;
  }

  async function load() {
    renderFilters();
    showLoadingRow();

    let q = window.db.from('payment_verifications').select('*').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`utr.ilike.%${s}%,order_number.ilike.%${s}%,mobile.ilike.%${s}%,customer_name.ilike.%${s}%`);
    }
    const { data, error } = await q;
    list = !error && data ? data : [];
    renderTable();
  }

  async function loadStats() {
    const { data } = await window.db.from('payment_verifications').select('status').limit(1000);
    const c = { pending: 0, paid: 0, rejected: 0 };
    (data || []).forEach((r) => {
      if (c[r.status] !== undefined) c[r.status]++;
    });
    stats = c;
    renderStats();
  }

  async function approve(item) {
    const { error: e1 } = await window.db
      .from('payment_verifications')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (!e1) {
      await window.db
        .from('orders')
        .update({ status: 'confirmed', payment_status: 'paid', updated_at: new Date().toISOString() })
        .eq('id', item.order_id);
    }
    Modal.close();
    Toast.show('Payment approved, order confirmed', { type: 'success' });
    load();
    loadStats();
  }

  async function reject(item, reason) {
    await window.db
      .from('payment_verifications')
      .update({ status: 'rejected', admin_note: reason, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    Modal.close();
    Toast.show('Payment rejected', { type: 'success' });
    load();
    loadStats();
  }

  function openDetail(item) {
    const bodyHTML = `
      ${item.screenshot_url
        ? `<img src="${item.screenshot_url}" style="width:100%;border-radius:12px;margin-bottom:14px;"/>`
        : `<div style="padding:24px;text-align:center;color:var(--gray);margin-bottom:14px;">Screenshot upload nahi hua</div>`}
      <div class="list-row"><div class="list-main"><div class="list-sub">Customer</div></div><div class="list-val">${Utils.escapeHTML(item.customer_name)}</div></div>
      <div class="list-row"><div class="list-main"><div class="list-sub">Mobile</div></div><div class="list-val">${Utils.escapeHTML(item.mobile)}</div></div>
      <div class="list-row"><div class="list-main"><div class="list-sub">Order ID</div></div><div class="list-val">${Utils.escapeHTML(item.order_number || '—')}</div></div>
      <div class="list-row"><div class="list-main"><div class="list-sub">UTR</div></div><div class="list-val">${Utils.escapeHTML(item.utr)}</div></div>
      <div class="list-row"><div class="list-main"><div class="list-sub">Amount</div></div><div class="list-val">₹${item.amount ?? '—'}</div></div>
      <div id="payment-action-zone"></div>
    `;

    Modal.open({ title: 'Payment Request', bodyHTML });

    const zone = document.getElementById('payment-action-zone');
    if (item.status === 'pending') {
      renderPendingActions(zone, item);
    } else {
      zone.innerHTML = `<div style="margin-top:14px;font-weight:700;color:${item.status === 'paid' ? 'var(--primary)' : 'var(--red)'}">
        ${item.status === 'paid' ? '✅ Approved — Order Confirmed' : `❌ Rejected ${item.admin_note ? '— ' + Utils.escapeHTML(item.admin_note) : ''}`}
      </div>`;
    }
  }

  function renderPendingActions(zone, item) {
    zone.innerHTML = `
      <div style="display:flex;gap:10px;margin-top:16px;">
        <button class="btn-main" id="approve-btn">✅ Approve</button>
        <button class="btn-ghost" id="reject-toggle-btn">❌ Reject</button>
      </div>
    `;
    document.getElementById('approve-btn').addEventListener('click', (e) => {
      e.target.disabled = true;
      approve(item);
    });
    document.getElementById('reject-toggle-btn').addEventListener('click', () => {
      zone.innerHTML = `
        <div style="margin-top:14px;">
          <textarea id="reject-reason" style="width:100%;background:var(--page-bg);border:1px solid var(--border);border-radius:10px;padding:10px;font-size:0.84rem;" rows="2" placeholder="Reject karne ki wajah (optional)"></textarea>
          <button class="btn-main" id="reject-confirm-btn" style="margin-top:10px;background:var(--red);">Reject Confirm Karein</button>
        </div>
      `;
      document.getElementById('reject-confirm-btn').addEventListener('click', (e) => {
        e.target.disabled = true;
        reject(item, document.getElementById('reject-reason').value);
      });
    });
  }

  searchInput.addEventListener(
    'input',
    Utils.debounce((e) => {
      search = e.target.value;
      load();
    }, 350)
  );

  load();
  loadStats();
})();
