/**
 * Orders.jsx — Professional Order Management Page
 * - Click any order row to open full detail
 * - Stats dashboard, filters, search, pagination, realtime
 * - Bulk select: bulk status update + bulk WhatsApp (Features)
 * - Order "age" badge, pincode/area filter, customer-history quick filter (Features)
 */
import { useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import {
  debounce, formatDateTime, statusBadgeClass, statusLabel,
  waLink, timeAgo, isOrderAging,
} from '../lib/utils';
import OrderStats from '../components/orders/OrderStats';
import OrderDetail from '../components/orders/OrderDetail';
import { useOrders } from '../hooks/useOrders';
import { requestNotificationPermission } from '../lib/orderAlerts';
import '../pagestyles/orders.css';

const STATUSES = ['all', 'pending', 'confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
const PAYMENTS = ['all', 'cod', 'upi'];
const BULK_TARGET_STATUSES = ['confirmed', 'packed', 'out_for_delivery', 'delivered', 'cancelled'];

// Feature: Bulk WhatsApp — pick a quick template or write a custom one.
// {name} / {order} / {amount} get replaced per-customer.
const WA_TEMPLATES = [
  { label: 'Delivery delay', text: 'Namaste {name}, aapka order {order} thoda late ho raha hai, jaldi deliver hoga. Dhanyavaad! 🙏' },
  { label: 'Out for delivery (area)', text: 'Namaste {name}, aapka order {order} ({amount}) aaj nikal gaya hai delivery ke liye. 🚚' },
  { label: 'Custom message', text: '' },
];

function BulkWhatsAppModal({ selected, onClose }) {
  const [template, setTemplate] = useState(WA_TEMPLATES[0].text);
  const [sentIds, setSentIds] = useState(new Set());

  const links = selected.map((o) => ({
    order: o,
    text: template
      .replaceAll('{name}', o.delivery_name || 'Customer')
      .replaceAll('{order}', o.order_number || '')
      .replaceAll('{amount}', `₹${Number(o.final_amount || 0).toLocaleString('en-IN')}`),
  }));

  function openOne(o, text) {
    const link = waLink(o.delivery_phone, text);
    if (link) window.open(link, '_blank', 'noopener');
    setSentIds((prev) => new Set(prev).add(o.id));
  }

  return (
    <div>
      <div className="f-group">
        <label>Message Template</label>
        <select onChange={(e) => setTemplate(e.target.value)} defaultValue={WA_TEMPLATES[0].text}>
          {WA_TEMPLATES.map((t) => <option key={t.label} value={t.text}>{t.label}</option>)}
        </select>
      </div>
      <div className="f-group" style={{ marginTop: 10 }}>
        <label>Message ({'{name}'} / {'{order}'} / {'{amount}'} chalega)</label>
        <textarea rows={3} value={template} onChange={(e) => setTemplate(e.target.value)} />
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--gray)', marginTop: 10 }}>
        Browser ek-saath kai WhatsApp tabs nahi khulne deta — har customer ke liye neeche "Send"
        dabao, ek-ek WhatsApp tab khulta jayega.
      </p>
      <div className="od-items-list" style={{ marginTop: 10, maxHeight: 280, overflowY: 'auto' }}>
        {links.map(({ order: o, text }) => (
          <div key={o.id} className="od-item-row" style={{ alignItems: 'center' }}>
            <div className="od-item-info">
              <div className="od-item-name">{o.delivery_name} <span style={{ color: 'var(--gray)', fontWeight: 400 }}>· #{o.order_number}</span></div>
              <div className="od-item-meta"><span>{o.delivery_phone}</span></div>
            </div>
            <button
              className={sentIds.has(o.id) ? 'btn-ghost' : 'btn-main'}
              onClick={() => openOne(o, text)}
            >
              {sentIds.has(o.id) ? '✅ Sent' : '💬 Send'}
            </button>
          </div>
        ))}
      </div>
      <div className="modal-actions" style={{ marginTop: 14 }}>
        <button className="btn-ghost" onClick={onClose}>Close ({sentIds.size}/{links.length} sent)</button>
      </div>
    </div>
  );
}

export default function Orders() {
  const {
    orders, total, loading,
    stats, statsLoading,
    filter, setFilter,
    setSearch,
    paymentFilter, setPaymentFilter,
    pincodeFilter, setPincodeFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    page, setPage,
    totalPages,
    updateStatus, bulkUpdateStatus,
    markCodCollected, initiateReturn, saveInternalNotes, updateOrderItems,
    exportCSV, exporting,
    validTransitions,
  } = useOrders();

  const modal = useModal();
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [searchBox, setSearchBox] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notifAsked, setNotifAsked] = useState(false);

  const handleSearchInput = debounce((val) => setSearch(val), 350);

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((prev) =>
      prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))
    );
  }

  const selectedOrders = orders.filter((o) => selectedIds.has(o.id));

  // Feature: Naye order ka browser notification — admin ek baar click karke permission de
  async function handleEnableNotifications() {
    const perm = await requestNotificationPermission();
    setNotifAsked(true);
    if (perm === 'granted') {
      new Notification('🔔 Notifications ON', { body: 'Naya order aate hi aapko pata chal jayega.' });
    }
  }

  // Feature: Bulk status update
  async function handleBulkStatus(newStatus) {
    const confirmed = await modal.confirm({
      title: 'Bulk status update?',
      message: `${selectedOrders.length} order(s) ko "${statusLabel(newStatus)}" mark karna hai?`,
      confirmLabel: 'Haan, Update Karo',
    });
    if (!confirmed) return;
    setBulkBusy(true);
    await bulkUpdateStatus(selectedOrders, newStatus);
    setSelectedIds(new Set());
    setBulkBusy(false);
  }

  function openBulkWhatsApp() {
    modal.open({
      title: `Bulk WhatsApp — ${selectedOrders.length} customer(s)`,
      content: <BulkWhatsAppModal selected={selectedOrders} onClose={() => modal.close()} />,
    });
  }

  // Feature: customer order history — clicking the link in OrderDetail comes back here
  // and filters the list down to just that phone number.
  function handleViewCustomerHistory(phone) {
    setSelectedOrder(null);
    setSearchBox(phone);
    setSearch(phone);
  }

  // If an order is selected, show full detail page
  if (selectedOrder) {
    return (
      <AppLayout title="Order Detail">
        <OrderDetail
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          updateStatus={updateStatus}
          validTransitions={validTransitions}
          markCodCollected={markCodCollected}
          initiateReturn={initiateReturn}
          saveInternalNotes={saveInternalNotes}
          updateOrderItems={updateOrderItems}
          onViewCustomerHistory={handleViewCustomerHistory}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Orders">
      <div className="section-title">Orders Management</div>
      <div className="section-sub" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span>Saare orders ek jagah — live • Real-time updates • {total} total orders</span>
        {!notifAsked && (
          <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={handleEnableNotifications}>
            🔔 Naye order ka notification on karein
          </button>
        )}
      </div>

      {/* ── STATS ── */}
      <OrderStats stats={stats} loading={statsLoading} />

      {/* ── FILTERS ── */}
      <div className="ord-filters-card">
        {/* Status chips */}
        <div className="filter-row">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-chip${filter === s ? ' on' : ''}`}
              onClick={() => setFilter(s)}
              aria-pressed={filter === s}
            >
              {s === 'all' ? 'All' : statusLabel(s)}
            </button>
          ))}
        </div>

        {/* Search + extra filters row */}
        <div className="ord-filter-row2">
          <div className="ord-search-wrap">
            <span className="ord-search-icon">🔍</span>
            <input
              type="search"
              placeholder="Order ID, Name, Phone..."
              className="ord-search-input"
              value={searchBox}
              onChange={(e) => { setSearchBox(e.target.value); handleSearchInput(e.target.value); }}
              aria-label="Search orders"
            />
          </div>

          <select
            className="ord-filter-select"
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            aria-label="Filter by payment"
          >
            <option value="all">💳 All Payments</option>
            {PAYMENTS.filter((p) => p !== 'all').map((p) => (
              <option key={p} value={p}>{p.toUpperCase()}</option>
            ))}
          </select>

          {/* Feature: delivery area / pincode filter */}
          <input
            type="text"
            className="ord-filter-select"
            placeholder="🗺️ Pincode / Area"
            value={pincodeFilter}
            onChange={(e) => setPincodeFilter(e.target.value)}
            style={{ width: 140 }}
            aria-label="Filter by pincode"
          />

          <div className="ord-date-wrap">
            <input
              type="date"
              className="ord-filter-select"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From date"
            />
            <span style={{ color: 'var(--gray)', fontSize: '0.8rem' }}>to</span>
            <input
              type="date"
              className="ord-filter-select"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To date — agar 'From' khaali ho to yeh akela bhi kaam karega"
            />
          </div>

          <button className="btn-ghost ord-export-btn" onClick={exportCSV} disabled={exporting} title="Export CSV (saare pages + items)">
            {exporting ? '⏳ Exporting…' : '⬇ Export'}
          </button>
        </div>
      </div>

      {/* ── BULK ACTION BAR (Feature) ── */}
      {selectedIds.size > 0 && (
        <div className="ord-filters-card" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'var(--light)' }}>
          <strong>{selectedIds.size} selected</strong>
          {BULK_TARGET_STATUSES.map((s) => (
            <button key={s} className="btn-ghost" disabled={bulkBusy} onClick={() => handleBulkStatus(s)}>
              → {statusLabel(s)}
            </button>
          ))}
          <button className="btn-main" disabled={bulkBusy} onClick={openBulkWhatsApp}>💬 Bulk WhatsApp</button>
          <button className="btn-ghost" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      {/* ── ORDERS TABLE ── */}
      <div className="table-wrap ord-table-wrap">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={orders.length > 0 && selectedIds.size === orders.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all orders on this page"
                  />
                </th>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Mobile</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <td key={j}>
                        <div className="skel" style={{ height: 18, borderRadius: 6 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="ord-empty-state">
                      <div className="ord-empty-icon">📦</div>
                      <div className="ord-empty-title">Koi order nahi mila</div>
                      <div className="ord-empty-sub">Filters change karein ya koi naya order aane tak wait karein</div>
                    </div>
                  </td>
                </tr>
              ) : (
                orders.map((o) => (
                  <tr
                    key={o.id}
                    className="ord-row-clickable"
                    onClick={() => setSelectedOrder(o)}
                    title="Click to open order details"
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(o.id)}
                        onChange={(e) => toggleSelect(o.id, e)}
                        aria-label={`Select order ${o.order_number}`}
                      />
                    </td>
                    <td>
                      <span className="ord-id-cell">{o.order_number}</span>
                    </td>
                    <td>
                      <div className="ord-customer-cell">
                        <div className="ord-avatar">{o.delivery_name?.[0] || '?'}</div>
                        <span>{o.delivery_name}</span>
                      </div>
                    </td>
                    <td className="ord-phone-cell">{o.delivery_phone || '—'}</td>
                    <td>
                      <span className="ord-amount-cell">₹{Number(o.final_amount || 0).toLocaleString('en-IN')}</span>
                    </td>
                    <td>
                      <span className="ord-pay-method">{o.payment_method?.toUpperCase() || '—'}</span>
                      <span className={`ord-pay-status ${o.payment_status === 'paid' ? 'paid' : ''}`}>
                        {o.payment_status || '—'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(o.status)}`}>{statusLabel(o.status)}</span>
                    </td>
                    <td className="ord-date-cell">
                      {formatDateTime(o.created_at)}
                      {/* Feature: order age — helps spot which orders are urgent */}
                      <div
                        className="ord-age-badge"
                        style={isOrderAging(o.created_at, o.status) ? { color: 'var(--danger, #E63946)', fontWeight: 700 } : undefined}
                      >
                        {timeAgo(o.created_at)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION ── */}
        {totalPages > 1 && (
          <div className="ord-pagination">
            <button
              className="btn-ghost ord-page-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </button>
            <span className="ord-page-info">
              Page {page} of {totalPages} ({total} orders)
            </span>
            <button
              className="btn-ghost ord-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
