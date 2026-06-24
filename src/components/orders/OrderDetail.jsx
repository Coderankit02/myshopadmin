/**
 * OrderDetail.jsx — Full order detail page
 * order_items columns: order_id, product_id, name, unit, emoji, category, price, old_price, qty, line_total
 * image_url nahi hoti — emoji use karenge
 */
import { useEffect, useState } from 'react';
import { db } from '../../lib/supabase';
import {
  formatDateTime, statusBadgeClass, statusLabel,
  waLink, buildOrderWhatsAppMessage, mapsLink, timeAgo,
} from '../../lib/utils';
import OrderTimeline from './OrderTimeline';
import OrderInvoice from './OrderInvoice';
import PackingSlip from './PackingSlip';
import { VALID_TRANSITIONS, CANCELLATION_REASONS, RETURN_REASONS } from '../../hooks/useOrders';

const DELIVERY_SLOTS = [
  { value: 'morning',   label: 'Morning · 9 AM – 12 PM' },
  { value: 'afternoon', label: 'Afternoon · 12 PM – 4 PM' },
  { value: 'evening',   label: 'Evening · 4 PM – 8 PM' },
];

export default function OrderDetail({
  order: initialOrder, onClose, updateStatus,
  validTransitions,            // BUG FIX (Minor #9): prop ab actually use hota hai
  markCodCollected, initiateReturn, saveInternalNotes, updateOrderItems,
  onViewCustomerHistory,
}) {
  const [order, setOrder]         = useState(initialOrder);
  const [items, setItems]         = useState([]);
  const [history, setHistory]     = useState([]);
  const [customerProfile, setCustomerProfile] = useState(null); // Feature: customer's profile picture
  const [loadingData, setLoadingData] = useState(true);

  const [newStatus, setNewStatus]         = useState('');
  const [showConfirm, setShowConfirm]     = useState(false);
  const [deliveryPerson, setDeliveryPerson] = useState(initialOrder.delivery_person_name || '');
  const [deliveryNotes, setDeliveryNotes]   = useState(initialOrder.delivery_notes || '');
  const [estDelivery, setEstDelivery]       = useState(initialOrder.estimated_delivery || '');
  const [deliverySlot, setDeliverySlot]     = useState(initialOrder.delivery_slot || '');
  const [cancelReason, setCancelReason]     = useState('');
  const [updating, setUpdating]           = useState(false);

  const [showInvoice, setShowInvoice] = useState(false);
  const [showPackingSlip, setShowPackingSlip] = useState(false);

  // COD collection (Feature)
  const [codAmount, setCodAmount] = useState('');
  const [codSaving, setCodSaving] = useState(false);

  // Return / refund (Feature)
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [returnType, setReturnType] = useState('full');
  const [refundAmount, setRefundAmount] = useState('');
  const [returnSaving, setReturnSaving] = useState(false);

  // Internal admin-only notes (Feature)
  const [internalNotes, setInternalNotes] = useState(initialOrder.internal_notes || '');
  const [notesSaving, setNotesSaving] = useState(false);

  // Edit Order — item qty change / remove (Feature)
  const [editingOrder, setEditingOrder] = useState(false);
  const [draftItems, setDraftItems] = useState([]);
  const [editSaving, setEditSaving] = useState(false);

  // BUG FIX (Minor #9): `validTransitions` prop fallback rakhi hai (agar koi purana
  // caller prop pass na kare), lekin ab prop ko actually priority milti hai — pehle
  // yeh sirf hook se import karke prop ko ignore karta tha.
  const transitions = validTransitions || VALID_TRANSITIONS;
  const allowedNext = transitions[order.status] || [];

  useEffect(() => {
    let active = true;
    async function fetchAll() {
      setLoadingData(true);
      const [itemsRes, histRes, freshOrderRes, profileRes] = await Promise.all([
        db.from('order_items').select('*').eq('order_id', order.id),
        db.from('order_status_history')
          .select('*').eq('order_id', order.id)
          .order('created_at', { ascending: true })
          .limit(20),
        db.from('orders').select('*').eq('id', order.id).single(),
        // Feature: customer's profile picture — comes from the storefront `profiles`
        // table, joined via orders.user_id. Gracefully skipped if no user_id / no
        // avatar_url column yet (guest checkout or older orders).
        order.user_id
          ? db.from('profiles').select('name,avatar_url,email').eq('id', order.user_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (!active) return;
      setItems(itemsRes.data || []);
      setHistory(histRes.data || []);
      if (freshOrderRes.data) setOrder(freshOrderRes.data);
      setCustomerProfile(profileRes?.data || null);
      setLoadingData(false);
    }
    fetchAll();
    return () => { active = false; };
  }, [order.id]);

  async function handleConfirmUpdate() {
    setUpdating(true);
    const updated = await updateStatus(order, newStatus, {
      deliveryPersonName: deliveryPerson,
      deliveryNotes,
      estimatedDelivery: estDelivery,
      deliverySlot: deliverySlot || undefined,
      cancellationReason: newStatus === 'cancelled' ? cancelReason : undefined,
    });
    // BUG FIX (Critical #1): pehle yahan dobara `orders` table query ho ke fresh order
    // fetch hota tha. Ab `updateStatus` khud updated row return karta hai (single round-trip)
    // aur Orders.jsx ke list state ko bhi optimistically patch kar deta hai, isliye list
    // wapas jaane par turant sahi status dikhega — realtime event ka wait nahi karna padta.
    if (updated) {
      setOrder(updated);
      const { data: histData } = await db.from('order_status_history')
        .select('*').eq('order_id', order.id).order('created_at', { ascending: true });
      setHistory(histData || []);
      setNewStatus('');
      setCancelReason('');
      setShowConfirm(false);
    }
    setUpdating(false);
  }

  // BUG FIX (Medium #5): pehle yahan ek hand-rolled `https://wa.me/91${phone}` link tha jo
  // number already +91/91 se shuru hone par "91" dobara jod deta tha (e.g. 919876543210 ->
  // 91919876543210 — invalid link, WhatsApp khulti hi nahi). Ab shared `waLink()` helper use
  // karte hain (src/lib/utils.js) jo digits dekh ke decide karta hai, taaki yeh logic sirf
  // ek jagah maintain ho.
  function openWhatsApp() {
    const link = waLink(order.delivery_phone, buildOrderWhatsAppMessage(order));
    if (link) window.open(link, '_blank', 'noopener');
  }

  const address = [
    order.delivery_line1, order.delivery_line2,
    order.delivery_city,  order.delivery_pincode,
  ].filter(Boolean).join(', ');

  const mapsHref = mapsLink(address || order.delivery_pincode);

  async function handleMarkCod() {
    setCodSaving(true);
    const amt = codAmount === '' ? order.final_amount : Number(codAmount);
    const updated = await markCodCollected(order, amt);
    if (updated) setOrder(updated);
    setCodSaving(false);
  }

  async function handleInitiateReturn() {
    if (!returnReason) return;
    setReturnSaving(true);
    const updated = await initiateReturn(order, {
      reason: returnReason,
      returnType,
      refundAmount: refundAmount === '' ? order.final_amount : Number(refundAmount),
    });
    if (updated) {
      setOrder(updated);
      setShowReturnForm(false);
    }
    setReturnSaving(false);
  }

  async function handleSaveNotes() {
    setNotesSaving(true);
    const updated = await saveInternalNotes(order, internalNotes);
    if (updated) setOrder(updated);
    setNotesSaving(false);
  }

  // Feature: Edit Order — qty change / remove item, then recalc totals.
  const canEditItems = updateOrderItems && ['pending', 'confirmed'].includes(order.status);

  function startEditOrder() {
    setDraftItems(items.map((it) => ({ ...it })));
    setEditingOrder(true);
  }

  function changeDraftQty(id, qty) {
    setDraftItems((prev) => prev.map((it) => (it.id === id ? { ...it, qty: Math.max(0, qty) } : it)));
  }

  function removeDraftItem(id) {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  }

  async function handleSaveOrderEdit() {
    setEditSaving(true);
    const removedIds = items.filter((it) => !draftItems.some((d) => d.id === it.id)).map((it) => it.id);
    const updated = await updateOrderItems(order, draftItems, removedIds);
    if (updated) {
      setOrder(updated);
      setItems(draftItems);
      setEditingOrder(false);
    }
    setEditSaving(false);
  }

  const draftSubtotal = draftItems.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0);

  const isCodPending = order.payment_method === 'cod' && order.payment_status !== 'paid'
    && (order.status === 'delivered' || order.status === 'out_for_delivery');
  const canReturn = allowedNext.includes('returned');

  if (showInvoice) {
    return <OrderInvoice order={order} items={items} onClose={() => setShowInvoice(false)} />;
  }
  if (showPackingSlip) {
    return <PackingSlip order={order} items={items} onClose={() => setShowPackingSlip(false)} />;
  }

  return (
    <div className="ord-detail-page">

      {/* TOP BAR */}
      <div className="od-topbar no-print">
        <button className="btn-ghost od-back-btn" onClick={onClose}>← Back to Orders</button>
        <div className="od-topbar-title">
          <span className="od-order-num">{order.order_number}</span>
          <span className={`badge ${statusBadgeClass(order.status)}`}>{statusLabel(order.status)}</span>
        </div>
        <div className="od-topbar-actions">
          <button className="act-btn od-wa-btn"   onClick={openWhatsApp}>💬 WhatsApp</button>
          <button className="act-btn od-call-btn" onClick={() => { window.location.href = `tel:${order.delivery_phone}`; }}>📞 Call</button>
          <button className="act-btn" onClick={() => setShowPackingSlip(true)}>📃 Packing Slip</button>
          <button className="btn-main"            onClick={() => setShowInvoice(true)}>🧾 Invoice</button>
        </div>
      </div>

      <div className="od-body">

        {/* ── LEFT COLUMN ── */}
        <div className="od-col-left">

          {/* Customer Info */}
          <div className="od-card">
            <div className="od-card-head">👤 Customer Information</div>
            <div className="od-info-grid">
              {/* Feature: customer profile picture */}
              <div className="od-info-item od-info-full" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 52, height: 52, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
                    background: 'var(--light)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontWeight: 700, fontSize: '1.2rem',
                    border: '1.5px solid var(--border)',
                  }}
                >
                  {customerProfile?.avatar_url ? (
                    <img src={customerProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (order.delivery_name?.[0]?.toUpperCase() || '?')}
                </div>
                <div>
                  <div className="od-info-val" style={{ fontWeight: 700 }}>{order.delivery_name || '—'}</div>
                  {customerProfile?.email && (
                    <div className="od-info-val" style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>{customerProfile.email}</div>
                  )}
                </div>
              </div>
              <div className="od-info-item">
                <div className="od-info-label">Mobile</div>
                <div className="od-info-val">
                  <a href={`tel:${order.delivery_phone}`} className="od-phone-link">
                    {order.delivery_phone || '—'}
                  </a>
                </div>
              </div>
              <div className="od-info-item od-info-full">
                <div className="od-info-label">Delivery Address</div>
                <div className="od-info-val">
                  {address || '—'}
                  {/* Feature: address -> Google Maps link */}
                  {mapsHref && (
                    <a href={mapsHref} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 10, fontSize: '0.8rem' }}>
                      🗺️ Open in Maps
                    </a>
                  )}
                </div>
              </div>
              <div className="od-info-item od-info-full">
                {/* Feature: customer order history — one click filters Orders list to this phone number */}
                {onViewCustomerHistory && order.delivery_phone && (
                  <button className="od-link-btn" onClick={() => onViewCustomerHistory(order.delivery_phone)}>
                    📜 Is customer ke saare orders dekho
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Order Info */}
          <div className="od-card">
            <div className="od-card-head">📋 Order Information</div>
            <div className="od-info-grid">
              <div className="od-info-item">
                <div className="od-info-label">Order ID</div>
                <div className="od-info-val od-order-id">{order.order_number}</div>
              </div>
              <div className="od-info-item">
                <div className="od-info-label">Order Date</div>
                <div className="od-info-val">
                  {formatDateTime(order.created_at)}
                  {/* Feature: order age — "2 ghante pehle" style, helps spot urgent orders */}
                  <div className="ord-age-badge">{timeAgo(order.created_at)}</div>
                </div>
              </div>
              <div className="od-info-item">
                <div className="od-info-label">Payment Method</div>
                <div className="od-info-val">{order.payment_method?.toUpperCase() || '—'}</div>
              </div>
              <div className="od-info-item">
                <div className="od-info-label">Payment Status</div>
                <div className="od-info-val">
                  <span className={`badge ${order.payment_status === 'paid' ? 'b-delivered' : 'b-pending'}`}>
                    {order.payment_status || '—'}
                  </span>
                </div>
              </div>
              {order.promo_code && (
                <div className="od-info-item">
                  <div className="od-info-label">Coupon Used</div>
                  <div className="od-info-val" style={{ color: 'var(--primary)' }}>{order.promo_code}</div>
                </div>
              )}
              {order.delivery_person_name && (
                <div className="od-info-item">
                  <div className="od-info-label">Delivery Person</div>
                  <div className="od-info-val">{order.delivery_person_name}</div>
                </div>
              )}
              {order.delivery_slot && (
                <div className="od-info-item">
                  <div className="od-info-label">Delivery Slot</div>
                  <div className="od-info-val">
                    {DELIVERY_SLOTS.find((s) => s.value === order.delivery_slot)?.label || order.delivery_slot}
                  </div>
                </div>
              )}
              {order.estimated_delivery && (
                <div className="od-info-item">
                  <div className="od-info-label">Est. Delivery</div>
                  <div className="od-info-val">{order.estimated_delivery}</div>
                </div>
              )}
              {order.cancellation_reason && (
                <div className="od-info-item">
                  <div className="od-info-label">Cancellation Reason</div>
                  <div className="od-info-val">{order.cancellation_reason}</div>
                </div>
              )}
              {order.status === 'returned' && (
                <>
                  <div className="od-info-item">
                    <div className="od-info-label">Return Reason</div>
                    <div className="od-info-val">{order.return_reason || '—'}</div>
                  </div>
                  <div className="od-info-item">
                    <div className="od-info-label">Return Type</div>
                    <div className="od-info-val">{order.return_type === 'partial' ? 'Partial' : 'Full'}</div>
                  </div>
                  <div className="od-info-item">
                    <div className="od-info-label">Refund Amount</div>
                    <div className="od-info-val">₹{Number(order.refund_amount || 0).toLocaleString('en-IN')}</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Products */}
          <div className="od-card">
            <div className="od-card-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>
                🛒 Order Items
                {!loadingData && <span className="od-items-count">({items.length})</span>}
              </span>
              {/* Feature: Edit Order — item add/remove, amount adjust */}
              {canEditItems && !loadingData && items.length > 0 && (
                editingOrder ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-ghost" disabled={editSaving} onClick={() => setEditingOrder(false)}>Cancel</button>
                    <button className="btn-main" disabled={editSaving} onClick={handleSaveOrderEdit}>
                      {editSaving ? '⏳ Saving…' : '✅ Save Changes'}
                    </button>
                  </div>
                ) : (
                  <button className="btn-ghost" onClick={startEditOrder}>✏️ Edit Order</button>
                )
              )}
            </div>

            {loadingData ? (
              <div className="od-items-loading">
                {[1,2,3].map((i) => (
                  <div key={i} className="skel" style={{ height: 58, marginBottom: 10, borderRadius: 10 }} />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="od-empty-items">⚠️ Items nahi mile — order_items table check karein</div>
            ) : editingOrder ? (
              <div className="od-items-list">
                {draftItems.map((it) => (
                  <div key={it.id} className="od-item-row">
                    <div className="od-item-emoji-wrap">
                      <span className="od-item-emoji">{it.emoji || it.name?.[0]?.toUpperCase() || '?'}</span>
                    </div>
                    <div className="od-item-info">
                      <div className="od-item-name">{it.name}</div>
                      <div className="od-item-meta">
                        {it.unit && <span>{it.unit}</span>}
                        <span>₹{it.price ?? '—'} each</span>
                      </div>
                    </div>
                    <div className="od-item-right" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="number"
                        min={0}
                        value={it.qty}
                        onChange={(e) => changeDraftQty(it.id, Number(e.target.value))}
                        style={{ width: 64 }}
                      />
                      <div className="od-item-total">₹{(Number(it.price || 0) * Number(it.qty || 0)).toLocaleString('en-IN')}</div>
                      <button className="act-btn danger" onClick={() => removeDraftItem(it.id)} title="Item hatao (out of stock)">🗑</button>
                    </div>
                  </div>
                ))}
                {draftItems.length === 0 && (
                  <div className="od-empty-items">Saare items hata diye — kam se kam 1 item rakhein ya order cancel karein.</div>
                )}
                <div className="od-pricing" style={{ marginTop: 10 }}>
                  <div className="od-price-row od-grand">
                    <span>New Subtotal</span>
                    <span>₹{draftSubtotal.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="od-items-list">
                {items.map((it, idx) => (
                  <div key={it.id || idx} className="od-item-row">
                    {/* emoji ya first letter since image_url nahi hoti */}
                    <div className="od-item-emoji-wrap">
                      <span className="od-item-emoji">
                        {it.emoji || it.name?.[0]?.toUpperCase() || '?'}
                      </span>
                    </div>
                    <div className="od-item-info">
                      <div className="od-item-name">{it.name}</div>
                      <div className="od-item-meta">
                        {it.unit && <span>{it.unit}</span>}
                        {it.category && <span className="od-item-cat">{it.category}</span>}
                      </div>
                    </div>
                    <div className="od-item-right">
                      <div className="od-item-qty">× {it.qty}</div>
                      <div className="od-item-price">₹{it.price ?? '—'} each</div>
                      <div className="od-item-total">₹{Number(it.line_total || 0).toLocaleString('en-IN')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pricing */}
            <div className="od-pricing">
              <div className="od-price-row">
                <span>Subtotal</span>
                <span>₹{Number(order.subtotal || 0).toLocaleString('en-IN')}</span>
              </div>
              {Number(order.discount) > 0 && (
                <div className="od-price-row od-discount">
                  <span>Discount {order.promo_code ? `(${order.promo_code})` : ''}</span>
                  <span>− ₹{Number(order.discount).toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="od-price-row">
                <span>Delivery Charge</span>
                <span>
                  {Number(order.delivery_charge) > 0
                    ? `₹${Number(order.delivery_charge).toLocaleString('en-IN')}`
                    : <span className="od-free-tag">FREE</span>
                  }
                </span>
              </div>
              <div className="od-price-row od-grand">
                <span>Grand Total</span>
                <span>₹{Number(order.final_amount || 0).toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Notes */}
            {order.order_notes && (
              <div className="od-notes-block">
                <div className="od-notes-label">📝 Order Notes</div>
                <div className="od-notes-text">{order.order_notes}</div>
              </div>
            )}
            {order.delivery_notes && (
              <div className="od-notes-block">
                <div className="od-notes-label">🚚 Delivery Notes</div>
                <div className="od-notes-text">{order.delivery_notes}</div>
              </div>
            )}
          </div>

          {/* Feature: COD payment collected confirmation */}
          {isCodPending && (
            <div className="od-cod-card">
              <div className="od-card-head" style={{ marginBottom: 8 }}>💰 Mark COD as Collected</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--gray)', marginBottom: 10 }}>
                Delivery boy ne customer se cash le liya? Amount confirm kar ke mark karein.
              </p>
              <div className="od-status-form" style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="f-group" style={{ flex: 1, minWidth: 160 }}>
                  <label>Collected Amount (₹)</label>
                  <input
                    type="number"
                    placeholder={String(order.final_amount || '')}
                    value={codAmount}
                    onChange={(e) => setCodAmount(e.target.value)}
                  />
                </div>
                <button className="btn-main" disabled={codSaving} onClick={handleMarkCod}>
                  {codSaving ? '⏳ Saving…' : '✅ Mark Collected'}
                </button>
              </div>
            </div>
          )}

          {/* Feature: Order return / refund (partial or full) */}
          {canReturn && (
            <div className="od-return-card">
              <div className="od-card-head" style={{ marginBottom: 8 }}>↩️ Order Return</div>
              {!showReturnForm ? (
                <button className="btn-ghost" onClick={() => setShowReturnForm(true)}>Initiate Return</button>
              ) : (
                <div className="od-status-form">
                  <div className="f-group">
                    <label>Return Reason</label>
                    <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                      <option value="">— Choose reason —</option>
                      {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="f-group" style={{ marginTop: 10 }}>
                    <label>Return Type</label>
                    <select value={returnType} onChange={(e) => setReturnType(e.target.value)}>
                      <option value="full">Full Return</option>
                      <option value="partial">Partial Return</option>
                    </select>
                  </div>
                  <div className="f-group" style={{ marginTop: 10 }}>
                    <label>Refund Amount (₹)</label>
                    <input
                      type="number"
                      placeholder={String(order.final_amount || '')}
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                  </div>
                  <div className="modal-actions" style={{ marginTop: 12 }}>
                    <button className="btn-main" disabled={!returnReason || returnSaving} onClick={handleInitiateReturn}>
                      {returnSaving ? '⏳ Saving…' : 'Confirm Return'}
                    </button>
                    <button className="btn-ghost" disabled={returnSaving} onClick={() => setShowReturnForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Feature: Internal admin-only notes — never shown to customer / invoice */}
          <div className="od-notes-card">
            <div className="od-card-head" style={{ marginBottom: 8 }}>🔒 Internal Notes (Admin Only)</div>
            <textarea
              rows={3}
              placeholder="e.g. Is customer ko kal call karo / Replacement dena hai"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
            />
            <div style={{ marginTop: 8 }}>
              <button className="btn-ghost" disabled={notesSaving} onClick={handleSaveNotes}>
                {notesSaving ? 'Saving…' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="od-col-right">

          {/* Timeline */}
          <div className="od-card">
            <div className="od-card-head">📍 Order Timeline</div>
            {loadingData
              ? <div className="skel" style={{ height: 200, borderRadius: 10 }} />
              : <OrderTimeline
                  currentStatus={order.status}
                  history={history}
                  orderCreatedAt={order.created_at}
                />
            }
          </div>

          {/* Status Update */}
          {allowedNext.length > 0 && (
            <div className="od-card">
              <div className="od-card-head">🔄 Update Status</div>

              {!showConfirm ? (
                <div className="od-status-form">
                  <div className="f-group">
                    <label>Select New Status</label>
                    <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                      <option value="">— Choose status —</option>
                      {allowedNext.filter((s) => s !== 'returned').map((s) => (
                        <option key={s} value={s}>{statusLabel(s)}</option>
                      ))}
                    </select>
                  </div>

                  {(newStatus === 'out_for_delivery' || newStatus === 'delivered') && (
                    <>
                      <div className="f-group" style={{ marginTop: 10 }}>
                        <label>Delivery Person Name</label>
                        <input
                          type="text"
                          placeholder="Delivery boy ka naam"
                          value={deliveryPerson}
                          onChange={(e) => setDeliveryPerson(e.target.value)}
                        />
                      </div>
                      {/* Feature: delivery slot / schedule (replaces free-text-only estimate) */}
                      <div className="f-group" style={{ marginTop: 10 }}>
                        <label>Delivery Slot</label>
                        <select value={deliverySlot} onChange={(e) => setDeliverySlot(e.target.value)}>
                          <option value="">— Optional —</option>
                          {DELIVERY_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <div className="f-group" style={{ marginTop: 10 }}>
                        <label>Estimated Delivery Time (free text)</label>
                        <input
                          type="text"
                          placeholder="e.g. Aaj 3:00 PM tak"
                          value={estDelivery}
                          onChange={(e) => setEstDelivery(e.target.value)}
                        />
                      </div>
                      <div className="f-group" style={{ marginTop: 10 }}>
                        <label>Delivery Notes (Optional)</label>
                        <textarea
                          rows={2}
                          placeholder="Koi special delivery instructions"
                          value={deliveryNotes}
                          onChange={(e) => setDeliveryNotes(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* Feature: cancellation reason tracking */}
                  {newStatus === 'cancelled' && (
                    <div className="f-group" style={{ marginTop: 10 }}>
                      <label>Cancellation Reason *</label>
                      <select value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}>
                        <option value="">— Choose reason —</option>
                        {CANCELLATION_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  )}

                  <button
                    className="btn-main"
                    style={{ marginTop: 12, width: '100%' }}
                    disabled={!newStatus || (newStatus === 'cancelled' && !cancelReason)}
                    onClick={() => setShowConfirm(true)}
                  >
                    Update Status →
                  </button>
                </div>
              ) : (
                <div className="od-confirm-box">
                  <div className="od-confirm-msg">Status change karna chahte hain?</div>
                  <div className="od-confirm-arrows">
                    <span className={`badge ${statusBadgeClass(order.status)}`}>{statusLabel(order.status)}</span>
                    <span className="od-arrow">→</span>
                    <span className={`badge ${statusBadgeClass(newStatus)}`}>{statusLabel(newStatus)}</span>
                  </div>
                  <div className="modal-actions" style={{ marginTop: 14 }}>
                    <button className="btn-main" disabled={updating} onClick={handleConfirmUpdate}>
                      {updating ? '⏳ Updating…' : '✅ Haan, Update Karo'}
                    </button>
                    <button className="btn-ghost" disabled={updating}
                      onClick={() => { setShowConfirm(false); setNewStatus(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="od-card od-quick-actions">
            <div className="od-card-head">⚡ Quick Actions</div>
            <div className="od-qa-grid">
              <button className="od-qa-btn od-qa-wa"   onClick={openWhatsApp}>
                <span>💬</span> WhatsApp Customer
              </button>
              <button className="od-qa-btn od-qa-call" onClick={() => { window.location.href = `tel:${order.delivery_phone}`; }}>
                <span>📞</span> Call Customer
              </button>
              <button className="od-qa-btn od-qa-inv"  onClick={() => setShowInvoice(true)}>
                <span>🧾</span> View / Print Invoice
              </button>
              <button className="od-qa-btn" onClick={() => setShowPackingSlip(true)}>
                <span>📃</span> Packing Slip
              </button>
              {mapsHref && (
                <a className="od-qa-btn" href={mapsHref} target="_blank" rel="noopener noreferrer">
                  <span>🗺️</span> Open in Maps
                </a>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
