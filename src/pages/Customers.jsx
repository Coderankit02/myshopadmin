import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { formatINR, formatDateTime } from '../lib/utils';
import { audit } from '../lib/audit';
import '../pagestyles/customers.css';

export default function Customers() {
  const modal = useModal();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [highlightId, setHighlightId] = useState(null); // global search deep-link
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

  // Global search deep-link: /customers with state.highlightId aaye to us row ko
  // highlight karke scroll karo (topbar GlobalSearch se).
  // dep `location.state?.highlightId` par depend taaki same-page navigation bhi kaam kare.
  // Scroll tab tak retry karta hai jab tak profiles load na ho jayein.
  useEffect(() => {
    const id = location.state?.highlightId;
    if (!id) return;
    navigate(location.pathname, { replace: true, state: null });
    const t0 = setTimeout(() => setHighlightId(id), 0); // async — lint-safe
    let attempts = 0;
    const t = setInterval(() => {
      attempts += 1;
      if (document.getElementById(`cust-row-${id}`)) {
        document.getElementById(`cust-row-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(t);
      } else if (attempts > 10) {
        clearInterval(t);
      }
    }, 300);
    const t2 = setTimeout(() => setHighlightId(null), 4000);
    return () => { clearTimeout(t0); clearInterval(t); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.highlightId]);

  function viewCustomer(c) {
    const stats = orderStats[c.id] || { orders: 0, spend: 0 };
    // Customer 360 — extra data async load hoti hai (addresses, wishlist,
    // reviews, loyalty points, wallet). Agar table missing ho to graceful skip.
    Promise.all([
      db.from('addresses').select('*').eq('user_id', c.id).order('is_default', { ascending: false }).then(({ data }) => data || []).catch(() => []),
      db.from('wishlist').select('*,products(name)').eq('user_id', c.id).then(({ data }) => data || []).catch(() => []),
      db.from('reviews').select('*,products(name)').eq('user_id', c.id).order('created_at', { ascending: false }).then(({ data }) => data || []).catch(() => []),
      db.from('loyalty_points').select('points').eq('user_id', c.id).maybeSingle().then(({ data }) => data?.points ?? 0).catch(() => 0),
      db.from('wallets').select('balance').eq('user_id', c.id).maybeSingle().then(({ data }) => data?.balance ?? 0).catch(() => 0),
    ]).then(([addresses, wishlist, reviews, loyaltyPoints, walletBalance]) => {
      modal.open({
        title: (c.name || 'Customer'),
        wide: true,
        content: (
          <div className="cust360">
            <div className="list-row"><div className="list-main"><div className="list-sub">Phone</div></div><div className="list-val">{c.phone || '—'}</div></div>
            <div className="list-row"><div className="list-main"><div className="list-sub">Email</div></div><div className="list-val">{c.email || '—'}</div></div>
            <div className="list-row"><div className="list-main"><div className="list-sub">Orders</div></div><div className="list-val">{stats.orders}</div></div>
            <div className="list-row"><div className="list-main"><div className="list-sub">Total Spend</div></div><div className="list-val">₹{formatINR(stats.spend)}</div></div>
            <div className="list-row"><div className="list-main"><div className="list-sub">Joined</div></div><div className="list-val">{formatDateTime(c.created_at)}</div></div>

            <div className="cust360-grid">
              <div className="cust360-box">
                <div className="cust360-title">🎯 Loyalty Points</div>
                <div className="cust360-val">{loyaltyPoints}</div>
              </div>
              <div className="cust360-box">
                <div className="cust360-title">👛 Wallet Balance</div>
                <div className="cust360-val">₹{formatINR(walletBalance)}</div>
              </div>
            </div>

            <div className="cust360-section">
              <div className="cust360-title">📍 Saved Addresses ({addresses.length})</div>
              {addresses.length === 0 ? <div className="cust360-empty">Koi address nahi</div> : addresses.map((a) => (
                <div key={a.id} className="cust360-item">
                  <b>{a.label || 'Address'}</b>{a.is_default ? ' ⭐' : ''}
                  <span>{[a.line1, a.line2, a.city, a.pincode].filter(Boolean).join(', ')}</span>
                </div>
              ))}
            </div>

            <div className="cust360-section">
              <div className="cust360-title">❤️ Wishlist ({wishlist.length})</div>
              {wishlist.length === 0 ? <div className="cust360-empty">Wishlist khaali hai</div> : wishlist.map((w) => (
                <div key={w.id} className="cust360-item">{w.products?.name || 'Product'}</div>
              ))}
            </div>

            <div className="cust360-section">
              <div className="cust360-title">⭐ Reviews ({reviews.length})</div>
              {reviews.length === 0 ? <div className="cust360-empty">Koi review nahi</div> : reviews.map((r) => (
                <div key={r.id} className="cust360-item">
                  <b>{r.products?.name || 'Product'}</b> — {'★'.repeat(r.rating)}
                  <span>{r.comment}</span>
                  <span className={`badge ${r.status === 'approved' ? 'b-delivered' : r.status === 'rejected' ? 'b-cancelled' : 'b-pending'}`} style={{ fontSize: '0.65rem', marginTop: 4 }}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        ),
      });
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
    audit(blocking ? 'customer.block' : 'customer.unblock', 'customer', c.id, { name: c.name });
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
                    <tr
                      key={c.id}
                      id={`cust-row-${c.id}`}
                      style={highlightId === c.id ? { background: 'var(--badge-yellow-bg)', outline: '2px solid var(--yellow)', outlineOffset: -2 } : undefined}
                    >
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
