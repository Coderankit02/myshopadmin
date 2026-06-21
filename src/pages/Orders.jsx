import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { debounce, formatDateTime, statusBadgeClass, statusLabel } from '../lib/utils';
import '../pagestyles/orders.css';

const STATUSES = ['all', 'pending', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled'];

function UpdateStatus({ order, onDone }) {
  const [status, setStatus] = useState(order.status);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const modal = useModal();

  async function save() {
    setBusy(true);
    const { error } = await db
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', order.id);
    setBusy(false);
    if (error) {
      toast.show(`Update nahi hua: ${error.message}`, { type: 'error' });
      return;
    }
    modal.close();
    toast.show('Order status update ho gaya', { type: 'success' });
    onDone();
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div className="f-group">
        <label htmlFor="order-status">New Status</label>
        <select id="order-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.filter((s) => s !== 'all').map((s) => (
            <option key={s} value={s}>{statusLabel(s)}</option>
          ))}
        </select>
      </div>
      <button className="btn-main" style={{ marginTop: 10 }} disabled={busy || status === order.status} onClick={save}>
        Update Status
      </button>
    </div>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [items, setItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const modal = useModal();
  const toast = useToast();

  async function load() {
    setLoading(true);
    let q = db.from('orders').select('*').order('created_at', { ascending: false }).limit(300);
    if (filter !== 'all') q = q.eq('status', filter);
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`order_number.ilike.%${s}%,delivery_name.ilike.%${s}%,delivery_phone.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) {
      toast.show(`Orders load nahi ho paye: ${error.message}`, { type: 'error' });
      setOrders([]);
    } else {
      setOrders(data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, search]);

  const onSearchChange = debounce((value) => setSearch(value), 350);

  async function viewOrder(order) {
    let orderItems = items[order.id];
    if (!orderItems) {
      const { data } = await db.from('order_items').select('*').eq('order_id', order.id);
      orderItems = data || [];
      setItems((prev) => ({ ...prev, [order.id]: orderItems }));
    }

    modal.open({
      title: order.order_number,
      content: (
        <>
          <div className="list-row"><div className="list-main"><div className="list-sub">Customer</div></div><div className="list-val">{order.delivery_name}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Phone</div></div><div className="list-val">{order.delivery_phone}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Address</div></div><div className="list-val" style={{ textAlign: 'right' }}>{[order.delivery_line1, order.delivery_line2, order.delivery_city, order.delivery_pincode].filter(Boolean).join(', ')}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Items</div></div><div className="list-val">{orderItems.length}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Subtotal</div></div><div className="list-val">₹{order.subtotal}</div></div>
          {order.discount > 0 && <div className="list-row"><div className="list-main"><div className="list-sub">Discount</div></div><div className="list-val">−₹{order.discount}</div></div>}
          {order.delivery_charge > 0 && <div className="list-row"><div className="list-main"><div className="list-sub">Delivery Charge</div></div><div className="list-val">₹{order.delivery_charge}</div></div>}
          <div className="list-row"><div className="list-main"><div className="list-sub">Total</div></div><div className="list-val" style={{ fontWeight: 800 }}>₹{order.final_amount}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Payment</div></div><div className="list-val">{order.payment_method?.toUpperCase()} — {order.payment_status}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Date</div></div><div className="list-val">{formatDateTime(order.created_at)}</div></div>

          <div style={{ marginTop: 14 }}>
            {orderItems.map((it) => (
              <div className="list-row" key={it.id}>
                <div className="list-main">
                  <div className="list-title">{it.name} × {it.qty}</div>
                  <div className="list-sub">{it.unit}</div>
                </div>
                <div className="list-val">₹{it.line_total}</div>
              </div>
            ))}
          </div>

          <UpdateStatus order={order} onDone={load} />
        </>
      ),
    });
  }

  function exportCSV() {
    const rows = [['Order ID', 'Customer', 'Phone', 'Total', 'Payment', 'Status', 'Date']];
    orders.forEach((o) => rows.push([o.order_number, o.delivery_name, o.delivery_phone, o.final_amount, o.payment_status, o.status, formatDateTime(o.created_at)]));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'orders-export.csv';
    link.click();
    toast.show('CSV exported', { type: 'success' });
  }

  return (
    <AppLayout title="Orders">
      <div className="section-title">Orders Management</div>
      <div className="section-sub">Saare orders ek jagah — live Supabase data</div>

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`filter-chip ${filter === s ? 'on' : ''}`}
                onClick={() => setFilter(s)}
                aria-pressed={filter === s}
              >
                {s === 'all' ? 'All' : statusLabel(s)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label htmlFor="orders-search" className="sr-only">Search orders</label>
            <input id="orders-search" type="search" placeholder="Order #, name, phone..." onChange={(e) => onSearchChange(e.target.value)} style={{ minHeight: 40 }} />
            <button className="btn-main" onClick={exportCSV}>⬇ Export CSV</button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order ID</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi order nahi mila</td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700 }}>{o.order_number}</td>
                    <td>{o.delivery_name}</td>
                    <td>₹{o.final_amount}</td>
                    <td>{o.payment_status}</td>
                    <td><span className={`badge ${statusBadgeClass(o.status)}`}>{statusLabel(o.status)}</span></td>
                    <td>{formatDateTime(o.created_at)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="act-btn primary" onClick={() => viewOrder(o)}>View</button>
                      </div>
                    </td>
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
