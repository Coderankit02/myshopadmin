import { useCallback, useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { formatDateTime, formatINR } from '../lib/utils';
import '../pagestyles/analytics.css';

/* ── Download helpers — CSV / Excel / PDF ────────────────────────────────── */

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

/** Excel (.xls) — HTML table format, Excel mein khulta hai. */
function downloadExcel(filename, headers, rows) {
  const thead = `<tr>${headers.map((h) => `<th style="background:#1BA672;color:#fff;padding:8px 12px;border:1px solid #ddd">${h}</th>`).join('')}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px 12px;border:1px solid #ddd">${String(c ?? '')}</td>`).join('')}</tr>`).join('');
  const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"/></head><body><table>${thead}${tbody}</table></body></html>`;
  const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

/** PDF — print-friendly window (browser print → Save as PDF). */
function downloadPDF(title, headers, rows) {
  const w = window.open('', '_blank');
  if (!w) return;
  const thead = `<tr>${headers.map((h) => `<th style="background:#1BA672;color:#fff;padding:8px 12px;border:1px solid #ddd;text-align:left">${h}</th>`).join('')}</tr>`;
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td style="padding:6px 12px;border:1px solid #ddd">${String(c ?? '')}</td>`).join('')}</tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
    <style>body{font-family:Inter,Arial,sans-serif;padding:24px;color:#222}h1{font-size:18px;margin-bottom:2px}
    .sub{color:#666;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12px}</style></head>
    <body><h1>${title}</h1><div class="sub">RK Grocery Mart — ${new Date().toLocaleString('en-IN')}</div>
    <table>${thead}${tbody}</table><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
  w.document.close();
}

/* ── Date-range presets ──────────────────────────────────────────────────── */

const RANGES = [
  { key: 'today',    label: 'Today' },
  { key: '7d',       label: 'Last 7 Days' },
  { key: '30d',      label: 'Last 30 Days' },
  { key: '90d',      label: 'Last 90 Days' },
  { key: 'custom',   label: 'Custom' },
  { key: 'all',      label: 'All Time' },
];

/** Returns { fromISO } for a preset key + optional custom dates. */
function rangeFilter(key, customFrom, customTo) {
  const now = new Date();
  if (key === 'custom') {
    if (!customFrom) return null;
    const from = new Date(customFrom + 'T00:00:00');
    if (customTo) {
      const to = new Date(customTo + 'T23:59:59');
      return { fromISO: from.toISOString(), toISO: to.toISOString() };
    }
    return { fromISO: from.toISOString() };
  }
  if (key === 'today') {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return { fromISO: d.toISOString() };
  }
  const days = { '7d': 7, '30d': 30, '90d': 90 }[key];
  if (!days) return null; // 'all'
  return { fromISO: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString() };
}

function rangeLabel(key, customFrom, customTo) {
  if (key === 'custom' && customFrom) {
    return customTo ? `${customFrom} → ${customTo}` : `from ${customFrom}`;
  }
  return RANGES.find((r) => r.key === key)?.label || 'All Time';
}

function fmt(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/* ── Report builders — sab live Supabase data se ─────────────────────────── */
// Har builder => { headers, rows, stats, filename }

async function buildSales(range) {
  let q = db.from('orders').select('order_number,delivery_name,final_amount,payment_status,status,created_at').order('created_at', { ascending: false });
  if (range?.fromISO) q = q.gte('created_at', range.fromISO);
  if (range?.toISO) q = q.lte('created_at', range.toISO);
  const { data, error } = await q;
  if (error) throw error;

  const orders = data || [];
  const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + (o.final_amount || 0), 0);
  const paid = orders.filter((o) => o.payment_status === 'paid').length;
  const cod = orders.filter((o) => o.payment_status === 'cod').length;

  const headers = ['Order #', 'Customer', 'Amount (₹)', 'Payment Status', 'Order Status', 'Date'];
  const rows = orders.map((o) => [o.order_number, o.delivery_name, o.final_amount, o.payment_status, o.status, formatDateTime(o.created_at)]);
  const stats = [
    { icon: '🧾', color: '#3B82F6', label: 'Orders', val: String(orders.length) },
    { icon: '💰', color: '#1BA672', label: 'Revenue', val: `₹${formatINR(revenue)}` },
    { icon: '✅', color: '#8B5CF6', label: 'Paid', val: String(paid) },
    { icon: '💵', color: '#FFB800', label: 'COD', val: String(cod) },
    { icon: '📈', color: '#E63946', label: 'Avg Order', val: orders.length ? `₹${formatINR(fmt(revenue / orders.length))}` : '—' },
  ];
  return { headers, rows, stats, filename: 'sales-report' };
}

async function buildProducts(range) {
  let q = db.from('order_items').select('product_id,name,category,qty,line_total,orders!inner(created_at)').limit(5000);
  if (range?.fromISO) q = q.gte('orders.created_at', range.fromISO);
  if (range?.toISO) q = q.lte('orders.created_at', range.toISO);
  const { data, error } = await q;
  if (error) throw error;

  const map = {};
  (data || []).forEach((it) => {
    if (!map[it.name]) map[it.name] = { category: it.category, qty: 0, revenue: 0 };
    map[it.name].qty += it.qty || 0;
    map[it.name].revenue += it.line_total || 0;
  });
  const entries = Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  const headers = ['Product', 'Category', 'Units Sold', 'Revenue (₹)'];
  const rows = entries.map(([name, v]) => [name, v.category, v.qty, fmt(v.revenue)]);
  const totalQty = entries.reduce((s, [, v]) => s + v.qty, 0);
  const totalRev = entries.reduce((s, [, v]) => s + v.revenue, 0);
  const stats = [
    { icon: '📦', color: '#3B82F6', label: 'Products Sold', val: String(entries.length) },
    { icon: '🔢', color: '#1BA672', label: 'Units Sold', val: String(totalQty) },
    { icon: '💰', color: '#FFB800', label: 'Revenue', val: `₹${formatINR(totalRev)}` },
    { icon: '🏆', color: '#8B5CF6', label: 'Top Seller', val: entries[0]?.[0] || '—' },
  ];
  return { headers, rows, stats, filename: 'product-performance' };
}

async function buildCustomers(range) {
  const [profilesRes, ordersRes] = await Promise.all([
    db.from('profiles').select('id,name,phone,email,created_at'),
    (() => {
      let q = db.from('orders').select('user_id,final_amount,status');
      if (range?.fromISO) q = q.gte('created_at', range.fromISO);
      if (range?.toISO) q = q.lte('created_at', range.toISO);
      return q;
    })(),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (ordersRes.error) throw ordersRes.error;

  const stats = {};
  (ordersRes.data || []).forEach((o) => {
    if (!o.user_id) return;
    if (!stats[o.user_id]) stats[o.user_id] = { orders: 0, spend: 0 };
    stats[o.user_id].orders += 1;
    if (o.status !== 'cancelled') stats[o.user_id].spend += o.final_amount || 0;
  });

  const headers = ['Name', 'Phone', 'Email', 'Orders', 'Total Spend (₹)', 'Joined'];
  const rows = (profilesRes.data || []).map((c) => {
    const s = stats[c.id] || { orders: 0, spend: 0 };
    return [c.name || 'Guest', c.phone || '—', c.email || '—', s.orders, fmt(s.spend), formatDateTime(c.created_at)];
  });

  const active = rows.filter((r) => r[3] > 0);
  const totalSpend = active.reduce((s, r) => s + r[4], 0);
  const statsCards = [
    { icon: '👥', color: '#3B82F6', label: 'Customers', val: String(rows.length) },
    { icon: '🛍️', color: '#1BA672', label: 'Active (ordered)', val: String(active.length) },
    { icon: '💰', color: '#FFB800', label: 'Total Spend', val: `₹${formatINR(totalSpend)}` },
    { icon: '📈', color: '#8B5CF6', label: 'Avg / Customer', val: active.length ? `₹${formatINR(fmt(totalSpend / active.length))}` : '—' },
  ];
  return { headers, rows, stats: statsCards, filename: 'customer-report' };
}

async function buildInventory() {
  const { data, error } = await db.from('products').select('name,stock_quantity,selling_price,cost_price,is_active,categories(name)');
  if (error) throw error;

  const headers = ['Product', 'Category', 'Stock', 'Price (₹)', 'Cost (₹)', 'Value (₹)', 'Status'];
  const rows = (data || []).map((p) => [
    p.name, p.categories?.name || '—', p.stock_quantity ?? 0,
    p.selling_price, p.cost_price ?? 0,
    fmt((p.stock_quantity ?? 0) * (p.cost_price ?? 0)),
    p.is_active ? 'Active' : 'Inactive',
  ]);

  const low = (data || []).filter((p) => (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) < 20);
  const out = (data || []).filter((p) => (p.stock_quantity ?? 0) <= 0);
  const stockValue = (data || []).reduce((s, p) => s + (p.stock_quantity ?? 0) * (p.cost_price ?? 0), 0);
  const stats = [
    { icon: '📦', color: '#3B82F6', label: 'Total SKUs', val: String((data || []).length) },
    { icon: '⚠️', color: '#FFB800', label: 'Low Stock', val: String(low.length) },
    { icon: '🚫', color: '#E63946', label: 'Out of Stock', val: String(out.length) },
    { icon: '🏷️', color: '#1BA672', label: 'Stock Value', val: `₹${formatINR(stockValue)}` },
  ];
  return { headers, rows, stats, filename: 'inventory-report' };
}

async function buildTax(range) {
  let q = db.from('order_items').select('product_id,name,qty,line_total,products(gst_percent),orders!inner(created_at)').limit(5000);
  if (range?.fromISO) q = q.gte('orders.created_at', range.fromISO);
  if (range?.toISO) q = q.lte('orders.created_at', range.toISO);
  const { data, error } = await q;
  if (error) throw error;

  const map = {};
  (data || []).forEach((it) => {
    if (!map[it.name]) map[it.name] = { qty: 0, taxable: 0, gstPct: Number(it.products?.gst_percent) || 0 };
    const m = map[it.name];
    const rate = Number(it.products?.gst_percent) || m.gstPct;
    m.gstPct = rate;
    m.qty += it.qty || 0;
    const line = Number(it.line_total) || 0;
    const base = rate > 0 ? (line * 100) / (100 + rate) : line;
    m.taxable += base;
  });

  const headers = ['Product', 'Qty', 'Taxable Value (₹)', 'GST %', 'GST Amount (₹)'];
  const rows = Object.entries(map)
    .map(([name, m]) => [name, m.qty, fmt(m.taxable), m.gstPct, fmt((m.taxable * m.gstPct) / 100)])
    .sort((a, b) => b[4] - a[4]);

  const totalTax = rows.reduce((s, r) => s + r[4], 0);
  const totalTaxable = rows.reduce((s, r) => s + r[2], 0);
  const stats = [
    { icon: '🧾', color: '#3B82F6', label: 'Taxable Value', val: `₹${formatINR(totalTaxable)}` },
    { icon: '💸', color: '#E63946', label: 'Total GST', val: `₹${formatINR(totalTax)}` },
    { icon: '🏷️', color: '#1BA672', label: 'GST Slabs', val: String(new Set(Object.values(map).map((m) => m.gstPct)).size) },
    { icon: '📦', color: '#FFB800', label: 'Items', val: String(rows.length) },
  ];
  return { headers, rows, stats, filename: 'tax-report' };
}

async function buildProfit(range) {
  let q = db.from('order_items').select('product_id,name,qty,line_total,products(cost_price,selling_price),orders!inner(created_at)').limit(5000);
  if (range?.fromISO) q = q.gte('orders.created_at', range.fromISO);
  if (range?.toISO) q = q.lte('orders.created_at', range.toISO);
  const { data, error } = await q;
  if (error) throw error;

  const map = {};
  (data || []).forEach((it) => {
    if (!map[it.name]) map[it.name] = { qty: 0, revenue: 0, cost: 0 };
    const m = map[it.name];
    m.qty += it.qty || 0;
    m.revenue += Number(it.line_total) || 0;
    m.cost += (Number(it.products?.cost_price) || 0) * (it.qty || 0);
  });

  const headers = ['Product', 'Qty Sold', 'Revenue (₹)', 'Cost (₹)', 'Profit (₹)', 'Margin %'];
  const rows = Object.entries(map)
    .map(([name, m]) => {
      const profit = fmt(m.revenue - m.cost);
      const margin = m.revenue > 0 ? Math.round((profit / m.revenue) * 100) : 0;
      return [name, m.qty, fmt(m.revenue), fmt(m.cost), profit, margin];
    })
    .sort((a, b) => b[4] - a[4]);

  const totalRevenue = rows.reduce((s, r) => s + r[2], 0);
  const totalCost = rows.reduce((s, r) => s + r[3], 0);
  const totalProfit = rows.reduce((s, r) => s + r[4], 0);
  const margin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
  const stats = [
    { icon: '💰', color: '#1BA672', label: 'Revenue', val: `₹${formatINR(totalRevenue)}` },
    { icon: '📉', color: '#E63946', label: 'Cost', val: `₹${formatINR(totalCost)}` },
    { icon: '📈', color: '#3B82F6', label: 'Profit', val: `₹${formatINR(totalProfit)}` },
    { icon: '🎯', color: '#FFB800', label: 'Margin', val: `${margin}%` },
  ];
  return { headers, rows, stats, filename: 'profit-report' };
}

/* ── Report definitions ──────────────────────────────────────────────────── */

const REPORTS = [
  { key: 'sales',     icon: '💰', title: 'Sales Report',          desc: 'Orders, revenue, payment split',            build: buildSales },
  { key: 'products',  icon: '📦', title: 'Product Performance',   desc: 'Kaunsa product kitna bika',                 build: buildProducts },
  { key: 'customers', icon: '👥', title: 'Customer Report',       desc: 'Har customer ka spend aur order count',     build: buildCustomers },
  { key: 'inventory', icon: '📋', title: 'Inventory Report',      desc: 'Stock, price, cost aur stock value',        build: buildInventory },
  { key: 'tax',       icon: '🧾', title: 'Tax Report (GST)',      desc: 'Per product GST breakdown',                 build: buildTax },
  { key: 'profit',    icon: '📈', title: 'Profit Report',         desc: 'Revenue − cost, margin ke saath',           build: buildProfit },
];

/* ── Main Reports page ───────────────────────────────────────────────────── */

export default function Analytics() {
  const toast = useToast();
  const [reportKey, setReportKey] = useState('sales');
  const [rangeKey, setRangeKey] = useState('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyExport, setBusyExport] = useState(false);
  const [result, setResult] = useState(null); // { headers, rows, stats, filename }
  const [error, setError] = useState(null);

  const report = REPORTS.find((r) => r.key === reportKey) || REPORTS[0];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = rangeFilter(rangeKey, customFrom, customTo);
      const res = await report.build(range);
      setResult(res);
    } catch (e) {
      setError(e.message || 'Report nahi bana');
      setResult(null);
    }
    setLoading(false);
  }, [rangeKey, customFrom, customTo, report]);

  // Race guard: agar user ne report/range quickly switch kiya, purani in-flight
  // request ka result nayi request ke baad overwrite nahi karega.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data-fetching effect, repo-wide convention
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const range = rangeFilter(rangeKey, customFrom, customTo);
        const res = await report.build(range);
        if (!cancelled) setResult(res);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Report nahi bana');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [report, rangeKey, customFrom, customTo]);

  function doExport(fmt) {
    if (!result) return;
    setBusyExport(true);
    try {
      if (fmt === 'xls') downloadExcel(`${result.filename}-${rangeKey}.xls`, result.headers, result.rows);
      else if (fmt === 'pdf') downloadPDF(`${result.filename} (${rangeLabel(rangeKey, customFrom, customTo)})`, result.headers, result.rows);
      else downloadCSV(`${result.filename}-${rangeKey}.csv`, result.rows);
      toast.show(`${report.title} export ho gaya (${fmt.toUpperCase()})`, { type: 'success' });
    } catch (e) {
      toast.show(`Export nahi hua: ${e.message}`, { type: 'error' });
    }
    setBusyExport(false);
  }

  const rowCount = result?.rows?.length || 0;
  const PREVIEW_CAP = 200;
  const previewRows = result?.rows?.slice(0, PREVIEW_CAP) || [];

  return (
    <AppLayout title="Reports">
      <div className="section-title">Reports &amp; Analytics</div>
      <div className="section-sub">
        Live Supabase data se reports dekhein aur download karein — CSV, Excel (.xls) aur PDF (print) mein
      </div>

      {/* Report type tabs */}
      <div className="filter-row" style={{ marginBottom: 16 }} role="tablist" aria-label="Report type">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={reportKey === r.key}
            className={`filter-chip${reportKey === r.key ? ' on' : ''}`}
            onClick={() => setReportKey(r.key)}
          >
            {r.icon} {r.title}
          </button>
        ))}
      </div>

      {/* Date range bar */}
      <div className="rp-rangebar">
        <div className="filter-row">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              className={`filter-chip${rangeKey === r.key ? ' on' : ''}`}
              onClick={() => setRangeKey(r.key)}
              aria-pressed={rangeKey === r.key}
            >
              {r.label}
            </button>
          ))}
        </div>
        {rangeKey === 'custom' && (
          <div className="rp-custom">
            <label>
              <span>From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>
              <span>To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
            <button className="btn-main" style={{ minHeight: 40, padding: '8px 16px' }} onClick={load}>Apply</button>
          </div>
        )}
        <span className="rp-range-label">
          {report.icon} {report.title} · {rangeLabel(rangeKey, customFrom, customTo)}
        </span>
      </div>

      {/* Summary stats strip */}
      <div className="stat-grid" aria-busy={loading}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div className="stat-card" key={i}><div className="skel" style={{ height: 70 }} aria-hidden="true" /></div>
            ))
          : (result?.stats || []).map((s, i) => (
              <div className="stat-card" key={i}>
                <div className="stat-top"><div className="stat-icon" style={{ background: s.color + '22', color: s.color }}>{s.icon}</div></div>
                <div className="stat-val" style={{ fontSize: '1.25rem' }}>{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            ))}
      </div>

      {/* Preview table + exports */}
      <div className="table-wrap">
        <div className="table-head">
          <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
            {report.title} — Preview
            <span style={{ color: 'var(--gray)', fontWeight: 500 }}>
              · {rowCount} rows{rowCount > PREVIEW_CAP ? ` (pehle ${PREVIEW_CAP} dikha rahe hain)` : ''}
            </span>
          </h3>
          <div className="row-actions">
            {['CSV', 'Excel', 'PDF'].map((fmt) => (
              <button
                key={fmt}
                className="act-btn primary"
                disabled={busyExport || loading || rowCount === 0}
                onClick={() => doExport(fmt.toLowerCase())}
              >
                {busyExport ? '...' : `⬇ ${fmt}`}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <div className="placeholder-card" style={{ margin: 16 }}>
            <div className="pc-icon">⚠️</div>
            <h4>Report load nahi hui</h4>
            <p>{error}</p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {(result?.headers || []).map((h, i) => <th key={i}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={result?.headers?.length || 5}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
                ) : rowCount === 0 ? (
                  <tr><td colSpan={result?.headers?.length || 5} style={{ textAlign: 'center', color: 'var(--gray)' }}>Is period mein koi data nahi mila</td></tr>
                ) : (
                  previewRows.map((r, i) => (
                    <tr key={i}>
                      {r.map((c, j) => <td key={j}>{c}</td>)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
