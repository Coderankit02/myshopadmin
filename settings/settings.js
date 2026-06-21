/**
 * settings/settings.js
 * Settings page logic: Shop Information form, Coupons & Offers table,
 * and Push Notifications sender. The original app's "Coupons" and
 * "Notifications" NAV sections were folded in here as sub-panels, since
 * the requested folder structure didn't include dedicated folders for them.
 * All values/behavior preserved exactly from the original mock implementation.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Settings', userEmail: user.email, notifCount: 3 });

  /* ── Shop Information ── */
  const DEFAULTS = {
    'set-shop-name': 'Rinku Kirana Store',
    'set-contact': '+91 98765 43210',
    'set-whatsapp': '+91 98765 43210',
    'set-upi': 'rinkukirana@upi',
    'set-radius': '8',
    'set-charge': '20',
    'set-open-time': '07:00',
    'set-close-time': '22:00',
  };

  document.getElementById('save-settings-btn').addEventListener('click', () => {
    Toast.show('Settings saved — hook this up to your settings table when ready.', { type: 'success' });
  });
  document.getElementById('reset-settings-btn').addEventListener('click', () => {
    Object.entries(DEFAULTS).forEach(([id, val]) => {
      document.getElementById(id).value = val;
    });
    Toast.show('Reset to defaults');
  });

  /* ── Coupons & Offers ── */
  const COUPONS = [
    { code: 'WELCOME50', type: '₹50 OFF', min: '₹299', used: '142/500', expiry: '30 Jun 2026' },
    { code: 'SAVE15', type: '15% OFF', min: '₹500', used: '88/—', expiry: '15 Jul 2026' },
  ];

  function renderCoupons() {
    document.getElementById('coupons-tbody').innerHTML = COUPONS.map(
      (c, i) => `
      <tr>
        <td style="font-weight:700;">${Utils.escapeHTML(c.code)}</td>
        <td>${Utils.escapeHTML(c.type)}</td>
        <td>${Utils.escapeHTML(c.min)}</td>
        <td>${Utils.escapeHTML(c.used)}</td>
        <td>${Utils.escapeHTML(c.expiry)}</td>
        <td><div class="row-actions">
          <button class="act-btn" data-action="edit-coupon" data-idx="${i}">Edit</button>
          <button class="act-btn danger" data-action="delete-coupon" data-idx="${i}">Delete</button>
        </div></td>
      </tr>`
    ).join('');

    document.querySelectorAll('[data-action="edit-coupon"]').forEach((btn) => {
      btn.addEventListener('click', () => Toast.show('Edit coupon — hook this up to your coupons table when ready.'));
    });
    document.querySelectorAll('[data-action="delete-coupon"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-idx'));
        const confirmed = await Modal.confirm({
          title: 'Delete coupon?',
          message: `Delete coupon "${Utils.escapeHTML(COUPONS[idx].code)}"?`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (confirmed) {
          COUPONS.splice(idx, 1);
          renderCoupons();
          Toast.show('Coupon deleted', { type: 'success' });
        }
      });
    });
  }
  document.getElementById('add-coupon-btn').addEventListener('click', () => {
    Toast.show('Create coupon — hook this up to your coupons table when ready.');
  });
  renderCoupons();

  /* ── Push Notifications ── */
  document.getElementById('send-notif-btn').addEventListener('click', () => {
    const title = document.getElementById('notif-title').value.trim();
    const message = document.getElementById('notif-message').value.trim();
    if (!title || !message) {
      Toast.show('Title aur message dono zaroori hai', { type: 'error' });
      return;
    }
    Toast.show('Notification sent — hook this up to your push provider when ready.', { type: 'success' });
    document.getElementById('notif-title').value = '';
    document.getElementById('notif-message').value = '';
  });
})();
