import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { db } from '../lib/supabase';
import { statusBadgeClass, statusLabel } from '../lib/utils';
import '../pagestyles/dashboard.css';

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfDay(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
}
function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
function isoDate(d) {
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [topCategories, setTopCategories] = useState([]);
  const [weekBars, setWeekBars] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [monthBars, setMonthBars] = useState([0, 0, 0, 0]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const now = new Date();

      // BUG FIX (High #8): Server-side date filtering so we never miss orders.
      // Pehle .limit(1000) tha aur sab filtering client-side hoti thi.
      // Ab server ko date range bhejte hain — sirf zaruri data aata hai,
      // aur 1000 se zyada orders ho to bhi data sahi hoga.
      const todayStart = startOfDay(now).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const [
        todayRes, weekRes, monthRes,
        pendingRes, deliveredRes, cancelledRes,
        recentRes, itemsRes, customersRes,
      ] = await Promise.all([
        // Today orders
        db.from('orders').select('id,final_amount,status').gte('created_at', todayStart),
        // Week orders (for revenue + bars)
        db.from('orders').select('id,final_amount,status,created_at').gte('created_at', weekStart),
        // Month orders (for revenue)
        db.from('orders').select('id,final_amount,status').gte('created_at', monthStart),
        // Pending count (all time)
        db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        // Delivered count (all time)
        db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'delivered'),
        // Cancelled count (all time)
        db.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'cancelled'),
        // Recent 5 orders for the list
        db.from('orders').select('id,order_number,delivery_name,status,final_amount,created_at').order('created_at', { ascending: false }).limit(5),
        // All order items (for top products; last 30 days to keep it manageable)
        // BUG FIX: order_items table ka apna 'created_at' column nahi hai (order
        // place hote waqt insert ho kar hi khatam ho jaata hai, koi timestamp
        // save nahi hota) — isliye `.gte('created_at', monthStart)` seedha
        // is table par lagane se Postgres 400 error deta tha ("column created_at
        // does not exist"), aur Dashboard ki "Top Selling Products" list hamesha
        // khaali reh jaati thi. Ab parent `orders` table (jiska created_at hai)
        // ko join karke usi par date filter lagate hain.
        db.from('order_items').select('product_id,name,category,qty,line_total,orders!inner(created_at)').gte('orders.created_at', monthStart).limit(2000),
        // Customer count
        db.from('profiles').select('*', { count: 'exact', head: true }),
      ]);

      const revenueOf = (list) =>
        (list || []).filter((o) => o.status !== 'cancelled').reduce((s, o) => s + (o.final_amount || 0), 0);

      setStats({
        todayOrders: (todayRes.data || []).length,
        todayRevenue: revenueOf(todayRes.data),
        weekRevenue: revenueOf(weekRes.data),
        monthRevenue: revenueOf(monthRes.data),
        pending: pendingRes.count ?? 0,
        delivered: deliveredRes.count ?? 0,
        cancelled: cancelledRes.count ?? 0,
        totalCustomers: customersRes.count ?? 0,
      });

      // Top selling products (by qty, last 30 days)
      const prodMap = {};
      (itemsRes.data || []).forEach((it) => {
        const key = it.product_id || it.name;
        if (!prodMap[key]) prodMap[key] = { name: it.name, category: it.category, qty: 0, revenue: 0 };
        prodMap[key].qty += it.qty || 0;
        prodMap[key].revenue += it.line_total || 0;
      });
      setTopProducts(Object.values(prodMap).sort((a, b) => b.qty - a.qty).slice(0, 4));

      // Top categories
      const catMap = {};
      let catTotal = 0;
      (itemsRes.data || []).forEach((it) => {
        const cat = it.category || 'Other';
        catMap[cat] = (catMap[cat] || 0) + (it.line_total || 0);
        catTotal += it.line_total || 0;
      });
      const catList = Object.entries(catMap)
        .map(([name, val]) => ({ name, pct: catTotal ? Math.round((val / catTotal) * 100) : 0 }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 4);
      setTopCategories(catList);

      setRecentOrders(recentRes.data || []);

      // Last 7 days revenue bars (using already-fetched weekRes)
      const weekOrders = weekRes.data || [];
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const rev = revenueOf(weekOrders.filter((o) => isSameDay(o.created_at, day)));
        days.push(rev);
      }
      const maxDay = Math.max(...days, 1);
      setWeekBars(days.map((v) => Math.round((v / maxDay) * 100)));

      // Last 4 weeks revenue bars — fetch separately (server-side per-week)
      const weekBarPromises = [];
      for (let i = 3; i >= 0; i--) {
        const from = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000).toISOString();
        const to = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000).toISOString();
        weekBarPromises.push(
          db.from('orders').select('final_amount,status').gte('created_at', from).lt('created_at', to)
        );
      }
      const weekBarResults = await Promise.all(weekBarPromises);
      const weeks = weekBarResults.map((r) => revenueOf(r.data));
      const maxWeek = Math.max(...weeks, 1);
      setMonthBars(weeks.map((v) => Math.round((v / maxWeek) * 100)));

      setLoading(false);
    })();
  }, []);

  const dateSub =
    'Aaj ka business snapshot — ' +
    new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  const STATS = stats ? [
    { icon: '🧾', color: '#1BA672', label: "Today's Orders", val: String(stats.todayOrders) },
    { icon: '💰', color: '#FFB800', label: "Today's Revenue", val: `₹${stats.todayRevenue.toLocaleString('en-IN')}` },
    { icon: '📅', color: '#3B82F6', label: 'Weekly Revenue', val: `₹${stats.weekRevenue.toLocaleString('en-IN')}` },
    { icon: '📆', color: '#8B5CF6', label: 'Monthly Revenue', val: `₹${stats.monthRevenue.toLocaleString('en-IN')}` },
    { icon: '⏳', color: '#FFB800', label: 'Pending Orders', val: String(stats.pending) },
    { icon: '✅', color: '#1BA672', label: 'Delivered Orders', val: String(stats.delivered) },
    { icon: '❌', color: '#E63946', label: 'Cancelled Orders', val: String(stats.cancelled) },
    { icon: '👥', color: '#3B82F6', label: 'Total Customers', val: stats.totalCustomers.toLocaleString('en-IN') },
  ] : [];

  return (
    <AppLayout title="Dashboard">
      <div className="section-title">Dashboard Overview</div>
      <div className="section-sub">{dateSub}</div>

      <div className="stat-grid" aria-busy={loading}>
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div className="stat-card" key={i}>
                <div className="skel" style={{ height: 70 }} aria-hidden="true" />
                {i === 0 && <span className="sr-only">Loading dashboard statistics…</span>}
              </div>
            ))
          : STATS.map((s, i) => (
              <div className="stat-card" key={i}>
                <div className="stat-top">
                  <div className="stat-icon" style={{ background: s.color + '22', color: s.color }}>{s.icon}</div>
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
            <div className="tab-row" role="tablist" aria-label="Revenue period">
              <button type="button" role="tab" aria-selected={period === 'week'} className={`tab-btn${period === 'week' ? ' on' : ''}`} onClick={() => setPeriod('week')}>Week</button>
              <button type="button" role="tab" aria-selected={period === 'month'} className={`tab-btn${period === 'month' ? ' on' : ''}`} onClick={() => setPeriod('month')}>Month</button>
            </div>
          </div>
          <div className="bars">
            {(period === 'week' ? weekBars : monthBars).map((v, i) => (
              <div className="bar-col" key={i}>
                <div className="bar" style={{ height: `${v}%` }} />
                <div className="bar-label">{(period === 'week' ? WEEK_LABELS : ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4'])[i]}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Top Selling Products</h3></div>
          <div>
            {topProducts.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--gray)' }}>Abhi tak koi sale nahi hui</div>
            ) : (
              topProducts.map((p, i) => (
                <div className="list-row" key={i}>
                  <div className="list-avatar">{p.name?.[0] || '?'}</div>
                  <div className="list-main">
                    <div className="list-title">{p.name}</div>
                    <div className="list-sub">{p.category} · {p.qty} sold</div>
                  </div>
                  <div className="list-val">₹{p.revenue}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="panel-row">
        <div className="panel">
          <div className="panel-head"><h3>Recent Orders</h3></div>
          <div>
            {recentOrders.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--gray)' }}>Koi order nahi mila</div>
            ) : (
              recentOrders.map((o) => (
                <div className="list-row" key={o.id}>
                  <div className="list-avatar">{o.delivery_name?.[0] || '#'}</div>
                  <div className="list-main">
                    <div className="list-title">{o.order_number} · {o.delivery_name}</div>
                    <div className="list-sub">{new Date(o.created_at).toLocaleString('en-IN')}</div>
                  </div>
                  <span className={`badge ${statusBadgeClass(o.status)}`}>{statusLabel(o.status)}</span>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Top Categories</h3></div>
          <div>
            {topCategories.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--gray)' }}>Data nahi mila</div>
            ) : (
              topCategories.map((c, i) => (
                <div className="list-row" key={i}>
                  <div className="list-main"><div className="list-title">{c.name}</div></div>
                  <div className="list-val">{c.pct}%</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}