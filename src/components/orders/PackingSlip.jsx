/**
 * PackingSlip.jsx — Compact thermal-printer (58mm/80mm) packing slip.
 * Feature: "Thermal printer / packing slip support" — no fancy design, just
 * items list + address, sized to print cleanly on a narrow thermal roll.
 * BUG FIX: Agar parent se items empty aaye toh khud fetch karta hai.
 */
import { useEffect, useState } from 'react';
import { db } from '../../lib/supabase';
import { formatDateTime } from '../../lib/utils';

export default function PackingSlip({ order, items: propItems = [], onClose }) {
  const [items, setItems] = useState(propItems);
  const [fetchingItems, setFetchingItems] = useState(false);

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

  return (
    <div className="inv-overlay">
      <div className="inv-toolbar no-print">
        <button className="btn-ghost" onClick={onClose}>← Back to Order</button>
        <button className="btn-main" onClick={() => window.print()}>🖨 Print Packing Slip</button>
      </div>

      <div className="pack-slip-paper">
        <div className="pack-slip-center pack-slip-bold">RK Grocery Store</div>
        <div className="pack-slip-center pack-slip-small">Packing Slip</div>
        <div className="pack-slip-hr" />

        <div className="pack-slip-row"><span>Order</span><span className="pack-slip-bold">#{order.order_number}</span></div>
        <div className="pack-slip-row"><span>Date</span><span>{formatDateTime(order.created_at)}</span></div>
        <div className="pack-slip-row"><span>Payment</span><span>{order.payment_method?.toUpperCase() || '—'}</span></div>
        <div className="pack-slip-hr" />

        <div className="pack-slip-bold">{order.delivery_name}</div>
        <div>{order.delivery_phone}</div>
        {address && <div>{address}</div>}
        <div className="pack-slip-hr" />

        {fetchingItems ? (
          <div className="pack-slip-center">⏳ Items load ho rahe hain…</div>
        ) : (
          <table className="pack-slip-table">
            <thead>
              <tr><th>Item</th><th style={{ textAlign: 'center' }}>Qty</th></tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={2} className="pack-slip-center">No items found</td></tr>
              ) : items.map((it, idx) => (
                <tr key={it.id || idx}>
                  <td>{it.name}{it.unit ? ` (${it.unit})` : ''}</td>
                  <td style={{ textAlign: 'center' }}>× {it.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="pack-slip-hr" />
        <div className="pack-slip-row pack-slip-bold"><span>Total Items</span><span>{items.length}</span></div>
        <div className="pack-slip-row pack-slip-bold"><span>Grand Total</span><span>₹{Number(order.final_amount || 0).toLocaleString('en-IN')}</span></div>
        {order.delivery_notes && (
          <>
            <div className="pack-slip-hr" />
            <div>Note: {order.delivery_notes}</div>
          </>
        )}
        <div className="pack-slip-hr" />
        <div className="pack-slip-center pack-slip-small">Thank you! 🙏</div>
      </div>
    </div>
  );
}
