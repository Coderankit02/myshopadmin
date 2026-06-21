import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import '../pagestyles/analytics.css';

const REPORTS = ['Sales Report', 'Product Report', 'Customer Report', 'Inventory Report', 'Payment Report'];

export default function Analytics() {
  const toast = useToast();

  return (
    <AppLayout title="Analytics">
      <div className="section-title">Reports &amp; Analytics</div>
      <div className="section-sub">Detailed reports generate aur export karein</div>

      <div className="stat-grid">
        {REPORTS.map((r) => (
          <div className="stat-card" key={r}>
            <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>📈</div>
            <div className="stat-val" style={{ fontSize: '0.96rem' }}>{r}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="act-btn" onClick={() => toast.show(`${r} (CSV) — hook this up to your reporting data when ready.`)}>CSV</button>
              <button className="act-btn" onClick={() => toast.show(`${r} (Excel) — hook this up to your reporting data when ready.`)}>Excel</button>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
