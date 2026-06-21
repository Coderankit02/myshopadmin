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
  'Out For Delivery': 'b-confirmed',
  pending: 'b-pending',
  paid: 'b-delivered',
  rejected: 'b-cancelled',
};

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
