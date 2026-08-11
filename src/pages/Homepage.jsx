import { useEffect, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { audit } from '../lib/audit';
import { uploadToCloudinary } from '../lib/cloudinary';
import '../pagestyles/homepage.css';

/* ── Ad Strip helpers ─────────────────────────────────────────────── */
const LINK_LABELS = { none: 'Koi link nahi', category: 'Category', product: 'Product' };

function AdStripsPanel({ toast, audit: logAudit }) {
  const [strips, setStrips] = useState([]);
  const [cats, setCats] = useState([]);
  const [prods, setProds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [newTitle, setNewTitle] = useState('');
  // per-strip image form
  const [imgUrl, setImgUrl] = useState('');
  const [imgLinkType, setImgLinkType] = useState('none');
  const [imgLinkValue, setImgLinkValue] = useState('');
  const [banners, setBanners] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const [sRes, cRes, pRes, bRes] = await Promise.all([
        db.from('homepage_ad_sections').select('*,homepage_ad_images(*)').order('position', { ascending: true }),
        db.from('categories').select('id,name').eq('is_active', true).order('sort_order'),
        db.from('products').select('id,name').eq('is_active', true).order('created_at', { ascending: false }).limit(300),
        db.from('banners').select('image_url,title').eq('is_active', true).limit(20),
      ]);
      if (sRes.error) throw sRes.error;
      setStrips(sRes.data || []);
      setCats(cRes.data || []);
      setProds(pRes.data || []);
      setBanners(bRes.data || []);
    } catch (e) {
      toast.show(`Ad strips load nahi hue: ${e.message}`, { type: 'error' });
    }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function addStrip() {
    if (!newTitle.trim()) { toast.show('Strip ka title daalein', { type: 'error' }); return; }
    setBusy(true);
    const { data: strip, error } = await db.from('homepage_ad_sections').insert({ title: newTitle.trim() }).select('id,title').single();
    setBusy(false);
    if (error || !strip) { toast.show(`Add nahi hua: ${error?.message || 'try again'}`, { type: 'error' }); return; }
    // Section Order me bhi row banao (end par) — position aur show/hide ab
    // Section Order list se hi control hoti hai (drag up/down + 👁 Hide).
    const { data: lastSec } = await db.from('homepage_sections').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    const nextOrder = (lastSec?.[0]?.sort_order || 0) + 1;
    await db.from('homepage_sections').insert({ section_key: 'ad_strip', label: strip.title, icon: '🖼️', ad_strip_id: strip.id, sort_order: nextOrder, enabled: true });
    logAudit('homepage.ad_strip_add', 'homepage_ad_sections', strip.id, { title: strip.title });
    setNewTitle('');
    toast.show('Ad strip add ho gayi ✅ — ab Section Order me drag karke position set karein', { type: 'success' });
    load();
  }

  async function deleteStrip(s) {
    if (!window.confirm(`Strip "${s.title}" + uski saari images delete?`)) return;
    const { error } = await db.from('homepage_ad_sections').delete().eq('id', s.id);
    if (error) { toast.show(`Delete nahi hua: ${error.message}`, { type: 'error' }); return; }
    logAudit('homepage.ad_strip_delete', 'homepage_ad_sections', s.id, { title: s.title });
    toast.show('Strip delete ✅', { type: 'success' });
    load();
  }

  // 📤 File upload → Cloudinary → URL auto-fill (URL ya upload — dono se add ho sakti hai)
  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadToCloudinary(file, 'myshop/ad-strips');
    setUploading(false);
    if (e.target) e.target.value = '';
    if (res.url) {
      setImgUrl(res.url);
      toast.show('Image upload ho gayi ✅ — link chunein, phir + Image', { type: 'success' });
    } else {
      toast.show(`Upload fail: ${res.error || 'dobara try karein'}`, { type: 'error' });
    }
  }

  async function addImage(strip) {
    const url = imgUrl.trim();
    if (!url) { toast.show('Image URL daalein ya 📤 Upload karein', { type: 'error' }); return; }
    setBusy(true);
    const row = {
      section_id: strip.id,
      image_url: url,
      link_type: imgLinkType,
      link_value: imgLinkType === 'none' ? null : imgLinkValue || null,
      sort_order: (strip.homepage_ad_images?.length || 0) + 1,
    };
    const { error } = await db.from('homepage_ad_images').insert(row);
    setBusy(false);
    if (error) { toast.show(`Image add nahi hui: ${error.message}`, { type: 'error' }); return; }
    setImgUrl(''); setImgLinkValue('');
    logAudit('homepage.ad_image_add', 'homepage_ad_images', strip.id, {});
    toast.show('Image add ho gayi ✅', { type: 'success' });
    load();
  }

  // 📤 FILE UPLOAD: device se image select karo → Cloudinary par upload → turant strip me add
  async function handleUploadFile(e, strip) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    const res = await uploadToCloudinary(file, 'myshop/ad-strips');
    if (!res.url) {
      setUploading(false);
      toast.show(`Upload fail: ${res.error || 'dobara try karein'}`, { type: 'error' });
      return;
    }
    const row = {
      section_id: strip.id,
      image_url: res.url,
      link_type: imgLinkType,
      link_value: imgLinkType === 'none' ? null : imgLinkValue || null,
      sort_order: (strip.homepage_ad_images?.length || 0) + 1,
    };
    const { error } = await db.from('homepage_ad_images').insert(row);
    setUploading(false);
    if (error) { toast.show(`Image add nahi hui: ${error.message}`, { type: 'error' }); return; }
    setImgLinkValue('');
    logAudit('homepage.ad_image_upload', 'homepage_ad_images', strip.id, {});
    toast.show('Image upload + add ho gayi ✅', { type: 'success' });
    load();
  }

  async function deleteImage(img, stripId) {
    const { error } = await db.from('homepage_ad_images').delete().eq('id', img.id);
    if (error) { toast.show(`Delete nahi hua: ${error.message}`, { type: 'error' }); return; }
    load();
  }

  async function moveImage(img, dir) {
    const strip = strips.find((s) => s.id === img.section_id);
    if (!strip) return;
    const imgs = [...(strip.homepage_ad_images || [])].sort((a, b) => a.sort_order - b.sort_order);
    const idx = imgs.findIndex((x) => x.id === img.id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= imgs.length) return;
    [imgs[idx], imgs[j]] = [imgs[j], imgs[idx]];
    // BUG FIX: sort_order bhi 1..N renumber (duplicate order ka issue khatam)
    const { error } = await db.from('homepage_ad_images').upsert(
      imgs.map((x, i) => ({ id: x.id, sort_order: i + 1 })),
      { onConflict: 'id' }
    );
    if (error) { toast.show(`Order update nahi hua: ${error.message}`, { type: 'error' }); return; }
    load();
  }

  async function toggleImage(img) {
    await db.from('homepage_ad_images').update({ is_active: !img.is_active }).eq('id', img.id);
    load();
  }

  const linkTargets = imgLinkType === 'category' ? cats : imgLinkType === 'product' ? prods : [];

  return (
    <div className="table-wrap" style={{ marginTop: 22 }}>
      <div className="table-head">
        <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>🖼️ Ad Images Strips</h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>Homepage par auto-scroll hone wali image strips (no text, no dots) — neeche Section Order me drag karke position set karein</span>
      </div>

      {/* Add new strip */}
      <div className="hp-add-row" style={{ display: 'flex', gap: 8, padding: '12px 16px', flexWrap: 'wrap' }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Strip title (e.g. Weekly Offers)"
          style={{ flex: 1, minWidth: 200, borderRadius: 10, border: '1.5px solid var(--border)', padding: '8px 12px', fontSize: '0.85rem', fontFamily: 'Poppins' }}
        />
        <button type="button" className="act-btn primary" disabled={busy} onClick={addStrip} style={{ background: 'var(--primary)', color: '#fff', fontWeight: 700, padding: '9px 16px', borderRadius: 10 }}>
          + Add Strip
        </button>
      </div>

      {loading ? (
        <div className="hp-list"><div className="skel" style={{ height: 56 }} aria-hidden="true" /></div>
      ) : strips.length === 0 ? (
        <div className="placeholder-card" style={{ margin: 16 }}>
          <div className="pc-icon">🖼️</div>
          <h4>Koi ad strip nahi</h4>
          <p>Upar se strip add karein, phir usme images (URL ya banner se) aur link (category/product) lagayein.</p>
        </div>
      ) : (
        <div className="hp-list">
          {strips.map((s) => {
            const imgs = (s.homepage_ad_images || []).slice().sort((a, b) => a.sort_order - b.sort_order);
            return (
              <div key={s.id} className={`hp-row${s.is_active ? '' : ' disabled'}`}>
                <span className="hp-icon">🖼️</span>
                <div className="hp-main">
                  <div className="hp-label">
                    {s.title}
                    <span className="hp-key">position {s.position} · {imgs.length} images</span>
                  </div>
                  {expanded === s.id && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
                      {/* images grid */}
                      {imgs.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                          {imgs.map((img, i) => (
                            <div key={img.id} style={{ position: 'relative', width: 92 }}>
                              <img src={img.image_url} alt="" style={{ width: 92, height: 58, objectFit: 'cover', borderRadius: 8, border: `2px solid ${img.is_active ? 'var(--primary)' : 'var(--border)'}`, opacity: img.is_active ? 1 : 0.4 }} />
                              <div style={{ fontSize: '0.62rem', color: 'var(--gray)', marginTop: 2 }}>
                                {LINK_LABELS[img.link_type] || 'none'}
                              </div>
                              <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                                <button type="button" className="act-btn" onClick={() => moveImage(img, -1)} disabled={i === 0}>◀</button>
                                <button type="button" className="act-btn" onClick={() => moveImage(img, 1)} disabled={i === imgs.length - 1}>▶</button>
                                <button type="button" className="act-btn" onClick={() => toggleImage(img)}>{img.is_active ? '🙈' : '👁'}</button>
                                <button type="button" className="act-btn" style={{ color: 'var(--red)' }} onClick={() => deleteImage(img, s.id)}>🗑</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {/* add image form */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <select value={imgLinkType} onChange={(e) => { setImgLinkType(e.target.value); setImgLinkValue(''); }} style={{ borderRadius: 8, border: '1.5px solid var(--border)', padding: '7px 10px', fontSize: '0.8rem', fontFamily: 'Poppins' }}>
                          <option value="none">No link</option>
                          <option value="category">→ Category</option>
                          <option value="product">→ Product</option>
                        </select>
                        {imgLinkType !== 'none' && (
                          <select value={imgLinkValue} onChange={(e) => setImgLinkValue(e.target.value)} style={{ borderRadius: 8, border: '1.5px solid var(--border)', padding: '7px 10px', fontSize: '0.8rem', fontFamily: 'Poppins', maxWidth: 220 }}>
                            <option value="">— choose —</option>
                            {linkTargets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        )}
                        <input
                          value={imgUrl}
                          onChange={(e) => setImgUrl(e.target.value)}
                          placeholder="Image URL (ya 📤 upload karein)"
                          style={{ flex: 1, minWidth: 220, borderRadius: 10, border: '1.5px solid var(--border)', padding: '8px 12px', fontSize: '0.8rem', fontFamily: 'Poppins' }}
                        />
                        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUpload(e)} />
                        <button type="button" className="act-btn" disabled={uploading} onClick={() => fileRef.current?.click()} title="Device se image upload karein" style={{ border: '1.5px dashed var(--primary)', color: 'var(--primary-dark)', background: 'var(--primary-light)', fontWeight: 700, padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap' }}>
                          {uploading ? '⏳ Uploading...' : '📤 Upload'}
                        </button>
                        <button type="button" className="act-btn primary" disabled={busy || uploading} onClick={() => addImage(s)} style={{ background: 'var(--primary)', color: '#fff', fontWeight: 700, padding: '8px 14px', borderRadius: 10 }}>
                          + Image
                        </button>
                        {/* 📤 Upload from device — file → Cloudinary */}
                        <input type="file" id={`adfile-${s.id}`} accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUploadFile(e, s)} />
                        <label htmlFor={`adfile-${s.id}`} className="act-btn primary" style={{ background: '#8B5CF6', color: '#fff', fontWeight: 700, padding: '8px 14px', borderRadius: 10, cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.65 : 1 }}>
                          {uploading ? '⏳ Uploading...' : '📤 Upload Image'}
                        </label>
                      </div>
                      {/* banner quick-pick */}
                      {banners.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {banners.map((b, i) => (
                            <button key={i} type="button" title={b.title || ''} onClick={() => setImgUrl(b.image_url)}
                              style={{ padding: 0, border: '2px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'none', cursor: 'pointer' }}>
                              <img src={b.image_url} alt={b.title || ''} style={{ width: 64, height: 40, objectFit: 'cover', display: 'block' }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="hp-controls">
                  <button type="button" className="act-btn" onClick={() => setExpanded(expanded === s.id ? null : s.id)} title="Images manage karein">
                    {expanded === s.id ? '▾ Close' : '🖼 Images'}
                  </button>
                  <button type="button" className="act-btn" style={{ color: 'var(--red)' }} onClick={() => deleteStrip(s)} title="Delete strip (Section Order se bhi hat jayegi)">🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Homepage() {
  const toast = useToast();
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await db.from('homepage_sections').select('*').order('sort_order', { ascending: true });
    if (error) {
      toast.show(`Homepage config load nahi hua: ${error.message}`, { type: 'error' });
      setLoading(false);
      return;
    }
    setSections(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function persistOrder(next) {
    setSections(next);
    setSavingOrder(true);
    try {
      for (let i = 0; i < next.length; i++) {
        await db.from('homepage_sections').update({ sort_order: i + 1 }).eq('id', next[i].id);
      }
      audit('homepage.reorder', 'homepage', null, { order: next.map((s) => s.section_key) });
      toast.show('Homepage section order save ho gaya ✅', { type: 'success' });
    } catch (e) {
      toast.show(`Save nahi hua: ${e.message}`, { type: 'error' });
    }
    setSavingOrder(false);
  }

  function move(from, to) {
    if (to < 0 || to >= sections.length) return;
    const next = [...sections];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    persistOrder(next);
  }

  function onDrop(to) {
    if (dragIdx === null || dragIdx === to) { setDragIdx(null); return; }
    const next = [...sections];
    const [item] = next.splice(dragIdx, 1);
    next.splice(to, 0, item);
    setDragIdx(null);
    persistOrder(next);
  }

  async function toggleEnabled(s) {
    const next = sections.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x));
    setSections(next);
    const { error } = await db.from('homepage_sections').update({ enabled: !s.enabled }).eq('id', s.id);
    if (error) {
      toast.show(`Update nahi hua: ${error.message}`, { type: 'error' });
      setSections(sections);
      return;
    }
    audit(s.enabled ? 'homepage.section_hide' : 'homepage.section_show', 'homepage', s.id, { section_key: s.section_key });
  }

  async function saveTitle(s, title) {
    const clean = (title || '').trim();
    const next = sections.map((x) => (x.id === s.id ? { ...x, title: clean || null } : x));
    setSections(next);
    const { error } = await db.from('homepage_sections').update({ title: clean || null }).eq('id', s.id);
    if (error) toast.show(`Title save nahi hua: ${error.message}`, { type: 'error' });
  }

  const enabledCount = sections.filter((s) => s.enabled).length;

  return (
    <AppLayout title="Homepage Builder">
      <div className="section-title">Homepage Builder</div>
      <div className="section-sub">
        Customer homepage ka pura control — section drag karke order karein, show/hide karein, titles customize karein
      </div>

      <div className="hp-info-row">
        <div className="panel hp-info-card">
          <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>🖼️</div>
          <div>
            <b>Hero Slider</b>
            <p>Hero banner slides <b>Banners</b> page par manage hote hain. Yahan sirf slider ki visibility control hoti hai.</p>
          </div>
        </div>
        <div className="panel hp-info-card">
          <div className="stat-icon" style={{ background: 'var(--badge-yellow-bg)', color: 'var(--badge-yellow-text)' }}>⚡</div>
          <div>
            <b>Flash Sale Products</b>
            <p>Flash sale mein kaunse products dikhein — <b>Products</b> page par product ke <b>⚡ Flash Sale</b> flag se control hota hai.</p>
          </div>
        </div>
        <div className="panel hp-info-card">
          <div className="stat-icon" style={{ background: 'var(--badge-blue-bg)', color: 'var(--badge-blue-text)' }}>⭐</div>
          <div>
            <b>Featured Products</b>
            <p>Featured rail ke liye products par <b>⭐ Featured</b> flag on karein. Best Sellers / New Arrivals flags bhi Products page par hain.</p>
          </div>
        </div>
      </div>

      <AdStripsPanel toast={toast} audit={audit} />

      <div className="table-wrap">
        <div className="table-head">
          <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>
            Section Order <span style={{ color: 'var(--gray)', fontWeight: 500 }}>— {enabledCount}/{sections.length} visible</span>
          </h3>
          {savingOrder && <span style={{ fontSize: '0.8rem', color: 'var(--gray)' }}>⏳ Saving...</span>}
        </div>

        {loading ? (
          <div className="hp-list"><div className="skel" style={{ height: 56 }} aria-hidden="true" /></div>
        ) : sections.length === 0 ? (
          <div className="placeholder-card" style={{ margin: 16 }}>
            <div className="pc-icon">🏠</div>
            <h4>Homepage config setup pending</h4>
            <p>Run <code>supabase/admin-wiring-migration.sql</code> in Supabase SQL Editor once — it creates the <code>homepage_sections</code> table with the default section list.</p>
          </div>
        ) : (
          <div className="hp-list">
            {sections.map((s, i) => (
              <div
                key={s.id}
                className={`hp-row${s.enabled ? '' : ' disabled'}${dragIdx === i ? ' dragging' : ''}`}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(i)}
                onDragEnd={() => setDragIdx(null)}
              >
                <span className="hp-drag" title="Drag to reorder">⋮⋮</span>
                <span className="hp-icon">{s.icon}</span>
                <div className="hp-main">
                  <div className="hp-label">
                    {s.label}
                    <span className="hp-key">#{s.section_key}</span>
                  </div>
                  {s.title !== undefined && (
                    <input
                      className="hp-title-input"
                      defaultValue={s.title || ''}
                      placeholder="Section heading (blank = default)"
                      aria-label={`Title for ${s.label}`}
                      onBlur={(e) => saveTitle(s, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                    />
                  )}
                </div>
                <div className="hp-controls">
                  <button type="button" className="act-btn" disabled={i === 0} onClick={() => move(i, i - 1)} title="Move up">▲</button>
                  <button type="button" className="act-btn" disabled={i === sections.length - 1} onClick={() => move(i, i + 1)} title="Move down">▼</button>
                  <button
                    type="button"
                    className={`act-btn${s.enabled ? '' : ' primary'}`}
                    onClick={() => toggleEnabled(s)}
                    title={s.enabled ? 'Hide from homepage' : 'Show on homepage'}
                  >
                    {s.enabled ? '🙈 Hide' : '👁 Show'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
