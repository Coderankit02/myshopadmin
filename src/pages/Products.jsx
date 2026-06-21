import { useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import '../pagestyles/products.css';

const INITIAL_PRODUCTS = [
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

export default function Products() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const modal = useModal();
  const toast = useToast();

  async function handleDelete(idx) {
    const confirmed = await modal.confirm({
      title: 'Delete product?',
      message: `Are you sure you want to delete "${products[idx].name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (confirmed) {
      setProducts((prev) => prev.filter((_, i) => i !== idx));
      toast.show('Product deleted', { type: 'success' });
    }
  }

  return (
    <AppLayout title="Products">
      <div className="section-title">Products Management</div>
      <div className="section-sub">Inventory me products add/edit karein</div>

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            <button type="button" className="filter-chip on" aria-pressed="true">All</button>
            <button type="button" className="filter-chip">Featured</button>
            <button type="button" className="filter-chip">Trending</button>
            <button type="button" className="filter-chip">Low Stock</button>
          </div>
          <button
            className="btn-main"
            onClick={() => toast.show('Add product — hook this up to your products table when ready.')}
          >
            + Add Product
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {products.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{p.name}</td>
                  <td>{p.cat}</td>
                  <td>₹{p.price}</td>
                  <td>{p.stock}</td>
                  <td><span className={`badge ${badgeClassFor(p.status)}`}>{p.status}</span></td>
                  <td>
                    <div className="row-actions">
                      <button
                        className="act-btn"
                        onClick={() => toast.show('Edit product — hook this up to your products table when ready.')}
                      >
                        Edit
                      </button>
                      <button className="act-btn danger" onClick={() => handleDelete(i)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
