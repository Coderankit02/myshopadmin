import { useEffect, useMemo, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { formatINR, formatDateTime } from '../lib/utils';
import '../pagestyles/customers.css';

export default function Customers() {
  const modal = useModal();
  const toast = useToast();
  const [profiles, setProfiles] = useState([]);
  const [orderStats, setOrderStats] = useState({}); // user_id -> { orders, spend }
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [blockUnsupported, setBlockUnsupported] = useState(false);

  async function load() {
    setLoading(true);
    const { data: profs, error } = await db.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) {
      toast.show(`Customers load nahi ho paye: ${error.message}`, { type: 'error' });
      setProfiles([]);
      setLoading(false);
      return;
    }
    setProfiles(profs || []);

    const { data: orders } = await db.from('orders').select('user_id,final_amount,status');
    const stats = {};
    (orders || []).forEach((o) => {
      if (!o.user_id) return;
      if (!stats[o.user_id]) stats[o.user_id] = { orders: 0, spend: 0 };
      stats[o.user_id].orders += 1;
      if (o.status !== 'cancelled') stats[o.user_id].spend += o.final_amount || 0;
    });
    setOrderStats(stats);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'All') return profiles;
    if (filter === 'Blocked') return profiles.filter((c) => c.is_blocked);
    return profiles.filter((c) => !c.is_blocked);
  }, [profiles, filter]);

  function viewCustomer(c) {
    const stats = orderStats[c.id] || { orders: 0, spend: 0 };
    modal.open({
      title: c.name || 'Customer',
      content: (
        <>
          <div className="list-row"><div className="list-main"><div className="list-sub">Phone</div></div><div className="list-val">{c.phone || '—'}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Email</div></div><div className="list-val">{c.email || '—'}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Orders</div></div><div className="list-val">{stats.orders}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Total Spend</div></div><div className="list-val">₹{formatINR(stats.spend)}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Joined</div></div><div className="list-val">{formatDateTime(c.created_at)}</div></div>
        </>
      ),
    });
  }

  async function toggleBlock(c) {
    const blocking = !c.is_blocked;
    const confirmed = await modal.confirm({
      title: blocking ? 'Block customer?' : 'Unblock customer?',
      message: blocking
        ? `Block ${c.name || 'this customer'} from placing new orders?`
        : `Unblock ${c.name || 'this customer'}?`,
      confirmLabel: blocking ? 'Block' : 'Unblock',
      danger: blocking,
    });
    if (!confirmed) return;

    const { error } = await db.from('profiles').update({ is_blocked: blocking }).eq('id', c.id);
    if (error) {
      // Most likely the is_blocked column hasn't been added yet — see supabase/admin-wiring-migration.sql
      setBlockUnsupported(true);
      toast.show(`Block/unblock nahi hua: ${error.message}`, { type: 'error' });
      return;
    }
    toast.show(blocking ? 'Customer block ho gaya' : 'Customer unblock ho gaya', { type: 'success' });
    load();
  }

  return (
    <AppLayout title="Customers">
      <div className="section-title">Customers Management</div>
      <div className="section-sub">Customer profiles aur unki order history — live Supabase data</div>

      {blockUnsupported && (
        <div className="placeholder-card" style={{ marginBottom: 16 }}>
          <div className="pc-icon">⚠️</div>
          <h4>Block feature setup pending</h4>
          <p>Run <code>supabase/admin-wiring-migration.sql</code> in your Supabase SQL Editor to add the <code>is_blocked</code> column on profiles.</p>
        </div>
      )}

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            {['All', 'Active', 'Blocked'].map((f) => (
              <button key={f} type="button" className={`filter-chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)} aria-pressed={filter === f}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Orders</th><th>Total Spend</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi customer nahi mila</td></tr>
              ) : (
                filtered.map((c) => {
                  const stats = orderStats[c.id] || { orders: 0, spend: 0 };
                  return (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>
                        {c.name || 'Guest'} {c.is_blocked && <span className="badge b-cancelled" style={{ marginLeft: 6 }}>Blocked</span>}
                      </td>
                      <td>{c.phone || '—'}</td>
                      <td>{stats.orders}</td>
                      <td>₹{formatINR(stats.spend)}</td>
                      <td>{formatDateTime(c.created_at)}</td>
                      <td>
                        <div className="row-actions">
                          <button className="act-btn primary" onClick={() => viewCustomer(c)}>View</button>
                          <button className="act-btn danger" onClick={() => toggleBlock(c)}>{c.is_blocked ? 'Unblock' : 'Block'}</button>
                        </div>
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
