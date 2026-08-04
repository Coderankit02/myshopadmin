import { useEffect, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';
import { audit } from '../lib/audit';
import '../pagestyles/categories.css';

function slugify(name) {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/* ── Single image slot (logo / banner) ─────────────────────────────────── */
function SingleImageSlot({ imageUrl, onChange, label, hint, aspectRatio }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const toast = useToast();

  async function handleFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { url, error } = await uploadToCloudinary(file, 'myshop/brands');
    setUploading(false);
    if (url) onChange(url);
    else toast.show(`❌ Upload nahi hui: ${error || 'Unknown error'}`, { type: 'error' });
    e.target.value = '';
  }

  return (
    <div className="img-upload-section">
      <label className="img-upload-label">{label}<span>{hint}</span></label>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFilePick} />
      <div
        className={`img-slot${imageUrl ? '' : ' add-slot'}`}
        style={{ aspectRatio: aspectRatio || '1/1', borderRadius: 12, width: '100%', position: 'relative' }}
        onClick={() => !imageUrl && inputRef.current?.click()}
      >
        {uploading ? (
          <div className="img-uploading">⏳ Upload ho raha hai...</div>
        ) : imageUrl ? (
          <>
            <img src={imageUrl} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div className="img-controls">
              <button type="button" className="img-ctrl-btn set-def" onClick={() => inputRef.current?.click()}>✏️ Change</button>
              <button type="button" className="img-ctrl-btn del" onClick={() => onChange('')}>🗑️ Hatao</button>
            </div>
          </>
        ) : (
          <>
            <span className="img-slot-add-icon">📷</span>
            <span className="img-slot-add-text">Upload Karein</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── BrandForm ─────────────────────────────────────────────────────────── */
function BrandForm({ initial, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url || '');
  const [bannerUrl, setBannerUrl] = useState(initial?.banner_url || '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [localBusy, setLocalBusy] = useState(false);

  const valid = name.trim();

  function handleSave() {
    setLocalBusy(true);
    onSave(
      {
        name: name.trim(),
        slug: slugify(name),
        description: description.trim() || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      },
      () => setLocalBusy(false)
    );
  }

  return (
    <div>
      <div className="form-grid">
        <div className="f-group">
          <label htmlFor="br-name">Brand Name *</label>
          <input id="br-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amul" />
        </div>
        <div className="f-group">
          <label htmlFor="br-sort">Sort Order</label>
          <input id="br-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="br-active">Status</label>
          <select id="br-active" value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <label htmlFor="br-desc">Description</label>
          <textarea id="br-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="f-group">
          <SingleImageSlot imageUrl={logoUrl} onChange={setLogoUrl} label="Brand Logo" hint="Square (500×500) — product cards par dikhega" aspectRatio="1/1" />
        </div>
        <div className="f-group">
          <SingleImageSlot imageUrl={bannerUrl} onChange={setBannerUrl} label="Brand Banner" hint="Wide (1920×600) — brand page par" aspectRatio="16/5" />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-main" disabled={localBusy || !valid} onClick={handleSave}>
          {localBusy ? 'Saving...' : (initial ? 'Save Changes' : 'Add Brand')}
        </button>
      </div>
    </div>
  );
}

/* ── Main Brands Page ──────────────────────────────────────────────────── */
export default function Brands() {
  const modal = useModal();
  const toast = useToast();
  const [brands, setBrands] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await db.from('brands').select('*').order('sort_order', { ascending: true });
    if (error) {
      toast.show(`Brands load nahi hue: ${error.message}`, { type: 'error' });
      setLoading(false);
      return;
    }
    setBrands(data || []);

    const { data: prods } = await db.from('products').select('brand_id');
    const c = {};
    (prods || []).forEach((p) => { if (p.brand_id) c[p.brand_id] = (c[p.brand_id] || 0) + 1; });
    setCounts(c);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function saveBrand(payload, id, onError) {
    let error;
    if (id) ({ error } = await db.from('brands').update(payload).eq('id', id));
    else ({ error } = await db.from('brands').insert(payload));
    if (error) {
      toast.show(`Save nahi hua: ${error.message}`, { type: 'error' });
      if (onError) onError();
      return;
    }
    audit(id ? 'brand.update' : 'brand.create', 'brand', id, { name: payload.name });
    modal.close();
    toast.show(id ? 'Brand update ho gaya ✅' : 'Brand add ho gaya ✅', { type: 'success' });
    load();
  }

  function openAdd() {
    modal.open({ title: 'Add Brand', content: <BrandForm onSave={(payload, onErr) => saveBrand(payload, null, onErr)} /> });
  }

  function openEdit(b) {
    modal.open({ title: `Edit "${b.name}"`, content: <BrandForm initial={b} onSave={(payload, onErr) => saveBrand(payload, b.id, onErr)} /> });
  }

  async function handleDelete(b) {
    const confirmed = await modal.confirm({
      title: 'Delete brand?',
      message: `"${b.name}" delete ho jayega. Products ki brand link hata di jayegi (products delete nahi honge).`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const { error } = await db.from('brands').delete().eq('id', b.id);
    if (error) {
      toast.show(`Delete nahi hua: ${error.message}`, { type: 'error' });
      return;
    }
    audit('brand.delete', 'brand', b.id, { name: b.name });
    toast.show('Brand delete ho gaya', { type: 'success' });
    load();
  }

  async function toggleActive(b) {
    const { error } = await db.from('brands').update({ is_active: !b.is_active, updated_at: new Date().toISOString() }).eq('id', b.id);
    if (error) { toast.show(`Update nahi hua: ${error.message}`, { type: 'error' }); return; }
    load();
  }

  return (
    <AppLayout title="Brands">
      <div className="section-title">Brands Management</div>
      <div className="section-sub">
        Brands add/edit karein — logo + banner upload. Product form mein brand select hota hai aur customer site par dikhta hai.
      </div>

      <div className="cat-grid" aria-busy={loading}>
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="cat-card" key={i}>
              <div className="skel" style={{ height: 100 }} aria-hidden="true" />
              <div className="cat-body"><div className="skel" style={{ height: 16, width: '60%' }} /></div>
            </div>
          ))
        ) : (
          <>
            {brands.map((b) => (
              <div className={`cat-card${b.is_active ? '' : ' inactive'}`} key={b.id}>
                <div className="cat-img-wrap">
                  {b.logo_url ? (
                    <img src={b.logo_url} alt={b.name} loading="lazy" />
                  ) : (
                    <div className="cat-img-placeholder">🏷️</div>
                  )}
                  {!b.is_active && <span className="cat-default-badge">Inactive</span>}
                </div>
                <div className="cat-body">
                  <div className="cat-name">
                    <span>{b.name}</span>
                  </div>
                  <div className="cat-meta">
                    {counts[b.id] || 0} products
                    {b.banner_url && ' · banner ✓'}
                  </div>
                  {b.description && (
                    <div className="cat-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.description}</div>
                  )}
                </div>
                <div className="cat-actions">
                  <button className="act-btn" onClick={() => openEdit(b)}>✏️ Edit</button>
                  <button className="act-btn" style={{ color: b.is_active ? 'var(--gray)' : 'var(--primary)' }} onClick={() => toggleActive(b)}>
                    {b.is_active ? '⏸ Hide' : '▶ Show'}
                  </button>
                  <button className="act-btn danger" onClick={() => handleDelete(b)}>🗑️ Delete</button>
                </div>
              </div>
            ))}
            <div className="cat-add-card">
              <button className="btn-ghost" onClick={openAdd}>＋ Add Brand</button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
