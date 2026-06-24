/**
 * OrderInvoice.jsx — Professional Invoice
 * BUG FIX: Agar parent ne items pass nahi kiye (empty []) toh
 * component khud Supabase se order_items fetch karta hai — blank invoice nahi aayega.
 */
import { useEffect, useState } from 'react';
import { db } from '../../lib/supabase';
import { formatDateTime, statusLabel } from '../../lib/utils';

const SHOP = {
  name:    'RK Grocery Store',
  tagline: 'Fresh • Quality • Doorstep Delivery',
  address: 'Jaunpur, Uttar Pradesh – 222001',
  phone:   '+91 00000 00000',   // ← apna number daalo
  email:   'shop@example.com',  // ← apna email daalo
  gst:     '',
};

export default function OrderInvoice({ order, items: propItems = [], onClose }) {
  const [items, setItems] = useState(propItems);
  const [fetchingItems, setFetchingItems] = useState(false);

  // BUG FIX: Agar parent se items nahi mile (empty array), toh khud fetch karo.
  // Yeh tab hota hai jab Orders list se seedha invoice click kiya jaaye bina
  // OrderDetail ke items load hone ka wait kiye.
  useEffect(() => {
    if (propItems && propItems.length > 0) {
      setItems(propItems);
      return;
    }
    if (!order?.id) return;
    setFetchingItems(true);
    db.from('order_items').select('*').eq('order_id', order.id).then(({ data }) => {
      setItems(data || []);
      setFetchingItems(false);
    });
  }, [order?.id, propItems]);

  const address = [
    order.delivery_line1, order.delivery_line2,
    order.delivery_city, order.delivery_pincode,
  ].filter(Boolean).join(', ');

  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discount || 0);
  const delivery = Number(order.delivery_charge || 0);
  const grand    = Number(order.final_amount || 0);

  return (
    <div className="inv-overlay">
      {/* Toolbar — hidden on print */}
      <div className="inv-toolbar no-print">
        <button className="btn-ghost" onClick={onClose}>← Back to Order</button>
        <button className="btn-main" onClick={() => window.print()}>
          🖨 Print / Download PDF
        </button>
      </div>

      {/* ── INVOICE PAPER ── */}
      <div className="inv-paper">

        {/* HEADER */}
        <div className="inv-header">
          <div className="inv-shop-block">
            <div className="inv-shop-logo">🛒</div>
            <div>
              <div className="inv-shop-name">{SHOP.name}</div>
              <div className="inv-shop-tag">{SHOP.tagline}</div>
              <div className="inv-shop-meta">{SHOP.address}</div>
              <div className="inv-shop-meta">📞 {SHOP.phone}</div>
              <div className="inv-shop-meta">✉ {SHOP.email}</div>
              {SHOP.gst && <div className="inv-shop-meta">GST: {SHOP.gst}</div>}
            </div>
          </div>
          <div className="inv-title-block">
            <div className="inv-title-text">INVOICE</div>
            <div className="inv-order-badge">#{order.order_number}</div>
            <div className="inv-meta-row">
              <span className="inv-meta-label">Date:</span>
              <span>{formatDateTime(order.created_at)}</span>
            </div>
            <div className="inv-meta-row">
              <span className="inv-meta-label">Status:</span>
              <span className="inv-status-badge">{statusLabel(order.status)}</span>
            </div>
          </div>
        </div>

        <div className="inv-divider" />

        {/* SENDER / RECEIVER / PAYMENT */}
        <div className="inv-parties">
          <div className="inv-party-block">
            <div className="inv-party-head">📦 Ship To (Customer)</div>
            <div className="inv-party-name">{order.delivery_name}</div>
            <div className="inv-party-meta">📞 {order.delivery_phone}</div>
            {address && <div className="inv-party-meta">📍 {address}</div>}
          </div>
          <div className="inv-party-block">
            <div className="inv-party-head">🏪 Ship From (Seller)</div>
            <div className="inv-party-name">{SHOP.name}</div>
            <div className="inv-party-meta">{SHOP.address}</div>
            <div className="inv-party-meta">📞 {SHOP.phone}</div>
          </div>
          <div className="inv-party-block">
            <div className="inv-party-head">💳 Payment Info</div>
            <div className="inv-party-meta">
              <b>Method:</b> {order.payment_method?.toUpperCase() || '—'}
            </div>
            <div className="inv-party-meta">
              <b>Status:</b>{' '}
              <span className={`inv-pay-badge${order.payment_status === 'paid' ? ' paid' : ''}`}>
                {order.payment_status || 'pending'}
              </span>
            </div>
            {order.promo_code && (
              <div className="inv-party-meta"><b>Coupon:</b> {order.promo_code}</div>
            )}
          </div>
        </div>

        <div className="inv-divider" />

        {/* PRODUCTS TABLE */}
        <div className="inv-table-head-label">Order Items</div>

        <div className="inv-table-wrap">
        {fetchingItems ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#999' }}>
            ⏳ Items load ho rahe hain…
          </div>
        ) : (
          <table className="inv-table">
            <thead>
              <tr>
                <th className="inv-th" style={{ width: 36 }}>#</th>
                <th className="inv-th">Product</th>
                <th className="inv-th">Category</th>
                <th className="inv-th">Unit</th>
                <th className="inv-th" style={{ textAlign: 'center' }}>Qty</th>
                <th className="inv-th" style={{ textAlign: 'right' }}>Price</th>
                <th className="inv-th" style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="inv-td" style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                    No items found — order_items table mein data check karein
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => {
                  // BUG FIX (Medium #6): qty = 0 hone par divide-by-zero avoid karo
                  const unitPrice = it.price != null
                    ? Number(it.price).toLocaleString('en-IN')
                    : (it.qty > 0 ? (it.line_total / it.qty).toFixed(2) : '—');

                  return (
                    <tr key={it.id || idx} className={idx % 2 === 0 ? 'inv-tr-even' : ''}>
                      <td className="inv-td">{idx + 1}</td>
                      <td className="inv-td inv-td-name">
                        <div className="inv-item-emoji">
                          {it.emoji || it.name?.[0]?.toUpperCase() || '?'}
                        </div>
                        <span className="inv-item-name-text">{it.name}</span>
                      </td>
                      <td className="inv-td inv-td-cat">{it.category || '—'}</td>
                      <td className="inv-td">{it.unit || '—'}</td>
                      <td className="inv-td" style={{ textAlign: 'center', fontWeight: 700 }}>{it.qty}</td>
                      <td className="inv-td" style={{ textAlign: 'right' }}>₹{unitPrice}</td>
                      <td className="inv-td inv-td-total">₹{Number(it.line_total || 0).toLocaleString('en-IN')}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}

        </div>

        {/* TOTALS */}
        <div className="inv-totals-wrap">
          <div className="inv-totals">
            <div className="inv-total-row">
              <span>Subtotal ({items.length} items)</span>
              <span>₹{subtotal.toLocaleString('en-IN')}</span>
            </div>
            {discount > 0 && (
              <div className="inv-total-row inv-discount-row">
                <span>Discount {order.promo_code ? `(${order.promo_code})` : ''}</span>
                <span>− ₹{discount.toLocaleString('en-IN')}</span>
              </div>
            )}
            <div className="inv-total-row">
              <span>Delivery Charge</span>
              <span>
                {delivery > 0
                  ? `₹${delivery.toLocaleString('en-IN')}`
                  : <span className="inv-free-tag">FREE</span>
                }
              </span>
            </div>
            <div className="inv-divider" style={{ margin: '8px 0' }} />
            <div className="inv-total-row inv-grand">
              <span>GRAND TOTAL</span>
              <span>₹{grand.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* NOTES */}
        {(order.order_notes || order.delivery_notes) && (
          <div className="inv-notes-block">
            {order.order_notes    && <div><b>📝 Order Notes:</b> {order.order_notes}</div>}
            {order.delivery_notes && <div style={{ marginTop: 4 }}><b>🚚 Delivery Notes:</b> {order.delivery_notes}</div>}
          </div>
        )}

        {/* FOOTER */}
        <div className="inv-footer">
          <div className="inv-footer-msg">
            🙏 Thank you for shopping with <b>{SHOP.name}</b>!<br />
            We hope to serve you again soon.
          </div>
          <div className="inv-footer-meta">
            This is a computer-generated invoice. No signature required.
          </div>
        </div>

      </div>
    </div>
  );
}