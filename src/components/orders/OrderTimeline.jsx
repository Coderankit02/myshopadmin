/**
 * OrderTimeline.jsx — Visual timeline of order status steps
 */
import { formatDateTime } from '../../lib/utils';

const STEPS = [
  { key: 'pending',          label: 'Order Placed',     icon: '🛒' },
  { key: 'confirmed',        label: 'Confirmed',        icon: '✅' },
  { key: 'packed',           label: 'Packed',           icon: '📦' },
  { key: 'out_for_delivery', label: 'Out For Delivery', icon: '🚚' },
  { key: 'delivered',        label: 'Delivered',        icon: '🎉' },
];
const STATUS_ORDER = STEPS.map((s) => s.key);

export default function OrderTimeline({ currentStatus, history = [], orderCreatedAt }) {
  const currentIdx  = STATUS_ORDER.indexOf(currentStatus);
  const isCancelled = currentStatus === 'cancelled';

  // Build timestamp map from history
  const tsMap = {};
  (history || []).forEach((h) => { tsMap[h.status] = h.created_at; });
  // Always show order placed time from order itself
  if (orderCreatedAt) tsMap['pending'] = orderCreatedAt;

  if (isCancelled) {
    return (
      <div className="ord-timeline">
        <div className="tl-cancelled">❌ This order has been cancelled</div>
      </div>
    );
  }

  return (
    <div className="ord-timeline">
      {STEPS.map((step, idx) => {
        const done    = idx <= currentIdx;
        const current = idx === currentIdx;
        const ts      = tsMap[step.key];
        return (
          <div key={step.key} className={`tl-step${done ? ' done' : ''}${current ? ' active' : ''}`}>
            <div className="tl-left">
              <div className="tl-dot-wrap">
                <div className="tl-dot">{done ? step.icon : ''}</div>
                {idx < STEPS.length - 1 && (
                  <div className={`tl-connector${idx < currentIdx ? ' done' : ''}`} />
                )}
              </div>
            </div>
            <div className="tl-right">
              <div className="tl-label">{step.label}</div>
              {ts
                ? <div className="tl-time">{formatDateTime(ts)}</div>
                : done && <div className="tl-time tl-time-pending">—</div>
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
