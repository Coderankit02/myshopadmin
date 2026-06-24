/** Format a number as Indian Rupees, e.g. 8420 -> "8,420" (no symbol) */
export function formatINR(n) {
  if (n === null || n === undefined || n === '') return '—';
  return Number(n).toLocaleString('en-IN');
}

/** Format an ISO date string into "21 Jun, 10:42 AM" style, en-IN locale */
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN');
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

/** Map an order/payment status string to its badge class, same lookup as before */
const STATUS_BADGE = {
  Pending: 'b-pending',
  Confirmed: 'b-confirmed',
  Delivered: 'b-delivered',
  Cancelled: 'b-cancelled',
  Packed: 'b-packed',
  'Out For Delivery': 'b-out',
  pending: 'b-pending',
  paid: 'b-delivered',
  rejected: 'b-cancelled',
  confirmed: 'b-confirmed',
  packed: 'b-packed',
  out_for_delivery: 'b-out',
  delivered: 'b-delivered',
  cancelled: 'b-cancelled',
};

/** Linear order workflow — kept for reference (which status follows which) */
export const ORDER_FLOW = ['pending', 'confirmed', 'packed', 'out_for_delivery', 'delivered'];
// BUG FIX (Minor #8): `nextStatusOptions()` kahin bhi use nahi hota tha — OrderDetail
// aur useOrders dono apna VALID_TRANSITIONS map use karte hain. Dead code hata diya.
// Future mein chahiye ho toh VALID_TRANSITIONS (src/hooks/useOrders.js) hi single
// source of truth hai — wahi use karo, do alag-alag transition maps mat rakho.

/** wa.me link with a prefilled message. Assumes Indian numbers; prefixes 91 if missing.
 *  Handles numbers that already include +91 / 91 / spaces so "+91" never doubles up. */
export function waLink(phone, message) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message || '')}`;
}

export function telLink(phone) {
  if (!phone) return null;
  return `tel:${String(phone).replace(/\s+/g, '')}`;
}

/** Standard WhatsApp update message for an order */
export function buildOrderWhatsAppMessage(order) {
  return (
    `Namaste ${order.delivery_name || ''},\n` +
    `Aapka order ${order.order_number} abhi "${statusLabel(order.status)}" hai.\n` +
    `Total: ₹${formatINR(order.final_amount)}\n` +
    `Dhanyavaad! 🙏`
  );
}

/** Human-readable label for a raw DB order status (e.g. out_for_delivery -> Out For Delivery) */
export function statusLabel(status) {
  if (!status) return '—';
  return status
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function statusBadgeClass(status) {
  return STATUS_BADGE[status] || 'b-pending';
}

/** Debounce helper, used for search inputs (e.g. Payments search-as-you-type) */
export function debounce(fn, wait) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait || 300);
  };
}

/** "2 ghante pehle" / "30 min pehle" style relative age — used for the order "age" badge. */
export function timeAgo(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return 'abhi';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'abhi';
  if (mins < 60) return `${mins} min pehle`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ghanta${hrs > 1 ? 's' : ''} pehle`;
  const days = Math.floor(hrs / 24);
  return `${days} din pehle`;
}

/** True once an order has been sitting in a non-final status for a while — used to highlight stale orders. */
export function isOrderAging(iso, status, thresholdMins = 60) {
  if (!iso || status === 'delivered' || status === 'cancelled') return false;
  const mins = (Date.now() - new Date(iso).getTime()) / 60000;
  return mins >= thresholdMins;
}

/** Google Maps search link built from a free-text address (or pincode/city fallback). */
export function mapsLink(address) {
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** Read / write the persisted theme preference, same key as the original app */
export function getStoredTheme() {
  try {
    const s = localStorage.getItem('rk_admin_theme');
    return s === 'dark' || s === 'light' ? s : 'light';
  } catch {
    return 'light';
  }
}

export function setStoredTheme(theme) {
  try {
    localStorage.setItem('rk_admin_theme', theme);
  } catch {
    /* ignore */
  }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  setStoredTheme(theme);
}
