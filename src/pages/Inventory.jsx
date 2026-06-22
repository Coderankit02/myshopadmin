import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import '../pagestyles/inventory.css';

const LOW_STOCK_THRESHOLD = 20;

// BUG FIX (Medium #12): Inventory page ab sirf read-only nahi hai.
// Har product ke saath inline stock edit input add kiya hai.
// Admin seedha yahan se stock update kar sakta hai bina Products page par gaye.
function StockEditCell({ product, onUpdated }) {
  const [val, setVal] = useState(String(product.stock_quantity ?? 0));
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const original = String(product.stock_quantity ?? 0);
  const isDirty = val !== original && val !== '' && !isNaN(Number(val)) && Number(val) >= 0;

  async function save() {
    setSaving(true);
    const { error } = await db
      .from('products')
      .update({ stock_quantity: Number(val) })
      .eq('id', product.id);
    setSaving(false);
    if (error) {
      toast.show(`Stock update nahi hua: ${error.message}`, { type: 'error' });
      setVal(original);
      return;
    }
    toast.show(`"${product.name}" stock updated → ${val}`, { type: 'success' });
    onUpdated(product.id, Number(val));
  }

  function handleKey(e) {
    if (e.key === 'Enter' && isDirty) save();
    if (e.key === 'Escape') setVal(original);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        min="0"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={handleKey}
        style={{
          width: 70, padding: '4px 8px', borderRadius: 6,
          border: `1.5px solid ${isDirty ? 'var(--primary)' : 'var(--border)'}`,
          fontSize: '0.85rem', fontFamily: 'Inter, sans-serif',
        }}
        aria-label={`Stock for ${product.name}`}
      />
      {isDirty && (
        <button
          className="act-btn primary"
          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
          disabled={saving}
          onClick={save}
        >
          {saving ? '...' : 'Save'}
        </button>
      )}
    </div>
  );
}

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await db
        .from('products')
        .select('id,name,stock_quantity,is_active')
        .eq('is_active', true)
        .order('stock_quantity', { ascending: true });
      setProducts(data || []);
      setLoading(false);
    })();
  }, []);

  // Inline update without full reload
  function handleStockUpdated(productId, newQty) {
    setProducts((prev) =>
      prev.map((p) => p.id === productId ? { ...p, stock_quantity: newQty } : p)
    );
  }

  const lowStock = products.filter((p) => (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) < LOW_STOCK_THRESHOLD);
  const outOfStock = products.filter((p) => (p.stock_quantity ?? 0) <= 0);
  const alerts = [...outOfStock, ...lowStock];

  const STATS = [
    { icon: '📦', color: '#3B82F6', val: String(products.length), label: 'Total SKUs (Active)' },
    { icon: '⚠️', color: '#FFB800', val: String(lowStock.length), label: 'Low Stock' },
    { icon: '🚫', color: '#E63946', val: String(outOfStock.length), label: 'Out of Stock' },
    { icon: '✅', color: '#1BA672', val: String(products.length - lowStock.length - outOfStock.length), label: 'Healthy Stock' },
  ];

  return (
    <AppLayout title="Inventory">
      <div className="section-title">Inventory Management</div>
      <div className="section-sub">Stock levels track aur directly update karein — live Supabase data</div>

      <div className="stat-grid" aria-busy={loading}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div className="stat-card" key={i}><div className="skel" style={{ height: 70 }} aria-hidden="true" /></div>
            ))
          : STATS.map((s, i) => (
              <div className="stat-card" key={i}>
                <div className="stat-top"><div className="stat-icon" style={{ background: s.color + '22', color: s.color }}>{s.icon}</div></div>
                <div className="stat-val">{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
      </div>

      {/* Stock Alerts — with inline edit */}
      <div className="table-wrap">
        <div className="table-head">
          <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Stock Alerts</h3>
          <p style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>Stock number click karke directly edit karein, Enter dabayein save ke liye</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th>Stock Update</th><th>Threshold</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray)' }}>Sab products ka stock theek hai 🎉</td></tr>
              ) : (
                alerts.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                    <td><StockEditCell product={p} onUpdated={handleStockUpdated} /></td>
                    <td>{LOW_STOCK_THRESHOLD}</td>
                    <td><span className={`badge ${(p.stock_quantity ?? 0) === 0 ? 'b-cancelled' : 'b-pending'}`}>{(p.stock_quantity ?? 0) === 0 ? 'Out of Stock' : 'Low Stock'}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* All products table with inline stock edit */}
      <div className="table-wrap" style={{ marginTop: 20 }}>
        <div className="table-head"><h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>All Active Products</h3></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th>Stock</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={3}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi product nahi mila</td></tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                    <td><StockEditCell product={p} onUpdated={handleStockUpdated} /></td>
                    <td>
                      <span className={`badge ${(p.stock_quantity ?? 0) === 0 ? 'b-cancelled' : (p.stock_quantity ?? 0) < LOW_STOCK_THRESHOLD ? 'b-pending' : 'b-delivered'}`}>
                        {(p.stock_quantity ?? 0) === 0 ? 'Out of Stock' : (p.stock_quantity ?? 0) < LOW_STOCK_THRESHOLD ? 'Low Stock' : 'In Stock'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
