import { useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import '../pagestyles/settings.css';

const DEFAULTS = {
  shopName: 'Rinku Kirana Store',
  contact: '+91 98765 43210',
  whatsapp: '+91 98765 43210',
  upi: 'rinkukirana@upi',
  radius: '8',
  charge: '20',
  openTime: '07:00',
  closeTime: '22:00',
};

const INITIAL_COUPONS = [
  { code: 'WELCOME50', type: '₹50 OFF', min: '₹299', used: '142/500', expiry: '30 Jun 2026' },
  { code: 'SAVE15', type: '15% OFF', min: '₹500', used: '88/—', expiry: '15 Jul 2026' },
];

export default function Settings() {
  const toast = useToast();
  const modal = useModal();

  const [shop, setShop] = useState(DEFAULTS);
  const [coupons, setCoupons] = useState(INITIAL_COUPONS);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifAudience, setNotifAudience] = useState('All Users');
  const [notifMessage, setNotifMessage] = useState('');

  function field(key, value) {
    setShop((s) => ({ ...s, [key]: value }));
  }

  async function deleteCoupon(idx) {
    const confirmed = await modal.confirm({
      title: 'Delete coupon?',
      message: `Delete coupon "${coupons[idx].code}"?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (confirmed) {
      setCoupons((prev) => prev.filter((_, i) => i !== idx));
      toast.show('Coupon deleted', { type: 'success' });
    }
  }

  function sendNotification() {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast.show('Title aur message dono zaroori hai', { type: 'error' });
      return;
    }
    toast.show('Notification sent — hook this up to your push provider when ready.', { type: 'success' });
    setNotifTitle('');
    setNotifMessage('');
  }

  return (
    <AppLayout title="Settings">
      <div className="section-title">Settings</div>
      <div className="section-sub">Shop details aur configuration manage karein</div>

      {/* Shop Information */}
      <div className="panel settings-section">
        <div className="panel-head"><h3>Shop Information</h3></div>
        <div className="form-grid">
          <div className="f-group"><label>Shop Name</label><input value={shop.shopName} onChange={(e) => field('shopName', e.target.value)} /></div>
          <div className="f-group"><label>Contact Number</label><input value={shop.contact} onChange={(e) => field('contact', e.target.value)} /></div>
          <div className="f-group"><label>WhatsApp Number</label><input value={shop.whatsapp} onChange={(e) => field('whatsapp', e.target.value)} /></div>
          <div className="f-group"><label>UPI ID</label><input value={shop.upi} onChange={(e) => field('upi', e.target.value)} /></div>
          <div className="f-group"><label>Delivery Radius (km)</label><input value={shop.radius} onChange={(e) => field('radius', e.target.value)} /></div>
          <div className="f-group"><label>Delivery Charge (₹)</label><input value={shop.charge} onChange={(e) => field('charge', e.target.value)} /></div>
          <div className="f-group"><label>Store Opening Time</label><input type="time" value={shop.openTime} onChange={(e) => field('openTime', e.target.value)} /></div>
          <div className="f-group"><label>Store Closing Time</label><input type="time" value={shop.closeTime} onChange={(e) => field('closeTime', e.target.value)} /></div>
        </div>
        <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
          <button className="btn-main" onClick={() => toast.show('Settings saved — hook this up to your settings table when ready.', { type: 'success' })}>
            Save Changes
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              setShop(DEFAULTS);
              toast.show('Reset to defaults');
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {/* Coupons & Offers */}
      <div className="table-wrap settings-section">
        <div className="table-head">
          <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Coupons &amp; Offers</h3>
          <button className="btn-main" onClick={() => toast.show('Create coupon — hook this up to your coupons table when ready.')}>
            + Create Coupon
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Usage</th><th>Expiry</th><th>Actions</th></tr></thead>
            <tbody>
              {coupons.map((c, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 700 }}>{c.code}</td>
                  <td>{c.type}</td>
                  <td>{c.min}</td>
                  <td>{c.used}</td>
                  <td>{c.expiry}</td>
                  <td>
                    <div className="row-actions">
                      <button className="act-btn" onClick={() => toast.show('Edit coupon — hook this up to your coupons table when ready.')}>Edit</button>
                      <button className="act-btn danger" onClick={() => deleteCoupon(i)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Push Notifications */}
      <div className="panel settings-section">
        <div className="panel-head"><h3>Send New Notification</h3></div>
        <div className="form-grid">
          <div className="f-group"><label>Title</label><input placeholder="e.g. Sabzi par 20% OFF!" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} /></div>
          <div className="f-group">
            <label>Target Audience</label>
            <select value={notifAudience} onChange={(e) => setNotifAudience(e.target.value)}>
              <option>All Users</option>
              <option>Selected Users</option>
              <option>Customer Group</option>
            </select>
          </div>
          <div className="f-group" style={{ gridColumn: '1/-1' }}>
            <label>Message</label>
            <textarea rows={3} placeholder="Notification message..." value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn-main" onClick={sendNotification}>Send Notification</button>
        </div>
      </div>
      <div className="placeholder-card">
        <div className="pc-icon">🔔</div>
        <h4>Sent History</h4>
        <p>Pichle notifications ka record yahan dikhega</p>
      </div>
    </AppLayout>
  );
}
