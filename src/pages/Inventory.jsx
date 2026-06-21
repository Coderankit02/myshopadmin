import AppLayout from '../components/AppLayout';
import '../pagestyles/inventory.css';

const PRODUCTS = [
  { name: 'Amul Toned Milk 1L', stock: 120 },
  { name: 'Tata Salt 1kg', stock: 8 },
  { name: 'Britannia Bread', stock: 0 },
  { name: 'Fortune Sunflower Oil 1L', stock: 64 },
  { name: 'Maggi Noodles 2-min', stock: 300 },
];

const STATS = [
  { icon: '📦', color: '#3B82F6', val: '412', label: 'Total SKUs' },
  { icon: '⚠️', color: '#FFB800', val: '14', label: 'Low Stock' },
  { icon: '🚫', color: '#E63946', val: '5', label: 'Out of Stock' },
  { icon: '🔄', color: '#1BA672', val: '9', label: 'Restocked Today' },
];

export default function Inventory() {
  const lowStock = PRODUCTS.filter((p) => p.stock < 150);

  return (
    <AppLayout title="Inventory">
      <div className="section-title">Inventory Management</div>
      <div className="section-sub">Stock levels aur movement track karein</div>

      <div className="stat-grid">
        {STATS.map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-top">
              <div className="stat-icon" style={{ background: s.color + '22', color: s.color }}>{s.icon}</div>
            </div>
            <div className="stat-val">{s.val}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="table-wrap">
        <div className="table-head"><h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Stock Alerts</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Product</th><th>Current Stock</th><th>Threshold</th><th>Status</th></tr></thead>
            <tbody>
              {lowStock.map((p, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{p.name}</td>
                  <td>{p.stock}</td>
                  <td>20</td>
                  <td><span className={`badge ${p.stock === 0 ? 'b-cancelled' : 'b-pending'}`}>{p.stock === 0 ? 'Out of Stock' : 'Low Stock'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
