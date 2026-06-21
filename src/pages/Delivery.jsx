import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import '../pagestyles/delivery.css';

const STATS = [
  { icon: '🚴', color: '#1BA672', val: '6', label: 'Out For Delivery' },
  { icon: '📍', color: '#3B82F6', val: '3.2 km', label: 'Avg Distance' },
  { icon: '🆓', color: '#FFB800', val: '21', label: 'Free Deliveries Today' },
  { icon: '⏱️', color: '#8B5CF6', val: '38 min', label: 'Avg Delivery Time' },
];

const DELIVERIES = [
  { id: '#RK1040', cust: 'Pooja Mehta', distance: '2.4 km', charge: 'FREE', statusLabel: 'Out For Delivery', badgeClass: 'b-confirmed' },
  { id: '#RK1037', cust: 'Karan Joshi', distance: '5.1 km', charge: '₹20', statusLabel: 'Picked Up', badgeClass: 'b-packed' },
];

export default function Delivery() {
  const toast = useToast();

  return (
    <AppLayout title="Delivery">
      <div className="section-title">Delivery Management</div>
      <div className="section-sub">Existing delivery-radius system se integrated</div>

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
        <div className="table-head"><h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Active Deliveries</h3></div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Order ID</th><th>Customer</th><th>Distance</th><th>Charge</th><th>Status</th><th>Map</th></tr></thead>
            <tbody>
              {DELIVERIES.map((d, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{d.id}</td>
                  <td>{d.cust}</td>
                  <td>{d.distance}</td>
                  <td>{d.charge}</td>
                  <td><span className={`badge ${d.badgeClass}`}>{d.statusLabel}</span></td>
                  <td>
                    <span
                      className="act-btn"
                      onClick={() => toast.show('Map view — hook this up to your delivery tracking when ready.')}
                    >
                      🗺️ Open
                    </span>
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
