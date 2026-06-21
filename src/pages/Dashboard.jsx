import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { statusBadgeClass } from '../lib/utils';
import '../pagestyles/dashboard.css';

/* Mock/static snapshot data — same as the original app (Dashboard never read
   from Supabase in the original — preserved as-is per scope). */
const STATS = [
  { icon: '🧾', color: '#1BA672', label: "Today's Orders", val: '38', trend: '12%', up: true },
  { icon: '💰', color: '#FFB800', label: "Today's Revenue", val: '₹18,420', trend: '8%', up: true },
  { icon: '📅', color: '#3B82F6', label: 'Weekly Revenue', val: '₹1,12,640', trend: '5%', up: true },
  { icon: '📆', color: '#8B5CF6', label: 'Monthly Revenue', val: '₹4,82,300', trend: '2%', up: true },
  { icon: '⏳', color: '#FFB800', label: 'Pending Orders', val: '6' },
  { icon: '✅', color: '#1BA672', label: 'Delivered Orders', val: '29' },
  { icon: '❌', color: '#E63946', label: 'Cancelled Orders', val: '1', trend: '3%', up: false },
  { icon: '👥', color: '#3B82F6', label: 'Total Customers', val: '1,284', trend: '4%', up: true },
];

const PRODUCTS = [
  { name: 'Amul Toned Milk 1L', cat: 'Dairy', price: 62 },
  { name: 'Tata Salt 1kg', cat: 'Grocery', price: 25 },
  { name: 'Britannia Bread', cat: 'Bakery', price: 45 },
  { name: 'Fortune Sunflower Oil 1L', cat: 'Grocery', price: 148 },
];

const ORDERS = [
  { id: '#RK1042', cust: 'Anjali Sharma', date: '21 Jun, 10:42 AM', status: 'Pending' },
  { id: '#RK1041', cust: 'Vikram Singh', date: '21 Jun, 10:10 AM', status: 'Confirmed' },
  { id: '#RK1040', cust: 'Pooja Mehta', date: '21 Jun, 9:48 AM', status: 'Out For Delivery' },
  { id: '#RK1039', cust: 'Rahul Verma', date: '21 Jun, 9:02 AM', status: 'Delivered' },
  { id: '#RK1038', cust: 'Sneha Gupta', date: '20 Jun, 8:30 PM', status: 'Cancelled' },
];

const WEEK_BARS = [40, 65, 52, 80, 46, 90, 70];
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CATEGORIES = [
  { name: 'Dairy', pct: 42 },
  { name: 'Grocery', pct: 35 },
  { name: 'Snacks', pct: 18 },
  { name: 'Bakery', pct: 12 },
];

export default function Dashboard() {
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoadingStats(false), 400);
    return () => clearTimeout(t);
  }, []);

  const dateSub =
    'Aaj ka business snapshot — ' +
    new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <AppLayout title="Dashboard">
      <div className="section-title">Dashboard Overview</div>
      <div className="section-sub">{dateSub}</div>

      <div className="stat-grid">
        {loadingStats
          ? Array.from({ length: 8 }).map((_, i) => (
              <div className="stat-card" key={i}>
                <div className="skel" style={{ height: 70 }} />
              </div>
            ))
          : STATS.map((s, i) => (
              <div className="stat-card" key={i}>
                <div className="stat-top">
                  <div className="stat-icon" style={{ background: s.color + '22', color: s.color }}>
                    {s.icon}
                  </div>
                  {s.trend && (
                    <span className={`stat-trend ${s.up ? 'trend-up' : 'trend-down'}`}>
                      {s.up ? '▲' : '▼'} {s.trend}
                    </span>
                  )}
                </div>
                <div className="stat-val">{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
      </div>

      <div className="panel-row">
        <div className="panel">
          <div className="panel-head">
            <h3>Revenue — Last 7 Days</h3>
            <div className="tab-row">
              <span className="tab-btn on">Week</span>
              <span className="tab-btn">Month</span>
            </div>
          </div>
          <div className="bars">
            {WEEK_BARS.map((v, i) => (
              <div className="bar-col" key={i}>
                <div className="bar" style={{ height: `${v}%` }} />
                <div className="bar-label">{WEEK_LABELS[i]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Top Selling Products</h3>
          </div>
          <div>
            {PRODUCTS.map((p, i) => (
              <div className="list-row" key={i}>
                <div className="list-avatar">{p.name[0]}</div>
                <div className="list-main">
                  <div className="list-title">{p.name}</div>
                  <div className="list-sub">{p.cat}</div>
                </div>
                <div className="list-val">₹{p.price}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-row">
        <div className="panel">
          <div className="panel-head">
            <h3>Recent Orders</h3>
          </div>
          <div>
            {ORDERS.map((o, i) => (
              <div className="list-row" key={i}>
                <div className="list-avatar">{o.cust[0]}</div>
                <div className="list-main">
                  <div className="list-title">
                    {o.id} · {o.cust}
                  </div>
                  <div className="list-sub">{o.date}</div>
                </div>
                <span className={`badge ${statusBadgeClass(o.status)}`}>{o.status}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Top Categories</h3>
          </div>
          <div>
            {CATEGORIES.map((c, i) => (
              <div className="list-row" key={i}>
                <div className="list-main">
                  <div className="list-title">{c.name}</div>
                </div>
                <div className="list-val">{c.pct}%</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
