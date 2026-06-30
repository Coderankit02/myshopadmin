import { useEffect, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';
import '../pagestyles/categories.css';

/* ── Image upload helper — Cloudinary ───────────────────────────────────── */
async function uploadImageFile(file) {
  return await uploadToCloudinary(file, 'myshop/banners');
}

/* ── Banner Image Upload Slot ────────────────────────────────────────────── */
function BannerImageSlot({ imageUrl, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  async function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { url } = await uploadImageFile(file);
    setUploading(false);
    if (url) onChange(url);
    e.target.value = '';
  }

  return (
    <div className="img-upload-section">
      <label className="img-upload-label">
        Banner Image
        <span>1920×600px recommended (landscape)</span>
      </label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFilePick}
      />
      <div
        className={`img-slot${imageUrl ? '' : ' add-slot'}`}
        style={{ aspectRatio: '16/5', borderRadius: 12, width: '100%', position: 'relative' }}
        onClick={() => !imageUrl && inputRef.current?.click()}
      >
        {uploading ? (
          <div className="img-uploading">⏳ Upload ho raha hai...</div>
        ) : imageUrl ? (
          <>
            <img src={imageUrl} alt="Banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div className="img-controls">
              <button type="button" className="img-ctrl-btn set-def" onClick={() => inputRef.current?.click()}>
                ✏️ Change
              </button>
              <button type="button" className="img-ctrl-btn del" onClick={() => onChange('')}>
                🗑️ Hatao
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="img-slot-add-icon">🖼️</span>
            <span className="img-slot-add-text">Banner Image Upload Karein</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── BannerForm ──────────────────────────────────────────────────────────── */
function BannerForm({ initial, onSave }) {
  const [title, setTitle]         = useState(initial?.title || '');
  const [subtitle, setSubtitle]   = useState(initial?.subtitle || '');
  const [imageUrl, setImageUrl]   = useState(initial?.image_url || '');
  const [linkUrl, setLinkUrl]     = useState(initial?.link_url || '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [isActive, setIsActive]   = useState(initial?.is_active ?? true);
  const [bgGradient, setBgGradient] = useState(initial?.bg_gradient || '');
  const [buttonText, setButtonText] = useState(initial?.button_text || '');
  const [localBusy, setLocalBusy] = useState(false);

  const GRADIENT_PRESETS = [
    { label: 'Green (default)', value: 'linear-gradient(135deg,#064E3B,#047857)' },
    { label: 'Orange', value: 'linear-gradient(135deg,#9A3412,#EA580C)' },
    { label: 'Blue', value: 'linear-gradient(135deg,#1E3A8A,#2563EB)' },
    { label: 'Purple', value: 'linear-gradient(135deg,#581C87,#9333EA)' },
    { label: 'Red', value: 'linear-gradient(135deg,#7F1D1D,#DC2626)' },
    { label: 'Pink', value: 'linear-gradient(135deg,#831843,#DB2777)' },
  ];

  function handleSave() {
    if (!imageUrl) return;
    setLocalBusy(true);
    onSave(
      {
        title: title.trim() || null,
        subtitle: subtitle.trim() || null,
        image_url: imageUrl,
        link_url: linkUrl.trim() || null,
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
        // BUG FIX: customer site (BannerCardM.jsx / App.jsx) already reads
        // b.bg_gradient aur b.button_text, par ye form pehle in fields ko
        // save hi nahi karta tha — har banner same default green + "Shop Now"
        // dikhata tha. Ab admin in dono ko customize kar sakta hai.
        bg_gradient: bgGradient || null,
        button_text: buttonText.trim() || null,
      },
      () => setLocalBusy(false)
    );
  }

  return (
    <div>
      <div className="form-grid">
        <div className="f-group">
          <label htmlFor="bn-title">Title (optional)</label>
          <input id="bn-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Summer Sale" />
        </div>
        <div className="f-group">
          <label htmlFor="bn-subtitle">Subtitle (optional)</label>
          <input id="bn-subtitle" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. 20% OFF sab products par" />
        </div>
        <div className="f-group">
          <label htmlFor="bn-link">Link URL (optional)</label>
          <input id="bn-link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="e.g. /category/dairy" />
          <span style={{ fontSize: '0.72rem', color: 'var(--gray)' }}>
            Category par bhejne ke liye <code>/category/&lt;slug&gt;</code> likhein, ya pura https:// link daalein bahar khulne ke liye.
          </span>
        </div>
        <div className="f-group">
          <label htmlFor="bn-btn-text">Button Text (optional)</label>
          <input id="bn-btn-text" value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder="Shop Now" />
        </div>
        <div className="f-group">
          <label htmlFor="bn-gradient">Background Color</label>
          <select id="bn-gradient" value={bgGradient} onChange={(e) => setBgGradient(e.target.value)}>
            <option value="">Default (Green)</option>
            {GRADIENT_PRESETS.map((g) => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
        </div>
        <div className="f-group">
          <label htmlFor="bn-sort">Sort Order</label>
          <input id="bn-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="bn-active">Status</label>
          <select id="bn-active" value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>

        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <BannerImageSlot imageUrl={imageUrl} onChange={setImageUrl} />
        </div>
      </div>

      <div className="modal-actions">
        <button
          className="btn-main"
          disabled={localBusy || !imageUrl}
          onClick={handleSave}
        >
          {localBusy ? 'Saving...' : (initial ? 'Save Changes' : 'Add Banner')}
        </button>
      </div>
    </div>
  );
}

/* ── Main Banners Page ───────────────────────────────────────────────────── */
export default function Banners() {
  const toast = useToast();
  const modal = useModal();
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await db
      .from('banners')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      toast.show(`Banners load nahi hue: ${error.message}`, { type: 'error' });
      setLoading(false);
      return;
    }
    setBanners(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function saveBanner(payload, id, onError) {
    let error;
    if (id) {
      ({ error } = await db.from('banners').update(payload).eq('id', id));
    } else {
      ({ error } = await db.from('banners').insert(payload));
    }
    if (error) {
      toast.show(`Save nahi hua: ${error.message}`, { type: 'error' });
      if (onError) onError();
      return;
    }
    modal.close();
    toast.show(id ? 'Banner update ho gaya ✅' : 'Banner add ho gaya ✅', { type: 'success' });
    load();
  }

  function openAdd() {
    modal.open({
      title: 'Add Banner',
      content: <BannerForm onSave={(payload, onErr) => saveBanner(payload, null, onErr)} />,
    });
  }

  function openEdit(b) {
    modal.open({
      title: 'Edit Banner',
      content: <BannerForm initial={b} onSave={(payload, onErr) => saveBanner(payload, b.id, onErr)} />,
    });
  }

  async function handleDelete(b) {
    const confirmed = await modal.confirm({
      title: 'Delete banner?',
      message: 'Ye banner permanently delete ho jayega.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const { error } = await db.from('banners').delete().eq('id', b.id);
    if (error) { toast.show(`Delete nahi hua: ${error.message}`, { type: 'error' }); return; }
    toast.show('Banner delete ho gaya', { type: 'success' });
    load();
  }

  async function toggleActive(b) {
    const { error } = await db.from('banners').update({ is_active: !b.is_active }).eq('id', b.id);
    if (error) { toast.show(`Update nahi hua: ${error.message}`, { type: 'error' }); return; }
    load();
  }

  return (
    <AppLayout title="Banners">
      <div className="section-title">Banners Management</div>
      <div className="section-sub">
        Home page par dikhne wale banners — add, edit, reorder karein
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn-main" onClick={openAdd}>＋ Add Banner</button>
      </div>

      <div className="cat-grid">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div className="cat-card" key={i}>
              <div className="skel" style={{ height: 120 }} aria-hidden="true" />
              <div className="cat-body">
                <div className="skel" style={{ height: 16, width: '60%' }} />
              </div>
            </div>
          ))
        ) : banners.length === 0 ? (
          <div className="cat-add-card" style={{ gridColumn: '1/-1', minHeight: 180 }}>
            <div style={{ textAlign: 'center', color: 'var(--gray)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🖼️</div>
              <div>Koi banner nahi hai — pehla banner add karein</div>
            </div>
          </div>
        ) : (
          banners.map((b) => (
            <div className={`cat-card${b.is_active ? '' : ' inactive'}`} key={b.id}>
              <div className="cat-img-wrap" style={{ aspectRatio: '16/5' }}>
                {b.image_url ? (
                  <img src={b.image_url} alt={b.title || 'Banner'} loading="lazy" />
                ) : (
                  <div className="cat-img-placeholder">🖼️</div>
                )}
                {!b.is_active && (
                  <span className="cat-default-badge" style={{ background: 'var(--gray)' }}>Inactive</span>
                )}
                <span className="cat-default-badge" style={{ left: 8, right: 'auto', background: 'rgba(0,0,0,0.5)' }}>
                  #{b.sort_order}
                </span>
              </div>

              <div className="cat-body">
                <div className="cat-name">
                  {b.title || <span style={{ color: 'var(--gray)', fontStyle: 'italic' }}>No title</span>}
                </div>
                {b.subtitle && <div className="cat-meta">{b.subtitle}</div>}
                {b.link_url && <div className="cat-meta" style={{ fontSize: '0.7rem' }}>🔗 {b.link_url}</div>}
              </div>

              <div className="cat-actions">
                <button className="act-btn" onClick={() => openEdit(b)}>✏️ Edit</button>
                <button
                  className="act-btn"
                  style={{ color: b.is_active ? 'var(--gray)' : 'var(--primary)' }}
                  onClick={() => toggleActive(b)}
                >
                  {b.is_active ? '⏸ Hide' : '▶ Show'}
                </button>
                <button className="act-btn danger" onClick={() => handleDelete(b)}>🗑️ Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </AppLayout>
  );
}