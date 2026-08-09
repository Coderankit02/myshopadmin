import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import '../pagestyles/inventory.css';

const LOW_STOCK_THRESHOLD = 20;

// Product ki units (multi-unit packs) se help:
//  - unitStocks: [{ label, stock }] ya []
//  - unitStatus: 'ok' | 'low' | 'oos'
function unitStocksOf(p) {
  if (!Array.isArray(p.units) || p.units.length === 0) return [];
  return p.units.map((u) => ({
    label: String(u.label || ''),
    stock: typeof u.stock === 'number' ? u.stock : Number(u.stock) || 0,
  }));
}

function unitStatusOf(u) {
  if (u.stock <= 0) return 'oos';
  if (u.stock < LOW_STOCK_THRESHOLD) return 'low';
  return 'ok';
}

// BUG FIX (Medium #12): Inventory page ab sirf read-only nahi hai.
// Har product ke saath inline stock edit input add kiya hai.
// Multi-unit (2026-08): units wale product par dropdown se unit choose karke
// USI unit ka stock edit hota hai; product stock_quantity = units sum (recompute).
function StockEditCell({ product, onUpdated }) {
  const units = unitStocksOf(product);
  const isMulti = units.length > 0;
  // Multi-unit hone par first unit select karke rakho
  const [selUnit, setSelUnit] = useState(isMulti ? units[0].label : '');
  const [val, setVal] = useState(
    isMulti ? String(units[0].stock) : String(product.stock_quantity ?? 0)
  );
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const currentStock = isMulti
    ? (units.find((u) => u.label === selUnit)?.stock ?? 0)
    : (product.stock_quantity ?? 0);
  const original = String(currentStock);
  const isDirty = val !== original && val !== '' && !isNaN(Number(val)) && Number(val) >= 0;

  // Unit change hone par input ko us unit ke stock par set karo
  function handleUnitChange(label) {
    setSelUnit(label);
    const u = units.find((x) => x.label === label);
    setVal(String(u ? u.stock : 0));
  }

  async function save() {
    setSaving(true);
    let error = null;
    if (isMulti) {
      // Sirf selected unit ka stock badlo; product stock = units sum
      const newUnits = product.units.map((u) =>
        String(u.label || '') === selUnit ? { ...u, stock: Number(val) } : u
      );
      const newStock = newUnits.reduce((s, u) => s + (Number(u.stock) || 0), 0);
      ({ error } = await db
        .from('products')
        .update({ units: newUnits, stock_quantity: newStock })
        .eq('id', product.id));
      if (!error) onUpdated(product.id, newStock, newUnits);
    } else {
      ({ error } = await db
        .from('products')
        .update({ stock_quantity: Number(val) })
        .eq('id', product.id));
      if (!error) onUpdated(product.id, Number(val));
    }
    setSaving(false);
    if (error) {
      toast.show(`Stock update nahi hua: ${error.message}`, { type: 'error' });
      setVal(original);
      return;
    }
    toast.show(`"${product.name}"${isMulti ? ` (${selUnit})` : ''} stock updated → ${val}`, { type: 'success' });
  }

  function handleKey(e) {
    if (e.key === 'Enter' && isDirty) save();
    if (e.key === 'Escape') setVal(original);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {isMulti && (
        <select
          value={selUnit}
          onChange={(e) => handleUnitChange(e.target.value)}
          aria-label={`Unit for ${product.name}`}
          style={{ padding: '4px 6px', borderRadius: 6, border: '1.5px solid var(--border)', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif' }}
        >
          {units.map((u) => (
            <option key={u.label} value={u.label}>{u.label}</option>
          ))}
        </select>
      )}
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
        aria-label={`Stock for ${product.name}${isMulti ? ` ${selUnit}` : ''}`}
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

// Multi-unit product ke saare unit chips (label + stock) — ek nazar me status
function UnitChips({ product }) {
  const units = unitStocksOf(product);
  if (units.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
      {units.map((u) => {
        const st = unitStatusOf(u);
        return (
          <span
            key={u.label}
            title={st === 'oos' ? 'Out of stock' : st === 'low' ? 'Low stock' : 'In stock'}
            style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999,
              background: st === 'oos' ? '#FEE2E2' : st === 'low' ? '#FEF3C7' : '#D1FAE5',
              color: st === 'oos' ? '#B91C1C' : st === 'low' ? '#B45309' : '#047857',
              border: '1px solid transparent',
            }}
          >
            {u.label} · {u.stock}
          </span>
        );
      })}
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
        .select('id,name,stock_quantity,units,is_active')
        .eq('is_active', true)
        .order('stock_quantity', { ascending: true });
      setProducts(data || []);
      setLoading(false);
    })();
  }, []);

  // Inline update without full reload (units wale products ke liye newUnits bhi)
  function handleStockUpdated(productId, newQty, newUnits) {
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stock_quantity: newQty, ...(newUnits ? { units: newUnits } : {}) } : p))
    );
  }

  // Unit-aware stock status: kisi unit ka stock <=0 → OOS; < threshold → Low.
  function productStatus(p) {
    const units = unitStocksOf(p);
    if (units.length === 0) {
      const s = p.stock_quantity ?? 0;
      return s <= 0 ? 'oos' : s < LOW_STOCK_THRESHOLD ? 'low' : 'ok';
    }
    if (units.some((u) => unitStatusOf(u) === 'oos')) return 'oos';
    if (units.some((u) => unitStatusOf(u) === 'low')) return 'low';
    return 'ok';
  }

  // Unit-wise alerts: multi-unit product me jo units low/OOS hain unki list
  function unitAlertsOf(p) {
    return unitStocksOf(p)
      .filter((u) => unitStatusOf(u) !== 'ok')
      .map((u) => `${u.label} (${u.stock})`);
  }

  const lowStock = products.filter((p) => productStatus(p) === 'low');
  const outOfStock = products.filter((p) => productStatus(p) === 'oos');
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
      <div className="section-sub">Stock levels track aur directly update karein — live Supabase data · multi-unit packs ke har size ka apna stock</div>

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
          <p style={{ fontSize: '0.78rem', color: 'var(--gray)' }}>
            Stock number click karke directly edit karein, Enter dabayein save ke liye · multi-unit products par unit select karke us size ka stock badle
          </p>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Product</th><th>Stock Update</th><th>Unit Status</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray)' }}>Sab products ka stock theek hai 🎉</td></tr>
              ) : (
                alerts.map((p) => {
                  const unitAlerts = unitAlertsOf(p);
                  return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 700 }}>
                      {p.name}
                      {/* unit-wise alert chips — kaunse sizes low/OOS */}
                      {unitAlerts.length > 0 && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {unitAlerts.map((a) => (
                            <span key={a} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: '#FEE2E2', color: '#B91C1C' }}>
                              ⚠️ {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td><StockEditCell product={p} onUpdated={handleStockUpdated} /></td>
                    <td>{p.units && Array.isArray(p.units) && p.units.length > 0 ? <UnitChips product={p} /> : <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>—</span>}</td>
                    <td><span className={`badge ${productStatus(p) === 'oos' ? 'b-cancelled' : 'b-pending'}`}>{productStatus(p) === 'oos' ? 'Out of Stock' : 'Low Stock'}</span></td>
                  </tr>
                  );
                })
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
            <thead><tr><th>Product</th><th>Stock</th><th>Units</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi product nahi mila</td></tr>
              ) : (
                products.map((p) => {
                  const st = productStatus(p);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700 }}>{p.name}</td>
                      <td><StockEditCell product={p} onUpdated={handleStockUpdated} /></td>
                      <td>{p.units && Array.isArray(p.units) && p.units.length > 0 ? <UnitChips product={p} /> : <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>—</span>}</td>
                      <td>
                        <span className={`badge ${st === 'oos' ? 'b-cancelled' : st === 'low' ? 'b-pending' : 'b-delivered'}`}>
                          {st === 'oos' ? 'Out of Stock' : st === 'low' ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
