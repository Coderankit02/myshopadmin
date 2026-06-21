/**
 * categories/categories.js
 * Categories Management page logic.
 * Uses the same mock category list as the original app, preserved as-is per scope.
 */
(async function () {
  const user = await Auth.requireAdmin();

  Sidebar.mount(document.getElementById('sidebar-mount'));
  Navbar.mount(document.getElementById('navbar-mount'), { title: 'Categories', userEmail: user.email, notifCount: 3 });

  const CATEGORIES = [
    { name: 'Dairy', count: 24 },
    { name: 'Grocery', count: 40 },
    { name: 'Snacks', count: 18 },
    { name: 'Bakery', count: 9 },
    { name: 'Fruits & Veg', count: 30 },
    { name: 'Personal Care', count: 15 },
  ];

  const gridEl = document.getElementById('categories-grid');

  function render() {
    gridEl.innerHTML =
      CATEGORIES.map(
        (c, i) => `
      <div class="stat-card">
        <div class="stat-top">
          <div class="stat-icon" style="background:var(--primary-light);color:var(--primary-dark)">🗂️</div>
          <button class="act-btn" data-action="edit" data-idx="${i}">Edit</button>
        </div>
        <div class="stat-val" style="font-size:1rem;">${Utils.escapeHTML(c.name)}</div>
        <div class="stat-label">${c.count} products</div>
      </div>`
      ).join('') +
      `<div class="stat-card" style="align-items:center;justify-content:center;border:1.5px dashed var(--border);">
        <button class="btn-ghost" id="add-category-btn">+ Add Category</button>
      </div>`;

    gridEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        Toast.show('Edit category — hook this up to your categories table when ready.');
      });
    });
    document.getElementById('add-category-btn').addEventListener('click', () => {
      Toast.show('Add category — hook this up to your categories table when ready.');
    });
  }

  render();
})();
