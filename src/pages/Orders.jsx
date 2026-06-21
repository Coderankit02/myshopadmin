import { useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { statusBadgeClass } from '../lib/utils';
import '../pagestyles/orders.css';

const ORDERS = [
  { id: '#RK1042', cust: 'Anjali Sharma', items: 5, total: 842, status: 'Pending', payment: 'Pending Verification', date: '21 Jun, 10:42 AM' },
  { id: '#RK1041', cust: 'Vikram Singh', items: 2, total: 215, status: 'Confirmed', payment: 'Verified', date: '21 Jun, 10:10 AM' },
  { id: '#RK1040', cust: 'Pooja Mehta', items: 8, total: 1340, status: 'Out For Delivery', payment: 'Verified', date: '21 Jun, 9:48 AM' },
  { id: '#RK1039', cust: 'Rahul Verma', items: 3, total: 410, status: 'Delivered', payment: 'Verified', date: '21 Jun, 9:02 AM' },
  { id: '#RK1038', cust: 'Sneha Gupta', items: 1, total: 60, status: 'Cancelled', payment: 'Refunded', date: '20 Jun, 8:30 PM' },
  { id: '#RK1037', cust: 'Karan Joshi', items: 6, total: 990, status: 'Packed', payment: 'Verified', date: '20 Jun, 7:55 PM' },
];

const STATUSES = ['All', 'Pending', 'Confirmed', 'Packed', 'Out For Delivery', 'Delivered', 'Cancelled'];

export default function Orders() {
  const [filter, setFilter] = useState('All');
  const modal = useModal();
  const toast = useToast();

  const filtered = filter === 'All' ? ORDERS : ORDERS.filter((o) => o.status === filter);

  function viewOrder(order) {
    modal.open({
      title: order.id,
      content: (
        <>
          <div className="list-row"><div className="list-main"><div className="list-sub">Customer</div></div><div className="list-val">{order.cust}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Items</div></div><div className="list-val">{order.items}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Total</div></div><div className="list-val">₹{order.total}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Payment</div></div><div className="list-val">{order.payment}</div></div>
          <div className="list-row"><div className="list-main"><div className="list-sub">Date</div></div><div className="list-val">{order.date}</div></div>
        </>
      ),
    });
  }

  function exportCSV() {
    const rows = [['Order ID', 'Customer', 'Items', 'Total', 'Payment', 'Status', 'Date']];
    filtered.forEach((o) => rows.push([o.id, o.cust, o.items, o.total, o.payment, o.status, o.date]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
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
      <div className="section-sub">Saare orders ek jagah — search, filter aur action lein</div>

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            {STATUSES.map((s) => (
              <span key={s} className={`filter-chip ${s === filter ? 'on' : ''}`} onClick={() => setFilter(s)}>
                {s}
              </span>
            ))}
          </div>
          <button className="btn-main" onClick={exportCSV}>
            ⬇ Export CSV
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi order nahi mila</td></tr>
              ) : (
                filtered.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 700 }}>{o.id}</td>
                    <td>{o.cust}</td>
                    <td>{o.items}</td>
                    <td>₹{o.total}</td>
                    <td>{o.payment}</td>
                    <td><span className={`badge ${statusBadgeClass(o.status)}`}>{o.status}</span></td>
                    <td>{o.date}</td>
                    <td>
                      <div className="row-actions">
                        <button className="act-btn primary" onClick={() => viewOrder(o)}>View</button>
                        <button
                          className="act-btn"
                          onClick={() => toast.show('Order status update — hook this up to your orders table when ready.')}
                        >
                          Update
                        </button>
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
