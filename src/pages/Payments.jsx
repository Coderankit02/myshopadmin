import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { debounce, formatDateTime } from '../lib/utils';
import '../pagestyles/payments.css';

const FILTERS = ['all', 'pending', 'paid', 'rejected'];

function PendingActions({ item, onDone }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const modal = useModal();

  async function approve() {
    setBusy(true);
    const { error: e1 } = await db
      .from('payment_verifications')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (e1) {
      setBusy(false);
      toast.show(`Payment approve nahi hua: ${e1.message}`, { type: 'error' });
      return;
    }
    // BUG FIX (Medium #10): pehle order-update ki error silently ignore ho jaati thi —
    // payment_verifications 'paid' ho jaata tha par order 'confirmed' nahi hota tha aur
    // admin ko pata bhi nahi chalta tha. Ab error explicitly check + toast karte hain.
    const { error: e2 } = await db
      .from('orders')
      .update({ status: 'confirmed', payment_status: 'paid', updated_at: new Date().toISOString() })
      .eq('id', item.order_id);
    setBusy(false);
    if (e2) {
      toast.show(`Payment approve ho gaya, par order update nahi hua: ${e2.message}`, { type: 'error' });
      onDone();
      return;
    }
    modal.close();
    toast.show('Payment approved, order confirmed', { type: 'success' });
    onDone();
  }

  async function reject() {
    setBusy(true);
    const { error: e1 } = await db
      .from('payment_verifications')
      .update({ status: 'rejected', admin_note: reason, updated_at: new Date().toISOString() })
      .eq('id', item.id);
    if (e1) {
      setBusy(false);
      toast.show(`Reject nahi hua: ${e1.message}`, { type: 'error' });
      return;
    }
    // BUG FIX (Medium #10): pehle order ka status/payment_status reject hone par bilkul
    // touch nahi hota tha — customer ko apne order page par koi clear "rejected, resubmit
    // karein" signal nahi milta tha. Ab order.payment_status ko bhi 'rejected' set karte
    // hain (order.status pending hi rehta hai taaki customer dobara payment submit kar sake).
    const { error: e2 } = await db
      .from('orders')
      .update({ payment_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', item.order_id);
    setBusy(false);
    if (e2) {
      toast.show(`Payment reject ho gaya, par order update nahi hua: ${e2.message}`, { type: 'error' });
      onDone();
      return;
    }
    modal.close();
    toast.show('Payment rejected', { type: 'success' });
    onDone();
  }

  if (rejecting) {
    return (
      <div style={{ marginTop: 14 }}>
        <textarea
          style={{ width: '100%', background: 'var(--page-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 16 }}
          rows={2}
          placeholder="Reject karne ki wajah (optional)"
          aria-label="Reason for rejecting payment (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button className="btn-main" style={{ marginTop: 10, background: 'var(--red)' }} disabled={busy} onClick={reject}>
          Reject Confirm Karein
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
      <button className="btn-main" disabled={busy} onClick={approve}>✅ Approve</button>
      <button className="btn-ghost" onClick={() => setRejecting(true)}>❌ Reject</button>
    </div>
  );
}

export default function Payments() {
  const [list, setList] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [stats, setStats] = useState({ pending: 0, paid: 0, rejected: 0 });
  const modal = useModal();

  async function load() {
    setLoadingList(true);
    let q = db.from('payment_verifications').select('*').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`utr.ilike.%${s}%,order_number.ilike.%${s}%,mobile.ilike.%${s}%,customer_name.ilike.%${s}%`);
    }
    const { data, error } = await q;
    setList(!error && data ? data : []);
    setLoadingList(false);
  }

  async function loadStats() {
    const { data } = await db.from('payment_verifications').select('status').limit(1000);
    const c = { pending: 0, paid: 0, rejected: 0 };
    (data || []).forEach((r) => {
      if (c[r.status] !== undefined) c[r.status]++;
    });
    setStats(c);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  useEffect(() => {
    loadStats();
  }, []);

  const onSearchChange = debounce((value) => setSearch(value), 350);

  function openDetail(item) {
    modal.open({
      title: 'Payment Request',
      content: (
        <>
          {item.screenshot_url ? (
            <img src={item.screenshot_url} alt={`Payment screenshot submitted by ${item.customer_name || 'customer'}`} style={{ width: '100%', borderRadius: 12, marginBottom: 14 }} />
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--gray)', marginBottom: 14 }}>
              Screenshot upload nahi hua
            </div>
          )}
          <div className="list-row"><div className="list-main"><div className="list-sub">Customer</div></div><div className="list-val">{item.customer_name}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Mobile</div></div><div className="list-val">{item.mobile}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Order ID</div></div><div className="list-val">{item.order_number || '—'}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">UTR</div></div><div className="list-val">{item.utr}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Amount</div></div><div className="list-val">₹{item.amount ?? '—'}</div></div>
          {item.status === 'pending' ? (
            <PendingActions
              item={item}
              onDone={() => {
                load();
                loadStats();
              }}
            />
          ) : (
            <div style={{ marginTop: 14, fontWeight: 700, color: item.status === 'paid' ? 'var(--primary)' : 'var(--red)' }}>
              {item.status === 'paid' ? '✅ Approved — Order Confirmed' : `❌ Rejected ${item.admin_note ? '— ' + item.admin_note : ''}`}
            </div>
          )}
        </>
      ),
    });
  }

  return (
    <AppLayout title="Payments">
      <div className="section-title">Payments Management</div>
      <div className="section-sub">Static QR payment verification queue — live Supabase data</div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#FFB80022', color: '#FFB800' }}>⏳</div></div>
          <div className="stat-val">{stats.pending}</div><div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#1BA67222', color: '#1BA672' }}>✅</div></div>
          <div className="stat-val">{stats.paid}</div><div className="stat-label">Paid / Verified</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#E6394622', color: '#E63946' }}>🚫</div></div>
          <div className="stat-val">{stats.rejected}</div><div className="stat-label">Rejected</div>
        </div>
        <div className="stat-card">
          <div className="stat-top"><div className="stat-icon" style={{ background: '#3B82F622', color: '#3B82F6' }}>💰</div></div>
          <div className="stat-val">{stats.pending + stats.paid + stats.rejected}</div><div className="stat-label">Total Requests</div>
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            {FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                className={`filter-chip ${filter === s ? 'on' : ''}`}
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="tb-search pay-search" role="search">
            <span aria-hidden="true">🔍</span>
            <label htmlFor="payments-search" className="sr-only">Search by UTR, Order ID, or Name</label>
            <input id="payments-search" type="search" placeholder="UTR, Order ID, Name..." onChange={(e) => onSearchChange(e.target.value)} />
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>UTR</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {loadingList ? (
                <tr><td colSpan={7}><div className="skel" style={{ height: 20 }} aria-hidden="true" /><span className="sr-only">Loading payments…</span></td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi payment request nahi mili</td></tr>
              ) : (
                list.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 700 }}>#{item.order_number || '—'}</td>
                    <td>{item.customer_name}</td>
                    <td>₹{item.amount ?? '—'}</td>
                    <td>{item.utr}</td>
                    <td>{formatDateTime(item.created_at)}</td>
                    <td><span className={`badge ${item.status === 'paid' ? 'b-delivered' : item.status === 'rejected' ? 'b-cancelled' : 'b-pending'}`}>{item.status}</span></td>
                    <td><button className="act-btn primary" onClick={() => openDetail(item)}>View</button></td>
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