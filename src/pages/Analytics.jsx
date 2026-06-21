import { useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { formatDateTime } from '../lib/utils';
import '../pagestyles/analytics.css';

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

export default function Analytics() {
  const toast = useToast();
  const [busyKey, setBusyKey] = useState(null);

  async function run(key, fn) {
    setBusyKey(key);
    try {
      await fn();
      toast.show('Report download ho gaya', { type: 'success' });
    } catch (e) {
      toast.show(`Report nahi bana: ${e.message}`, { type: 'error' });
    } finally {
      setBusyKey(null);
    }
  }

  async function exportSales() {
    const { data, error } = await db.from('orders').select('order_number,delivery_name,final_amount,payment_status,status,created_at').order('created_at', { ascending: false });
    if (error) throw error;
    const rows = [['Order #', 'Customer', 'Amount', 'Payment Status', 'Order Status', 'Date']];
    (data || []).forEach((o) => rows.push([o.order_number, o.delivery_name, o.final_amount, o.payment_status, o.status, formatDateTime(o.created_at)]));
    downloadCSV('sales-report.csv', rows);
  }

  async function exportProducts() {
    const { data, error } = await db.from('order_items').select('name,category,qty,line_total');
    if (error) throw error;
    const map = {};
    (data || []).forEach((it) => {
      if (!map[it.name]) map[it.name] = { category: it.category, qty: 0, revenue: 0 };
      map[it.name].qty += it.qty || 0;
      map[it.name].revenue += it.line_total || 0;
    });
    const rows = [['Product', 'Category', 'Units Sold', 'Revenue']];
    Object.entries(map)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .forEach(([name, v]) => rows.push([name, v.category, v.qty, v.revenue]));
    downloadCSV('product-performance.csv', rows);
  }

  async function exportCustomers() {
    const [{ data: profiles, error: e1 }, { data: orders, error: e2 }] = await Promise.all([
      db.from('profiles').select('id,name,phone,email,created_at'),
      db.from('orders').select('user_id,final_amount,status'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const stats = {};
    (orders || []).forEach((o) => {
      if (!o.user_id) return;
      if (!stats[o.user_id]) stats[o.user_id] = { orders: 0, spend: 0 };
      stats[o.user_id].orders += 1;
      if (o.status !== 'cancelled') stats[o.user_id].spend += o.final_amount || 0;
    });
    const rows = [['Name', 'Phone', 'Email', 'Orders', 'Total Spend', 'Joined']];
    (profiles || []).forEach((c) => {
      const s = stats[c.id] || { orders: 0, spend: 0 };
      rows.push([c.name, c.phone, c.email, s.orders, s.spend, formatDateTime(c.created_at)]);
    });
    downloadCSV('customer-report.csv', rows);
  }

  async function exportInventory() {
    const { data, error } = await db.from('products').select('name,stock_quantity,selling_price,is_active,categories(name)');
    if (error) throw error;
    const rows = [['Product', 'Category', 'Stock', 'Price', 'Status']];
    (data || []).forEach((p) => rows.push([p.name, p.categories?.name || '—', p.stock_quantity ?? 0, p.selling_price, p.is_active ? 'Active' : 'Inactive']));
    downloadCSV('inventory-report.csv', rows);
  }

  const REPORTS = [
    { key: 'sales', icon: '💰', title: 'Sales Report', desc: 'Saare orders, payment status aur revenue', fn: exportSales },
    { key: 'products', icon: '📦', title: 'Product Performance', desc: 'Kaunsa product kitna bika', fn: exportProducts },
    { key: 'customers', icon: '👥', title: 'Customer Report', desc: 'Har customer ka order history aur spend', fn: exportCustomers },
    { key: 'inventory', icon: '📋', title: 'Inventory Report', desc: 'Current stock aur status', fn: exportInventory },
  ];

  return (
    <AppLayout title="Analytics">
      <div className="section-title">Analytics &amp; Reports</div>
      <div className="section-sub">Live Supabase data se reports download karein (CSV — Excel me bhi khulta hai)</div>

      <div className="stat-grid">
        {REPORTS.map((r) => (
          <div className="stat-card" key={r.key}>
            <div className="stat-top"><div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>{r.icon}</div></div>
            <div className="stat-val" style={{ fontSize: '1rem' }}>{r.title}</div>
            <div className="stat-label">{r.desc}</div>
            <button className="btn-main" style={{ marginTop: 14 }} disabled={busyKey === r.key} onClick={() => run(r.key, r.fn)}>
              {busyKey === r.key ? 'Preparing...' : '⬇ Download CSV'}
            </button>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
