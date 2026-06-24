/**
 * orderAlerts.js — "Naya order aaya" browser notification + beep sound.
 * Feature: Naye order ka sound/browser notification (admin tab switch karke baithta hai,
 * isliye sirf in-app toast kaafi nahi hai — OS-level notification + beep chahiye).
 */

let audioCtx = null;

/** Short two-tone "tring" beep using the Web Audio API — no external mp3 file needed. */
export function playOrderBeep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {
    /* Web Audio not available — silently skip, browser notification still works */
  }
}

/** Ask the user once for OS notification permission (call from a click handler, e.g. a settings toggle). */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') return Notification.permission = await Notification.requestPermission();
  return Notification.permission;
}

/** Fire an OS-level "naya order aaya" notification + beep. Safe to call even without permission. */
export function notifyNewOrder(order) {
  playOrderBeep();
  if ('Notification' in window && Notification.permission === 'granted') {
    const name = order?.delivery_name || 'Customer';
    const amount = order?.final_amount != null ? `₹${Number(order.final_amount).toLocaleString('en-IN')}` : '';
    try {
      const n = new Notification('🔔 Naya Order Aaya!', {
        body: `${name} ${amount ? `· ${amount}` : ''} · #${order?.order_number || ''}`,
        tag: order?.id ? `order-${order.id}` : undefined,
      });
      n.onclick = () => { window.focus(); n.close(); };
    } catch {
      /* some browsers throw if tab isn't focused/secure context — ignore, beep already played */
    }
  }
}
