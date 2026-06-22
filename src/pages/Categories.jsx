import { useEffect, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import '../pagestyles/categories.css';

const MAX_IMAGES = 3;
const BUCKET = 'category-images';

function slugify(name) {
  return (name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/* ── Base64 upload helper (bucket nahi ho to base64 use karta hai) ───────── */
// Canvas se image compress karo — quality visually same, size 60-70% kam
function compressImage(file, maxPx = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxPx || height > maxPx) {
          if (width > height) { height = Math.round(height * maxPx / width); width = maxPx; }
          else { width = Math.round(width * maxPx / height); height = maxPx; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', quality);
      };
      img.onerror = () => resolve(file);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

async function uploadImageFile(file, folder = 'categories') {
  // Pehle compress karo
  const compressed = await compressImage(file, 1200, 0.85);
  const uploadFile = compressed instanceof Blob ? compressed : file;

  try {
    const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    const { data, error } = await db.storage.from(BUCKET).upload(path, uploadFile, {
      cacheControl: '3600', upsert: false, contentType: 'image/jpeg',
    });
    if (!error && data) {
      const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);
      return { url: urlData.publicUrl, error: null };
    }
  } catch (_) { /* fallback below */ }

  // Fallback: base64
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({ url: e.target.result, error: null });
    reader.onerror = () => resolve({ url: null, error: 'File read failed' });
    reader.readAsDataURL(uploadFile);
  });
}

/* ── ImageUploadGrid Component ───────────────────────────────────────────── */
function ImageUploadGrid({ images, onChange, maxImages }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(null); // index of slot being uploaded

  // images: [{ url, isDefault }]

  function triggerPick() {
    if (images.length >= maxImages) return;
    inputRef.current?.click();
  }

  async function handleFilePick(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = maxImages - images.length;
    const toUpload = files.slice(0, remaining);

    for (const file of toUpload) {
      const idx = images.length; // slot being filled
      setUploading(idx);
      const { url } = await uploadImageFile(file, 'categories');
      if (url) {
        const isFirst = images.length === 0;
        onChange([...images, { url, isDefault: isFirst }]);
      }
      setUploading(null);
    }
    e.target.value = '';
  }

  function setDefault(idx) {
    onChange(images.map((img, i) => ({ ...img, isDefault: i === idx })));
  }

  function remove(idx) {
    const next = images.filter((_, i) => i !== idx);
    // If removed was default, make first one default
    if (images[idx].isDefault && next.length > 0) {
      next[0] = { ...next[0], isDefault: true };
    }
    onChange(next);
  }

  const slots = [...images];
  // Add "+" slot if space available
  const canAdd = slots.length < maxImages;

  return (
    <div className="img-upload-section">
      <label className="img-upload-label">
        Images
        <span>({images.length}/{maxImages}) — ⭐ Default wali card par dikhegi</span>
      </label>

      {/* Hidden file input — accepts camera + gallery on mobile */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture={false}
        style={{ display: 'none' }}
        onChange={handleFilePick}
      />

      <div className="img-grid">
        {slots.map((img, i) => (
          <div
            key={i}
            className={`img-slot${img.isDefault ? ' is-default' : ''}`}
          >
            <img src={img.url} alt={`Image ${i + 1}`} />
            {img.isDefault && <span className="img-star">⭐ Default</span>}
            <div className="img-controls">
              {!img.isDefault && (
                <button type="button" className="img-ctrl-btn set-def" onClick={() => setDefault(i)}>
                  ⭐ Default
                </button>
              )}
              <button type="button" className="img-ctrl-btn del" onClick={() => remove(i)}>
                🗑️ Hatao
              </button>
            </div>
            {uploading === i && (
              <div className="img-uploading">Upload ho raha hai...</div>
            )}
          </div>
        ))}

        {/* Add slot */}
        {canAdd && (
          <div className="img-slot add-slot" onClick={triggerPick}>
            {uploading === images.length ? (
              <div className="img-uploading" style={{ position: 'static', background: 'none', color: 'var(--gray)' }}>
                Upload...
              </div>
            ) : (
              <>
                <span className="img-slot-add-icon">📷</span>
                <span className="img-slot-add-text">Photo Add</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CategoryForm ───────────────────────────────────────────────────────── */
function CategoryForm({ initial, existingImages, onSave }) {
  const [name, setName]         = useState(initial?.name || '');
  const [icon, setIcon]         = useState(initial?.icon_emoji || '🗂️');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [images, setImages]     = useState(() => {
    // Build from existing category_images rows
    const rows = existingImages || [];
    if (rows.length === 0 && initial?.image_url) {
      // Legacy: old single image_url field
      return [{ url: initial.image_url, isDefault: true }];
    }
    return rows.map((r) => ({ url: r.image_url, isDefault: r.is_default, id: r.id }));
  });
  const [localBusy, setLocalBusy] = useState(false);

  function handleSave() {
    setLocalBusy(true);
    onSave(
      {
        name: name.trim(),
        slug: slugify(name),
        icon_emoji: icon.trim() || '🛒',
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
        // Primary image URL for quick access (default image)
        image_url: images.find((i) => i.isDefault)?.url || images[0]?.url || null,
      },
      images,
      () => setLocalBusy(false)
    );
  }

  const valid = name.trim();

  return (
    <div>
      <div className="form-grid">
        <div className="f-group">
          <label htmlFor="cat-name">Category Name *</label>
          <input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dairy" />
        </div>
        <div className="f-group">
          <label htmlFor="cat-icon">Icon (emoji)</label>
          <input id="cat-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🗂️" />
        </div>
        <div className="f-group">
          <label htmlFor="cat-sort">Sort Order</label>
          <input id="cat-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="cat-active">Status</label>
          <select id="cat-active" value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>

        {/* Full-width image upload */}
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <ImageUploadGrid images={images} onChange={setImages} maxImages={MAX_IMAGES} />
        </div>
      </div>

      <div className="modal-actions">
        <button
          className="btn-main"
          disabled={localBusy || !valid}
          onClick={handleSave}
        >
          {localBusy ? 'Saving...' : (initial ? 'Save Changes' : 'Add Category')}
        </button>
      </div>
    </div>
  );
}

/* ── Main Categories Page ───────────────────────────────────────────────── */
export default function Categories() {
  const toast   = useToast();
  const modal   = useModal();
  const [categories, setCategories] = useState([]);
  const [catImages, setCatImages]   = useState({}); // { category_id: [rows] }
  const [counts, setCounts]         = useState({});
  const [loading, setLoading]       = useState(true);

  async function load() {
    setLoading(true);

    const { data: cats, error } = await db
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      toast.show(`Categories load nahi ho payi: ${error.message}`, { type: 'error' });
      setLoading(false);
      return;
    }
    setCategories(cats || []);

    // Load category_images
    const { data: imgs } = await db
      .from('category_images')
      .select('*')
      .order('sort_order', { ascending: true });

    const imgMap = {};
    (imgs || []).forEach((img) => {
      if (!imgMap[img.category_id]) imgMap[img.category_id] = [];
      imgMap[img.category_id].push(img);
    });
    setCatImages(imgMap);

    // Product counts
    const { data: prods } = await db.from('products').select('category_id');
    const c = {};
    (prods || []).forEach((p) => {
      if (p.category_id) c[p.category_id] = (c[p.category_id] || 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /* ── Save category + its images ─────────────────────────────────────── */
  async function saveCategory(payload, images, id, onError) {
    let catId = id;
    let error;

    if (id) {
      ({ error } = await db.from('categories').update(payload).eq('id', id));
    } else {
      const { data, error: insErr } = await db.from('categories').insert(payload).select().single();
      error = insErr;
      catId = data?.id;
    }

    if (error) {
      toast.show(`Save nahi hua: ${error.message}`, { type: 'error' });
      if (onError) onError();
      return;
    }

    // Sync category_images: delete old, insert new
    if (catId) {
      await db.from('category_images').delete().eq('category_id', catId);
      if (images.length > 0) {
        const rows = images.map((img, idx) => ({
          category_id: catId,
          image_url: img.url,
          is_default: img.isDefault || false,
          sort_order: idx,
        }));
        const { error: imgErr } = await db.from('category_images').insert(rows);
        if (imgErr) console.error('[Categories] image save failed:', imgErr.message);
      }
    }

    modal.close();
    toast.show(id ? 'Category update ho gayi ✅' : 'Category add ho gayi ✅', { type: 'success' });
    load();
  }

  function openAdd() {
    modal.open({
      title: 'Add Category',
      content: (
        <CategoryForm
          onSave={(payload, images, onErr) => saveCategory(payload, images, null, onErr)}
        />
      ),
    });
  }

  function openEdit(c) {
    modal.open({
      title: `Edit "${c.name}"`,
      content: (
        <CategoryForm
          initial={c}
          existingImages={catImages[c.id] || []}
          onSave={(payload, images, onErr) => saveCategory(payload, images, c.id, onErr)}
        />
      ),
    });
  }

  async function handleDelete(c) {
    const confirmed = await modal.confirm({
      title: 'Delete category?',
      message: `Are you sure you want to delete "${c.name}"? Products linked to it won't be deleted, but they'll lose their category.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    const { error } = await db.from('categories').delete().eq('id', c.id);
    if (error) {
      const deactivate = await modal.confirm({
        title: 'Delete nahi ho saka',
        message: `Ye category delete nahi ho payi (${error.message}). Kya isse Inactive kar dein instead?`,
        confirmLabel: 'Inactive Karein',
      });
      if (deactivate) {
        const { error: e2 } = await db.from('categories').update({ is_active: false }).eq('id', c.id);
        if (!e2) { toast.show('Category inactive kar di gayi', { type: 'success' }); load(); }
        else toast.show(`Wo bhi fail ho gaya: ${e2.message}`, { type: 'error' });
      }
      return;
    }
    toast.show('Category delete ho gayi', { type: 'success' });
    load();
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <AppLayout title="Categories">
      <div className="section-title">Categories Management</div>
      <div className="section-sub">
        Categories add, edit, reorder — har category mein max 3 images, default wali card par dikhegi
      </div>

      <div className="cat-grid" aria-busy={loading}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div className="cat-card" key={i}>
              <div className="skel" style={{ height: 100 }} aria-hidden="true" />
              <div className="cat-body">
                <div className="skel" style={{ height: 16, width: '60%' }} />
              </div>
            </div>
          ))
        ) : (
          <>
            {categories.map((c) => {
              const imgs = catImages[c.id] || [];
              const defaultImg = imgs.find((i) => i.is_default) || imgs[0];
              const displayUrl = defaultImg?.image_url || c.image_url || null;

              return (
                <div className={`cat-card${c.is_active ? '' : ' inactive'}`} key={c.id}>
                  {/* Image area */}
                  <div className="cat-img-wrap">
                    {displayUrl ? (
                      <img src={displayUrl} alt={c.name} loading="lazy" />
                    ) : (
                      <div className="cat-img-placeholder">{c.icon_emoji || '🗂️'}</div>
                    )}
                    {imgs.length > 1 && (
                      <span className="cat-default-badge">
                        {imgs.findIndex((i) => i.is_default) + 1 || 1}/{imgs.length} imgs
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="cat-body">
                    <div className="cat-name">
                      <span>{c.icon_emoji || '🗂️'}</span>
                      <span>{c.name}</span>
                      {!c.is_active && (
                        <span className="badge b-cancelled" style={{ marginLeft: 4, fontSize: '0.65rem' }}>Inactive</span>
                      )}
                    </div>
                    <div className="cat-meta">
                      {counts[c.id] || 0} products
                      {imgs.length > 0 && ` · ${imgs.length} image${imgs.length > 1 ? 's' : ''}`}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="cat-actions">
                    <button className="act-btn" onClick={() => openEdit(c)}>✏️ Edit</button>
                    <button className="act-btn danger" onClick={() => handleDelete(c)}>🗑️ Delete</button>
                  </div>
                </div>
              );
            })}

            {/* Add new */}
            <div className="cat-add-card">
              <button className="btn-ghost" onClick={openAdd}>＋ Add Category</button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}