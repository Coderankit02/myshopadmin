import { useEffect, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { debounce } from '../lib/utils';
import { db } from '../lib/supabase';
import '../pagestyles/products.css';

const MAX_PROD_IMAGES = 5;
const BUCKET = 'product-images';

function statusFor(p) {
  if (!p.is_active) return { label: 'Inactive', cls: 'b-cancelled' };
  if ((p.stock_quantity ?? 0) <= 0) return { label: 'Out of Stock', cls: 'b-cancelled' };
  if ((p.stock_quantity ?? 0) < 20) return { label: 'Low Stock', cls: 'b-pending' };
  return { label: 'Active', cls: 'b-delivered' };
}

/* ── Image upload helper ─────────────────────────────────────────────────── */
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

async function uploadImageFile(file, folder = 'products') {
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
      return { url: urlData.publicUrl };
    }
  } catch (_) { /* fallback */ }

  // Fallback: base64
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve({ url: e.target.result });
    reader.onerror = () => resolve({ url: null });
    reader.readAsDataURL(uploadFile);
  });
}

/* ── Product Image Upload Grid ───────────────────────────────────────────── */
function ProductImageGrid({ images, onChange }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(null);

  function triggerPick() {
    if (images.length >= MAX_PROD_IMAGES) return;
    inputRef.current?.click();
  }

  async function handleFilePick(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_PROD_IMAGES - images.length;
    const toUpload = files.slice(0, remaining);

    for (const file of toUpload) {
      const slotIdx = images.length;
      setUploading(slotIdx);
      const { url } = await uploadImageFile(file, 'products');
      if (url) {
        const isFirst = images.length === 0;
        onChange(prev => [...prev, { url, isDefault: isFirst }]);
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
    if (images[idx].isDefault && next.length > 0) {
      next[0] = { ...next[0], isDefault: true };
    }
    onChange(next);
  }

  const canAdd = images.length < MAX_PROD_IMAGES;

  return (
    <div className="pimg-section">
      <label className="pimg-label">
        Product Images
        <span>({images.length}/{MAX_PROD_IMAGES}) — ⭐ Default home & category par dikhegi</span>
      </label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFilePick}
      />

      <div className="pimg-grid">
        {images.map((img, i) => (
          <div key={i} className={`pimg-slot${img.isDefault ? ' is-default' : ''}`}>
            <img src={img.url} alt={`Image ${i + 1}`} />
            {img.isDefault && <span className="pimg-star">⭐ Default</span>}
            <div className="pimg-controls">
              {!img.isDefault && (
                <button type="button" className="pimg-ctrl-btn setdef" onClick={() => setDefault(i)}>
                  ⭐
                </button>
              )}
              <button type="button" className="pimg-ctrl-btn del" onClick={() => remove(i)}>
                🗑️
              </button>
            </div>
            {uploading === i && <div className="pimg-uploading">Upload...</div>}
          </div>
        ))}

        {canAdd && (
          <div className="pimg-slot add-slot" onClick={triggerPick}>
            {uploading === images.length ? (
              <span className="pimg-add-text">Upload...</span>
            ) : (
              <>
                <span className="pimg-add-icon">📷</span>
                <span className="pimg-add-text">Add Photo</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── ProductForm ─────────────────────────────────────────────────────────── */
function ProductForm({ initial, existingImages, categories, onSave }) {
  const [name, setName]               = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [categoryId, setCategoryId]   = useState(initial?.category_id || (categories[0]?.id ?? ''));
  const [sellingPrice, setSellingPrice] = useState(initial?.selling_price ?? '');
  const [originalPrice, setOriginalPrice] = useState(initial?.original_price ?? '');
  const [stock, setStock]             = useState(initial?.stock_quantity ?? '');
  const [unit, setUnit]               = useState(initial?.unit_value || '');
  const [isFeatured, setIsFeatured]   = useState(initial?.is_featured ?? false);
  const [isActive, setIsActive]       = useState(initial?.is_active ?? true);
  const [localBusy, setLocalBusy]     = useState(false);

  // Build initial images from product_images rows
  const [images, setImages] = useState(() => {
    const rows = existingImages || [];
    if (rows.length === 0 && initial?.primary_image) {
      return [{ url: initial.primary_image, isDefault: true }];
    }
    return rows
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => ({ url: r.image_url, isDefault: r.is_default || false, id: r.id }));
  });

  const valid = name.trim() && categoryId && sellingPrice !== '' && stock !== '';

  function handleSave() {
    setLocalBusy(true);
    onSave(
      {
        name: name.trim(),
        description: description.trim() || null,
        category_id: categoryId,
        selling_price: Number(sellingPrice),
        original_price: originalPrice === '' ? null : Number(originalPrice),
        stock_quantity: Number(stock),
        unit_value: unit.trim() || null,
        is_featured: isFeatured,
        is_active: isActive,
      },
      images,
      () => setLocalBusy(false)
    );
  }

  return (
    <div>
      <div className="form-grid">
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <label htmlFor="p-name">Product Name *</label>
          <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amul Toned Milk 1L" />
        </div>
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <label htmlFor="p-desc">Description</label>
          <textarea id="p-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="p-cat">Category *</label>
          <select id="p-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.length === 0 && <option value="">Pehle category banayein</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="f-group">
          <label htmlFor="p-unit">Unit (e.g. 1L, 500g)</label>
          <input id="p-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="1L" />
        </div>
        <div className="f-group">
          <label htmlFor="p-sp">Selling Price (₹) *</label>
          <input id="p-sp" type="number" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="p-mrp">MRP / Original Price (₹)</label>
          <input id="p-mrp" type="number" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="p-stock">Stock Quantity *</label>
          <input id="p-stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="p-featured">Featured?</label>
          <select id="p-featured" value={isFeatured ? '1' : '0'} onChange={(e) => setIsFeatured(e.target.value === '1')}>
            <option value="0">No</option>
            <option value="1">Yes</option>
          </select>
        </div>
        <div className="f-group">
          <label htmlFor="p-active">Status</label>
          <select id="p-active" value={isActive ? '1' : '0'} onChange={(e) => setIsActive(e.target.value === '1')}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </div>

        {/* Image grid — full width */}
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <ProductImageGrid images={images} onChange={setImages} />
        </div>
      </div>

      <div className="modal-actions">
        <button
          className="btn-main"
          disabled={localBusy || !valid}
          onClick={handleSave}
        >
          {localBusy ? 'Saving...' : (initial ? 'Save Changes' : 'Add Product')}
        </button>
      </div>
    </div>
  );
}

const FILTERS = ['All', 'Featured', 'Low Stock', 'Out of Stock'];

/* ── Main Products Page ──────────────────────────────────────────────────── */
export default function Products() {
  const [products, setProducts]   = useState([]);
  const [prodImages, setProdImages] = useState({}); // { product_id: [rows] }
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('All');
  const [search, setSearch]       = useState('');
  const modal = useModal();
  const toast = useToast();

  async function load() {
    setLoading(true);
    let q = db
      .from('products')
      .select('*,categories(id,name)')
      .order('created_at', { ascending: false });

    if (search.trim()) {
      const s = search.trim();
      q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) {
      toast.show(`Products load nahi ho paye: ${error.message}`, { type: 'error' });
      setLoading(false);
      return;
    }
    setProducts(data || []);

    // Load all product_images at once
    const ids = (data || []).map((p) => p.id);
    if (ids.length > 0) {
      const { data: imgs } = await db
        .from('product_images')
        .select('*')
        .in('product_id', ids)
        .order('sort_order', { ascending: true });

      const map = {};
      (imgs || []).forEach((img) => {
        if (!map[img.product_id]) map[img.product_id] = [];
        map[img.product_id].push(img);
      });
      setProdImages(map);
    } else {
      setProdImages({});
    }
    setLoading(false);
  }

  async function loadCategories() {
    const { data } = await db.from('categories').select('id,name').eq('is_active', true).order('sort_order');
    setCategories(data || []);
  }

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search]);

  const onSearchChange = debounce((value) => setSearch(value), 350);

  // Compute primary image per product (the is_default one, or first)
  function getPrimaryImage(p) {
    const imgs = prodImages[p.id] || [];
    if (imgs.length === 0) return null;
    return (imgs.find((i) => i.is_default) || imgs[0])?.image_url || null;
  }

  const filtered = products.filter((p) => {
    if (filter === 'Featured') return p.is_featured;
    if (filter === 'Low Stock') return (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) < 20;
    if (filter === 'Out of Stock') return (p.stock_quantity ?? 0) <= 0;
    return true;
  });

  /* ── Save product + images ─────────────────────────────────────────── */
  async function saveProduct(payload, images, id, onError) {
    let productId = id;
    let error;

    if (id) {
      ({ error } = await db.from('products').update(payload).eq('id', id));
    } else {
      const { data, error: insErr } = await db.from('products').insert(payload).select().single();
      error = insErr;
      productId = data?.id;
    }

    if (error) {
      toast.show(`Save nahi hua: ${error.message}`, { type: 'error' });
      if (onError) onError();
      return;
    }

    // Sync product_images
    if (productId) {
      await db.from('product_images').delete().eq('product_id', productId);
      if (images.length > 0) {
        const rows = images.map((img, idx) => ({
          product_id: productId,
          image_url: img.url,
          is_default: img.isDefault || false,
          sort_order: idx,
        }));
        const { error: imgErr } = await db.from('product_images').insert(rows);
        if (imgErr) console.error('[Products] image save failed:', imgErr.message);
      }
    }

    modal.close();
    toast.show(id ? 'Product update ho gaya ✅' : 'Product add ho gaya ✅', { type: 'success' });
    load();
  }

  function openAdd() {
    if (categories.length === 0) {
      toast.show('Pehle ek Category banayein, fir product add karein', { type: 'error' });
      return;
    }
    modal.open({
      title: 'Add Product',
      content: (
        <ProductForm
          categories={categories}
          onSave={(payload, imgs, onErr) => saveProduct(payload, imgs, null, onErr)}
        />
      ),
    });
  }

  function openEdit(p) {
    modal.open({
      title: `Edit "${p.name}"`,
      content: (
        <ProductForm
          initial={p}
          existingImages={prodImages[p.id] || []}
          categories={categories}
          onSave={(payload, imgs, onErr) => saveProduct(payload, imgs, p.id, onErr)}
        />
      ),
    });
  }

  async function handleDelete(p) {
    const confirmed = await modal.confirm({
      title: 'Delete product?',
      message: `Are you sure you want to delete "${p.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    await db.from('product_images').delete().eq('product_id', p.id);
    const { error } = await db.from('products').delete().eq('id', p.id);

    if (error) {
      const deactivate = await modal.confirm({
        title: 'Delete nahi ho saka',
        message: `Ye product delete nahi ho paya (${error.message}), shayad iske purane orders maujood hain. Isse Inactive kar dein?`,
        confirmLabel: 'Inactive Karein',
      });
      if (deactivate) {
        const { error: e2 } = await db.from('products').update({ is_active: false }).eq('id', p.id);
        if (!e2) { toast.show('Product inactive kar diya gaya', { type: 'success' }); load(); }
        else toast.show(`Wo bhi fail ho gaya: ${e2.message}`, { type: 'error' });
      }
      return;
    }
    toast.show('Product deleted', { type: 'success' });
    load();
  }

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <AppLayout title="Products">
      <div className="section-title">Products Management</div>
      <div className="section-sub">
        Products add/edit karein — max 5 images, ⭐ default wali home & category par dikhegi
      </div>

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            {FILTERS.map((f) => (
              <button
                key={f} type="button"
                className={`filter-chip ${filter === f ? 'on' : ''}`}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="tb-search" role="search" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label htmlFor="products-search" className="sr-only">Search products</label>
            <input
              id="products-search" type="search"
              placeholder="Search products..."
              onChange={(e) => onSearchChange(e.target.value)}
              style={{ minHeight: 40 }}
            />
            <button className="btn-main" onClick={openAdd}>＋ Add Product</button>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi product nahi mila</td></tr>
              ) : (
                filtered.map((p) => {
                  const s = statusFor(p);
                  const thumb = getPrimaryImage(p);
                  const imgCount = (prodImages[p.id] || []).length;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="prod-name-cell">
                          {thumb
                            ? <img className="prod-thumb" src={thumb} alt={p.name} loading="lazy" />
                            : <div className="prod-thumb-placeholder">🛒</div>
                          }
                          <div>
                            <div style={{ fontWeight: 700 }}>{p.name}</div>
                            {imgCount > 0 && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                                📷 {imgCount} image{imgCount > 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>{p.categories?.name || '—'}</td>
                      <td>₹{p.selling_price}</td>
                      <td>{p.stock_quantity ?? 0}</td>
                      <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="act-btn" onClick={() => openEdit(p)}>✏️ Edit</button>
                          <button className="act-btn danger" onClick={() => handleDelete(p)}>🗑️ Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}