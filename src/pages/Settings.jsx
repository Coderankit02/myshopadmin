import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { db } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';
import { formatDateTime } from '../lib/utils';
import { audit } from '../lib/audit';
import { migrateAllImages } from '../lib/migrateToCloudinary';
import '../pagestyles/settings.css';

const DEFAULT_SHOP = {
  shop_name: '', contact: '', whatsapp: '', upi_id: '',
  delivery_radius: '', delivery_charge: '', open_time: '', close_time: '',
  logo_url: '', favicon_url: '', theme_color: '',
  social_facebook: '', social_instagram: '', social_whatsapp: '', social_youtube: '',
  footer_text: '', about_text: '', privacy_policy: '', terms_text: '', shipping_rules: '',
  announcement: '',
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

function ProfilePanel() {
  const { user, updateAvatar, updateName } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.user_metadata?.full_name || '');
  const [uploading, setUploading] = useState(false);
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setName(user?.user_metadata?.full_name || '');
  }, [user?.id, user?.user_metadata?.full_name]);

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
            style={{ position: 'absolute', bottom: -8, right: -8, padding: '4px 7px', fontSize: '0.8rem', cursor: 'pointer', borderRadius: '50%' }}
            title="Profile picture change karein"
          >
            ✏️
          </label>
          <input id="avatar-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} disabled={uploading} />
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
  const [done, setDone] = useState(() => {
    try { return localStorage.getItem('rk_migration_done') === '1'; } catch { return false; }
  });

  async function handleMigrate() {
    if (!window.confirm(
      'Supabase Storage se Cloudinary par migrate karein?\n\n' +
      'Ye in sab ko migrate karega:\n' +
      '• Payment screenshots\n• Product images\n• Category images\n• Customer avatars\n\n' +
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

  if (done) return null;

  return (
    <div className="panel settings-section" style={{ border: '2px dashed #f59e0b', background: '#fffbeb' }}>
      <div className="panel-head"><h3>🚚 Migrate Images → Cloudinary</h3></div>
      <p style={{ fontSize: '0.85rem', color: '#92400e', marginBottom: 14 }}>
        Purani Supabase Storage images ko Cloudinary par move karega — payment screenshots,
        product/category images, aur customer avatars. Console (F12) open rakho progress
        dekhne ke liye. Ek baar chalao, dobara chalane ki zaroorat nahi.
      </p>
      <button className="btn-main" style={{ background: '#f59e0b', color: '#fff' }} disabled={running} onClick={handleMigrate}>
        {running ? '⏳ Migration chal rahi hai... Console dekho' : '🚀 Migrate Karo'}
      </button>
    </div>
  );
}

/* ── Branding image slot (logo / favicon) ───────────────────────────────── */
function BrandImageSlot({ imageUrl, onChange, label, hint }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { url, error } = await uploadToCloudinary(file, 'myshop/branding');
    setUploading(false);
    if (url) onChange(url);
    else toast.show(`❌ Upload nahi hui: ${error || 'Unknown error'}`, { type: 'error' });
    e.target.value = '';
  }

  return (
    <div>
      <label className="f-group" style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--gray)', marginBottom: 6 }}>{label}</span>
        <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--gray)', marginBottom: 8 }}>{hint}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor={`br-${label}`} className="btn-ghost" style={{ cursor: 'pointer' }}>
            {uploading ? '⏳ Uploading...' : (imageUrl ? '✏️ Change' : '📷 Upload')}
          </label>
          <input id={`br-${label}`} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
          {imageUrl && (
            <>
              <img src={imageUrl} alt={label} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }} />
              <button className="act-btn danger" onClick={() => onChange('')}>🗑️</button>
            </>
          )}
        </div>
      </label>
    </div>
  );
}

export default function Settings() {
  const toast = useToast();
  const modal = useModal();

  const [shop, setShop] = useState(DEFAULT_SHOP);
  const [shopMissing, setShopMissing] = useState(false);
  const [savingShop, setSavingShop] = useState(false);

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
        ...DEFAULT_SHOP,
        shop_name: data.shop_name || '', contact: data.contact || '', whatsapp: data.whatsapp || '',
        upi_id: data.upi_id || '', delivery_radius: data.delivery_radius ?? '', delivery_charge: data.delivery_charge ?? '',
        open_time: data.open_time || '', close_time: data.close_time || '',
        logo_url: data.logo_url || '', favicon_url: data.favicon_url || '', theme_color: data.theme_color || '',
        social_facebook: data.social_facebook || '', social_instagram: data.social_instagram || '',
        social_whatsapp: data.social_whatsapp || '', social_youtube: data.social_youtube || '',
        footer_text: data.footer_text || '', about_text: data.about_text || '',
        privacy_policy: data.privacy_policy || '', terms_text: data.terms_text || '',
        shipping_rules: data.shipping_rules || '', announcement: data.announcement || '',
      });
    }
  }

  async function loadHistory() {
    const { data, error } = await db.from('push_notification_logs').select('*').order('created_at', { ascending: false }).limit(20);
    if (error) { setHistoryMissing(true); return; }
    setSentHistory(data || []);
  }

  useEffect(() => { loadShop(); loadHistory(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function field(key, value) { setShop((s) => ({ ...s, [key]: value })); }

  async function saveShop() {
    setSavingShop(true);
    const { error } = await db.from('shop_settings').update({
      shop_name: shop.shop_name, contact: shop.contact, whatsapp: shop.whatsapp, upi_id: shop.upi_id,
      delivery_radius: shop.delivery_radius === '' ? null : Number(shop.delivery_radius),
      delivery_charge: shop.delivery_charge === '' ? null : Number(shop.delivery_charge),
      open_time: shop.open_time, close_time: shop.close_time,
      logo_url: shop.logo_url || null, favicon_url: shop.favicon_url || null, theme_color: shop.theme_color || null,
      social_facebook: shop.social_facebook || null, social_instagram: shop.social_instagram || null,
      social_whatsapp: shop.social_whatsapp || null, social_youtube: shop.social_youtube || null,
      footer_text: shop.footer_text || null, about_text: shop.about_text || null,
      privacy_policy: shop.privacy_policy || null, terms_text: shop.terms_text || null,
      shipping_rules: shop.shipping_rules || null, announcement: shop.announcement || null,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);
    setSavingShop(false);
    if (error) { toast.show(`Save nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit('settings.update', 'shop_settings', 1);
    toast.show('Settings saved — customer site par instantly update ho gaya', { type: 'success' });
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
      audience: 'All Users', sent_count: sentCount,
    });

    setSending(false);
    toast.show(`Notification ${sentCount} users ko bheji gayi`, { type: 'success' });
    audit('notification.send', 'notifications', null, { sent_count: sentCount });
    setNotifTitle('');
    setNotifMessage('');
    loadHistory();
  }

  return (
    <AppLayout title="Settings">
      <div className="section-title">Settings</div>
      <div className="section-sub">Shop details aur website configuration manage karein — live Supabase data, customer site par instantly reflect hota hai</div>

      <ProfilePanel />
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
              <div className="f-group"><label htmlFor="set-announce">Announcement Bar (ticker)</label><input id="set-announce" value={shop.announcement} onChange={(e) => field('announcement', e.target.value)} placeholder="e.g. Naye offers aaye hain!" /></div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
              <button className="btn-main" disabled={savingShop} onClick={saveShop}>Save Changes</button>
              <button className="btn-ghost" onClick={loadShop}>Reset</button>
            </div>
          </>
        )}
      </div>

      {/* Branding */}
      <div className="panel settings-section">
        <div className="panel-head"><h3>Branding — Logo, Favicon, Theme</h3></div>
        {shopMissing ? (
          <MigrationNotice what="shop_settings" />
        ) : (
          <>
            <div className="form-grid">
              <BrandImageSlot imageUrl={shop.logo_url} onChange={(v) => field('logo_url', v)} label="Website Logo" hint="Header + footer mein dikhega (square)" />
              <BrandImageSlot imageUrl={shop.favicon_url} onChange={(v) => field('favicon_url', v)} label="Favicon" hint="Browser tab icon (square, 64×64+)" />
              <div className="f-group">
                <label htmlFor="set-theme">Theme Color (primary)</label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input id="set-theme" value={shop.theme_color} onChange={(e) => field('theme_color', e.target.value)} placeholder="#15803D" style={{ flex: 1 }} />
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(shop.theme_color) ? shop.theme_color : '#15803D'} onChange={(e) => field('theme_color', e.target.value)} style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent' }} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <button className="btn-main" disabled={savingShop} onClick={saveShop}>Save Branding</button>
            </div>
          </>
        )}
      </div>

      {/* Social + Footer + Legal + Shipping */}
      <div className="panel settings-section">
        <div className="panel-head"><h3>Website — Social, Footer &amp; Legal</h3></div>
        {shopMissing ? (
          <MigrationNotice what="shop_settings" />
        ) : (
          <>
            <div className="form-grid">
              <div className="f-group"><label htmlFor="set-fb">Facebook URL</label><input id="set-fb" value={shop.social_facebook} onChange={(e) => field('social_facebook', e.target.value)} placeholder="https://facebook.com/..." /></div>
              <div className="f-group"><label htmlFor="set-ig">Instagram URL</label><input id="set-ig" value={shop.social_instagram} onChange={(e) => field('social_instagram', e.target.value)} placeholder="https://instagram.com/..." /></div>
              <div className="f-group"><label htmlFor="set-wa">WhatsApp URL</label><input id="set-wa" value={shop.social_whatsapp} onChange={(e) => field('social_whatsapp', e.target.value)} placeholder="https://wa.me/91..." /></div>
              <div className="f-group"><label htmlFor="set-yt">YouTube URL</label><input id="set-yt" value={shop.social_youtube} onChange={(e) => field('social_youtube', e.target.value)} placeholder="https://youtube.com/..." /></div>
              <div className="f-group" style={{ gridColumn: '1/-1' }}>
                <label htmlFor="set-footer">Footer Text</label>
                <textarea id="set-footer" rows={2} value={shop.footer_text} onChange={(e) => field('footer_text', e.target.value)} placeholder="Footer ka tagline/description" />
              </div>
              <div className="f-group" style={{ gridColumn: '1/-1' }}>
                <label htmlFor="set-about">About Us (page)</label>
                <textarea id="set-about" rows={4} value={shop.about_text} onChange={(e) => field('about_text', e.target.value)} />
              </div>
              <div className="f-group" style={{ gridColumn: '1/-1' }}>
                <label htmlFor="set-privacy">Privacy Policy (page)</label>
                <textarea id="set-privacy" rows={4} value={shop.privacy_policy} onChange={(e) => field('privacy_policy', e.target.value)} />
              </div>
              <div className="f-group" style={{ gridColumn: '1/-1' }}>
                <label htmlFor="set-terms">Terms &amp; Conditions (page)</label>
                <textarea id="set-terms" rows={4} value={shop.terms_text} onChange={(e) => field('terms_text', e.target.value)} />
              </div>
              <div className="f-group" style={{ gridColumn: '1/-1' }}>
                <label htmlFor="set-ship">Shipping Rules (checkout par dikhenge)</label>
                <textarea id="set-ship" rows={3} value={shop.shipping_rules} onChange={(e) => field('shipping_rules', e.target.value)} placeholder="e.g. Free delivery ₹500+ par, radius 8km" />
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <button className="btn-main" disabled={savingShop} onClick={saveShop}>Save Website Content</button>
            </div>
          </>
        )}
      </div>

      {/* Coupons — now a dedicated page */}
      <div className="panel settings-section" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="panel-head" style={{ marginBottom: 4 }}><h3>🎟️ Coupons &amp; Offers</h3></div>
          <p style={{ fontSize: '0.82rem', color: 'var(--gray)' }}>
            Coupons ab dedicated page par manage hote hain — customer/product/category targeting ke saath.
          </p>
        </div>
        <Link to="/coupons" className="btn-main">Open Coupons →</Link>
      </div>

      {/* Push Notifications */}
      <div className="panel settings-section">
        <div className="panel-head"><h3>Send New Notification</h3></div>
        <div className="form-grid">
          <div className="f-group"><label htmlFor="notif-title">Title</label><input id="notif-title" placeholder="e.g. Sabzi par 20% OFF!" value={notifTitle} onChange={(e) => setNotifTitle(e.target.value)} /></div>
          <div className="f-group">
            <label>Target Audience</label>
            <div style={{ padding: '10px 14px', background: 'var(--light)', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: '0.9rem', color: 'var(--text)' }}>
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
