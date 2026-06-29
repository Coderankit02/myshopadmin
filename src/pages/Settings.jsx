import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/supabase';
import { formatDateTime } from '../lib/utils';
import { migrateAllImages } from '../lib/migrateToCloudinary';
import '../pagestyles/settings.css';

const DEFAULT_SHOP = {
  shop_name: '', contact: '', whatsapp: '', upi_id: '',
  delivery_radius: '', delivery_charge: '', open_time: '', close_time: '',
};

function MigrationNotice({ what }) {
  return (
    <div className="placeholder-card">
      <div className="pc-icon">⚠️</div>
      <h4>{what} table setup pending</h4>
      <p>Run <code>supabase/admin-wiring-migration.sql</code> (included in this project) in your Supabase SQL Editor once — it creates the tables this section needs without touching any existing data.</p>
    </div>
  );
}

function CouponForm({ initial, busy, onSave }) {
  const [code, setCode] = useState(initial?.code || '');
  const [type, setType] = useState(initial?.discount_type || 'flat');
  const [value, setValue] = useState(initial?.discount_value ?? '');
  const [minOrder, setMinOrder] = useState(initial?.min_order ?? '');
  const [usageLimit, setUsageLimit] = useState(initial?.usage_limit ?? '');
  const [expiry, setExpiry] = useState(initial?.expiry_date || '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  return (
    <div>
      <div className="form-grid">
        <div className="f-group"><label htmlFor="cp-code">Coupon Code *</label><input id="cp-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME50" /></div>
        <div className="f-group">
          <label htmlFor="cp-type">Discount Type</label>
          <select id="cp-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="flat">Flat (₹)</option>
            <option value="percent">Percent (%)</option>
          </select>
        </div>
        <div className="f-group"><label htmlFor="cp-value">Discount Value *</label><input id="cp-value" type="number" value={value} onChange={(e) => setValue(e.target.value)} /></div>
        <div className="f-group"><label htmlFor="cp-min">Min Order (₹)</label><input id="cp-min" type="number" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} /></div>
        <div className="f-group"><label htmlFor="cp-limit">Usage Limit (blank = unlimited)</label><input id="cp-limit" type="number" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value)} /></div>
        <div className="f-group"><label htmlFor="cp-expiry">Expiry Date</label><input id="cp-expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
        <div className="f-group">
          <label htmlFor="cp-active">Status</label>
          <select id="cp-active" value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')}>
            <option value="1">Active</option><option value="0">Inactive</option>
          </select>
        </div>
      </div>
      <div className="modal-actions">
        <button
          className="btn-main"
          disabled={busy || !code.trim() || value === ''}
          onClick={() => onSave({
            code: code.trim(),
            discount_type: type,
            discount_value: Number(value),
            min_order: minOrder === '' ? 0 : Number(minOrder),
            usage_limit: usageLimit === '' ? null : Number(usageLimit),
            expiry_date: expiry || null,
            is_active: isActive,
          })}
        >
          {initial ? 'Save Changes' : 'Create Coupon'}
        </button>
      </div>
    </div>
  );
}

function ProfilePanel() {
  const { user, updateAvatar, updateName } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.user_metadata?.full_name || '');
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const result = await updateAvatar(file);
    setUploading(false);
    if (result.error) toast.show(result.error, { type: 'error' });
    else toast.show('✅ Profile picture update ho gayi', { type: 'success' });
  }

  async function handleSaveName() {
    setSavingName(true);
    const result = await updateName(name.trim());
    setSavingName(false);
    if (result.error) toast.show(result.error, { type: 'error' });
    else toast.show('✅ Naam save ho gaya', { type: 'success' });
  }

  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="panel settings-section">
      <div className="panel-head"><h3>My Profile</h3></div>
      <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: 84, height: 84, borderRadius: '50%', overflow: 'hidden',
              background: 'var(--light)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '2rem', border: '2px solid var(--border)',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : '👤'}
          </div>
          <label
            htmlFor="avatar-upload"
            className="btn-ghost"
            style={{
              position: 'absolute', bottom: -8, right: -8, padding: '4px 7px',
              fontSize: '0.8rem', cursor: 'pointer', borderRadius: '50%',
            }}
            title="Profile picture change karein"
          >
            ✏️
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileChange}
            disabled={uploading}
          />
        </div>
        <div className="form-grid" style={{ flex: 1, minWidth: 220 }}>
          <div className="f-group">
            <label htmlFor="prof-name">Display Name</label>
            <input id="prof-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Aapka naam" />
          </div>
          <div className="f-group">
            <label>Email</label>
            <div style={{ padding: '10px 14px', background: 'var(--light)', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.9rem' }}>
              {user?.email || '—'}
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn-main" disabled={savingName} onClick={handleSaveName}>
          {savingName ? 'Saving…' : 'Save Name'}
        </button>
        {uploading && <span style={{ fontSize: '0.85rem', color: 'var(--gray)' }}>⏳ Photo upload ho rahi hai…</span>}
      </div>
    </div>
  );
}

/* ── Migration Panel — Supabase → Cloudinary ─────────────────────────────── */
function MigrateCloudinaryPanel() {
  const [running, setRunning] = useState(false);
  // localStorage mein save karo taaki page reload par dobara na dikhe
  const [done, setDone] = useState(() => {
    try { return localStorage.getItem('rk_migration_done') === '1'; } catch { return false; }
  });

  async function handleMigrate() {
    if (!window.confirm(
      'Supabase Storage se Cloudinary par migrate karein?\n\n' +
      'Ye in sab ko migrate karega:\n' +
      '• Payment screenshots\n' +
      '• Product images (agar koi reh gayi ho)\n' +
      '• Category images (agar koi reh gayi ho)\n' +
      '• Customer avatars (profiles table)\n\n' +
      'Console (F12) mein progress dekhein.'
    )) return;
    setRunning(true);
    try {
      await migrateAllImages();
      setDone(true);
      try { localStorage.setItem('rk_migration_done', '1'); } catch { /* ignore */ }
    } catch (err) {
      console.error('Migration error:', err);
      alert('Migration mein error aaya — console (F12) dekho');
    }
    setRunning(false);
  }

  // Migration complete ho chuki hai — panel hide karo
  if (done) return null;

  return (
    <div className="panel settings-section" style={{ border: '2px dashed #f59e0b', background: '#fffbeb' }}>
      <div className="panel-head"><h3>🚚 Migrate Images → Cloudinary</h3></div>
      <p style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: 14 }}>
        Purani Supabase Storage images ko Cloudinary par move karega — payment screenshots,
        product/category images, aur customer avatars. Console (F12) open rakho progress
        dekhne ke liye. Ek baar chalao, dobara chalane ki zaroorat nahi.
      </p>
      <button
        className="btn-main"
        style={{ background: '#f59e0b', color: '#fff' }}
        disabled={running}
        onClick={handleMigrate}
      >
        {running ? '⏳ Migration chal rahi hai... Console dekho' : '🚀 Migrate Karo'}
      </button>
    </div>
  );
}

export default function Settings() {
  const toast = useToast();
  const modal = useModal();

  const [shop, setShop] = useState(DEFAULT_SHOP);
  const [shopMissing, setShopMissing] = useState(false);
  const [savingShop, setSavingShop] = useState(false);

  const [coupons, setCoupons] = useState([]);
  const [couponsMissing, setCouponsMissing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sentHistory, setSentHistory] = useState([]);
  const [historyMissing, setHistoryMissing] = useState(false);

  async function loadShop() {
    const { data, error } = await db.from('shop_settings').select('*').eq('id', 1).maybeSingle();
    if (error) { setShopMissing(true); return; }
    if (data) {
      setShop({
        shop_name: data.shop_name || '', contact: data.contact || '', whatsapp: data.whatsapp || '',
        upi_id: data.upi_id || '', delivery_radius: data.delivery_radius ?? '', delivery_charge: data.delivery_charge ?? '',
        open_time: data.open_time || '', close_time: data.close_time || '',
      });
    }
  }

  async function loadCoupons() {
    const { data, error } = await db.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) { setCouponsMissing(true); return; }
    setCoupons(data || []);
  }

  async function loadHistory() {
    const { data, error } = await db.from('push_notification_logs').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) { setHistoryMissing(true); return; }
    setSentHistory(data || []);
  }

  useEffect(() => { loadShop(); loadCoupons(); loadHistory(); }, []);

  function field(key, value) { setShop((s) => ({ ...s, [key]: value })); }

  async function saveShop() {
    setSavingShop(true);
    const { error } = await db.from('shop_settings').update({
      shop_name: shop.shop_name, contact: shop.contact, whatsapp: shop.whatsapp, upi_id: shop.upi_id,
      delivery_radius: shop.delivery_radius === '' ? null : Number(shop.delivery_radius),
      delivery_charge: shop.delivery_charge === '' ? null : Number(shop.delivery_charge),
      open_time: shop.open_time, close_time: shop.close_time,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setSavingShop(false);
    if (error) { toast.show(`Save nahi hua: ${error.message}`, { type: 'error' }); return; }
    toast.show('Settings saved', { type: 'success' });
  }

  async function saveCoupon(payload, id) {
    setBusy(true);
    let error;
    if (id) ({ error } = await db.from('coupons').update(payload).eq('id', id));
    else ({ error } = await db.from('coupons').insert(payload));
    setBusy(false);
    if (error) { toast.show(`Save nahi hua: ${error.message}`, { type: 'error' }); return; }
    modal.close();
    toast.show(id ? 'Coupon update ho gaya' : 'Coupon create ho gaya', { type: 'success' });
    loadCoupons();
  }

  function openCreateCoupon() {
    modal.open({ title: 'Create Coupon', content: <CouponForm busy={busy} onSave={(p) => saveCoupon(p, null)} /> });
  }

  function openEditCoupon(c) {
    modal.open({ title: `Edit "${c.code}"`, content: <CouponForm initial={c} busy={busy} onSave={(p) => saveCoupon(p, c.id)} /> });
  }

  async function deleteCoupon(c) {
    const confirmed = await modal.confirm({ title: 'Delete coupon?', message: `Delete coupon "${c.code}"?`, confirmLabel: 'Delete', danger: true });
    if (!confirmed) return;
    const { error } = await db.from('coupons').delete().eq('id', c.id);
    if (error) { toast.show(`Delete nahi hua: ${error.message}`, { type: 'error' }); return; }
    toast.show('Coupon deleted', { type: 'success' });
    loadCoupons();
  }

  async function sendNotification() {
    if (!notifTitle.trim() || !notifMessage.trim()) {
      toast.show('Title aur message dono zaroori hai', { type: 'error' });
      return;
    }
    setSending(true);

    const { data: profiles, error: profErr } = await db.from('profiles').select('id');
    if (profErr) {
      setSending(false);
      toast.show(`Users load nahi hue: ${profErr.message}`, { type: 'error' });
      return;
    }

    const targetIds = (profiles || []).map((p) => p.id);
    const rows = targetIds.map((uid) => ({
      user_id: uid,
      title: notifTitle.trim(),
      message: notifMessage.trim(),
      type: 'admin',
      is_read: false,
      created_at: new Date().toISOString(),
    }));

    let sentCount = 0;
    if (rows.length) {
      const { error: insErr } = await db.from('notifications').insert(rows);
      if (insErr) {
        setSending(false);
        toast.show(`Notification send nahi hui: ${insErr.message}`, { type: 'error' });
        return;
      }
      sentCount = rows.length;
    }

    await db.from('push_notification_logs').insert({
      title: notifTitle.trim(), message: notifMessage.trim(),
      // BUG FIX (Medium #11): audience hardcoded "All Users" — fake options hata diye.
      audience: 'All Users', sent_count: sentCount,
    });

    setSending(false);
    toast.show(`Notification ${sentCount} users ko bheji gayi`, { type: 'success' });
    setNotifTitle('');
    setNotifMessage('');
    loadHistory();
  }

  return (
    <AppLayout title="Settings">
      <div className="section-title">Settings</div>
      <div className="section-sub">Shop details aur configuration manage karein — live Supabase data</div>

      {/* Profile picture / display name (Feature) */}
      <ProfilePanel />

      {/* ── Ek baar chalao phir hata do ── */}
      <MigrateCloudinaryPanel />

      {/* Shop Information */}
      <div className="panel settings-section">
        <div className="panel-head"><h3>Shop Information</h3></div>
        {shopMissing ? (
          <MigrationNotice what="shop_settings" />
        ) : (
          <>
            <div className="form-grid">
              <div className="f-group"><label htmlFor="set-shop-name">Shop Name</label><input id="set-shop-name" value={shop.shop_name} onChange={(e) => field('shop_name', e.target.value)} /></div>
              <div className="f-group"><label htmlFor="set-contact">Contact Number</label><input id="set-contact" value={shop.contact} onChange={(e) => field('contact', e.target.value)} /></div>
              <div className="f-group"><label htmlFor="set-whatsapp">WhatsApp Number</label><input id="set-whatsapp" value={shop.whatsapp} onChange={(e) => field('whatsapp', e.target.value)} /></div>
              <div className="f-group"><label htmlFor="set-upi">UPI ID</label><input id="set-upi" value={shop.upi_id} onChange={(e) => field('upi_id', e.target.value)} /></div>
              <div className="f-group"><label htmlFor="set-radius">Delivery Radius (km)</label><input id="set-radius" value={shop.delivery_radius} onChange={(e) => field('delivery_radius', e.target.value)} /></div>
              <div className="f-group"><label htmlFor="set-charge">Delivery Charge (₹)</label><input id="set-charge" value={shop.delivery_charge} onChange={(e) => field('delivery_charge', e.target.value)} /></div>
              <div className="f-group"><label htmlFor="set-open">Store Opening Time</label><input id="set-open" type="time" value={shop.open_time} onChange={(e) => field('open_time', e.target.value)} /></div>
              <div className="f-group"><label htmlFor="set-close">Store Closing Time</label><input id="set-close" type="time" value={shop.close_time} onChange={(e) => field('close_time', e.target.value)} /></div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button className="btn-main" disabled={savingShop} onClick={saveShop}>Save Changes</button>
              <button className="btn-ghost" onClick={loadShop}>Reset</button>
            </div>
          </>
        )}
      </div>

      {/* Coupons & Offers */}
      <div className="table-wrap settings-section">
        <div className="table-head">
          <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Coupons &amp; Offers</h3>
          {!couponsMissing && <button className="btn-main" onClick={openCreateCoupon}>+ Create Coupon</button>}
        </div>
        {couponsMissing ? (
          <MigrationNotice what="coupons" />
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Usage</th><th>Expiry</th><th>Actions</th></tr></thead>
              <tbody>
                {coupons.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi coupon nahi hai</td></tr>
                ) : (
                  coupons.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 700 }}>{c.code} {!c.is_active && <span className="badge b-cancelled" style={{ marginLeft: 6 }}>Inactive</span>}</td>
                      <td>{c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}</td>
                      <td>₹{c.min_order ?? 0}</td>
                      <td>{c.used_count}/{c.usage_limit ?? '—'}</td>
                      <td>{c.expiry_date || '—'}</td>
                      <td>
                        <div className="row-actions">
                          <button className="act-btn" onClick={() => openEditCoupon(c)}>Edit</button>
                          <button className="act-btn danger" onClick={() => deleteCoupon(c)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Push Notifications */}
      <div className="panel settings-section">
        <div className="panel-head"><h3>Send New Notification</h3></div>
        <div className="form-grid">
          <div className="f-group"><label htmlFor="notif-title">Title</label><input id="notif-title" placeholder="e.g. Sabzi par 20% OFF!" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} /></div>
          {/*
            BUG FIX (Medium #11): Pehle ek misleading dropdown tha jisme
            "All Users", "Selected Users", "Customer Group" options the,
            lekin sirf "All Users" kaam karta tha. Users confuse hote the.
            Ab sirf text dikhate hain — jab selective targeting ready ho tab dropdown wapas laao.
          */}
          <div className="f-group">
            <label>Target Audience</label>
            <div style={{
              padding: '10px 14px', background: 'var(--light)', borderRadius: 8,
              border: '1.5px solid var(--border)', fontSize: '0.9rem', color: 'var(--text)',
            }}>
              All Users <span style={{ color: 'var(--gray)', fontSize: '0.78rem' }}>(har registered customer)</span>
            </div>
          </div>
          <div className="f-group" style={{ gridColumn: '1/-1' }}>
            <label htmlFor="notif-message">Message</label>
            <textarea id="notif-message" rows={3} placeholder="Notification message..." value={notifMessage} onChange={(e) => setNotifMessage(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn-main" disabled={sending} onClick={sendNotification}>{sending ? 'Sending...' : 'Send Notification'}</button>
        </div>
      </div>

      {historyMissing ? (
        <MigrationNotice what="push_notification_logs" />
      ) : (
        <div className="table-wrap settings-section">
          <div className="table-head"><h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>Sent History</h3></div>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Title</th><th>Message</th><th>Audience</th><th>Sent To</th><th>Date</th></tr></thead>
              <tbody>
                {sentHistory.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--gray)' }}>Abhi tak koi notification nahi bheji gayi</td></tr>
                ) : (
                  sentHistory.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontWeight: 700 }}>{h.title}</td>
                      <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.message}</td>
                      <td>{h.audience}</td>
                      <td>{h.sent_count}</td>
                      <td>{formatDateTime(h.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppLayout>
  );
}