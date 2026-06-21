import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { db } from '../lib/supabase';
import '../pagestyles/inventory.css';

const LOW_STOCK_THRESHOLD = 20;

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
      <div className="section-sub">Stock levels track karein — live Supabase data</div>

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

      <div className="table-wrap">
        <div className="table-head"><h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Stock Alerts</h3></div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th>Current Stock</th><th>Threshold</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray)' }}>Sab products ka stock theek hai 🎉</td></tr>
              ) : (
                alerts.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>{p.name}</td>
                    <td>{p.stock_quantity ?? 0}</td>
                    <td>{LOW_STOCK_THRESHOLD}</td>
                    <td><span className={`badge ${(p.stock_quantity ?? 0) === 0 ? 'b-cancelled' : 'b-pending'}`}>{(p.stock_quantity ?? 0) === 0 ? 'Out of Stock' : 'Low Stock'}</span></td>
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
