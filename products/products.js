/**
 * products/products.js
 * Products Management page logic.
 * Uses the same mock PRODUCTS dataset as the original app (Products section
 * was not wired to Supabase originally — preserved as-is per scope).
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Products', userEmail: user.email, notifCount: 3 });

  const PRODUCTS = [
    { name: 'Amul Toned Milk 1L', cat: 'Dairy', price: 62, stock: 120, status: 'Active' },
    { name: 'Tata Salt 1kg', cat: 'Grocery', price: 25, stock: 8, status: 'Low Stock' },
    { name: 'Britannia Bread', cat: 'Bakery', price: 45, stock: 0, status: 'Out of Stock' },
    { name: 'Fortune Sunflower Oil 1L', cat: 'Grocery', price: 148, stock: 64, status: 'Active' },
    { name: 'Maggi Noodles 2-min', cat: 'Snacks', price: 14, stock: 300, status: 'Active' },
  ];

  function badgeClassFor(status) {
    if (status === 'Active') return 'b-delivered';
    if (status === 'Low Stock') return 'b-pending';
    return 'b-cancelled';
  }

  const tbodyEl = document.getElementById('products-tbody');

  function render() {
    tbodyEl.innerHTML = PRODUCTS.map(
      (p, i) => `
      <tr>
        <td style="font-weight:700;">${Utils.escapeHTML(p.name)}</td>
        <td>${Utils.escapeHTML(p.cat)}</td>
        <td>₹${p.price}</td>
        <td>${p.stock}</td>
        <td><span class="badge ${badgeClassFor(p.status)}">${p.status}</span></td>
        <td><div class="row-actions">
          <button class="act-btn" data-action="edit" data-idx="${i}">Edit</button>
          <button class="act-btn danger" data-action="delete" data-idx="${i}">Delete</button>
        </div></td>
      </tr>`
    ).join('');

    tbodyEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Toast.show('Edit product — hook this up to your products table when ready.');
      });
    });

    tbodyEl.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.getAttribute('data-idx'));
        const confirmed = await Modal.confirm({
          title: 'Delete product?',
          message: `Are you sure you want to delete "${Utils.escapeHTML(PRODUCTS[idx].name)}"? This cannot be undone.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (confirmed) {
          PRODUCTS.splice(idx, 1);
          render();
          Toast.show('Product deleted', { type: 'success' });
        }
      });
    });
  }

  document.getElementById('add-product-btn').addEventListener('click', () => {
    Toast.show('Add product — hook this up to your products table when ready.');
  });

  render();
})();
