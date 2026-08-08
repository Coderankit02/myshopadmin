import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { debounce } from '../lib/utils';
import { db } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';
import { audit } from '../lib/audit';
import AiImageGen from '../components/AiImageGen';
import ProductImageManager from '../components/ProductImageManager';
import BulkImageManager from '../components/BulkImageManager';
import '../pagestyles/products.css';
import '../pagestyles/image-manager.css';

const MAX_PROD_IMAGES = 5;

function statusFor(p) {
  if (!p.is_active) return { label: 'Inactive', cls: 'b-cancelled' };
  if ((p.stock_quantity ?? 0) <= 0) return { label: 'Out of Stock', cls: 'b-cancelled' };
  if ((p.stock_quantity ?? 0) < 20) return { label: 'Low Stock', cls: 'b-pending' };
  return { label: 'Active', cls: 'b-delivered' };
}

/* ── Image upload helper — Cloudinary ───────────────────────────────────── */
async function uploadImageFile(file, folder = 'myshop/products') {
  return await uploadToCloudinary(file, folder);
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
// `duplicate` = true hone par ye "Create Duplicate" button dikhata hai aur
// ek chhota hint karta hai ki naya product banege (inactive start hota hai).
function ProductForm({ initial, existingImages, categories, brands = [], onSave, duplicate = false }) {
  const [name, setName]               = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [categoryId, setCategoryId]   = useState(initial?.category_id || (categories[0]?.id ?? ''));
  const [brandId, setBrandId]         = useState(initial?.brand_id || '');
  const [sellingPrice, setSellingPrice] = useState(initial?.selling_price ?? '');
  const [originalPrice, setOriginalPrice] = useState(initial?.original_price ?? '');
  const [costPrice, setCostPrice]     = useState(initial?.cost_price ?? '');
  const [stock, setStock]             = useState(initial?.stock_quantity ?? '');
  const [minStock, setMinStock]       = useState(initial?.min_stock_level ?? 20);
  const [unit, setUnit]               = useState(initial?.unit_value || '');
  const [sku, setSku]                 = useState(initial?.sku || '');
  const [barcode, setBarcode]         = useState(initial?.barcode || '');
  const [weight, setWeight]           = useState(initial?.weight || '');
  const [weightUnit, setWeightUnit]   = useState(initial?.weight_unit || 'g');
  const [gst, setGst]                 = useState(initial?.gst_percent ?? 0);
  const [videoUrl, setVideoUrl]       = useState(initial?.video_url || '');
  const [isFeatured, setIsFeatured]   = useState(initial?.is_featured ?? false);
  const [isTrending, setIsTrending]   = useState(initial?.is_trending ?? false);
  const [isBestseller, setIsBestseller] = useState(initial?.is_bestseller ?? false);
  const [isNewArrival, setIsNewArrival] = useState(initial?.is_new_arrival ?? false);
  const [isFlashSale, setIsFlashSale] = useState(initial?.is_flash_sale ?? false);
  const [isActive, setIsActive]       = useState(initial?.is_active ?? true);
  const [localBusy, setLocalBusy]     = useState(false);

  // Duplicate mode: SKU/barcode khaali kar diye (unique hone chahiye),
  // status Inactive rakha (taaki copy live site par turant na dikhe —
  // admin jab ready ho tab Active kare).

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
        brand_id: brandId || null,
        selling_price: Number(sellingPrice),
        original_price: originalPrice === '' ? null : Number(originalPrice),
        cost_price: costPrice === '' ? 0 : Number(costPrice),
        stock_quantity: Number(stock),
        min_stock_level: minStock === '' ? 20 : Number(minStock),
        unit_value: unit.trim() || null,
        sku: sku.trim() || null,
        barcode: barcode.trim() || null,
        weight: weight.trim() || null,
        weight_unit: weightUnit || null,
        gst_percent: gst === '' ? 0 : Number(gst),
        video_url: videoUrl.trim() || null,
        is_featured: isFeatured,
        is_trending: isTrending,
        is_bestseller: isBestseller,
        is_new_arrival: isNewArrival,
        is_flash_sale: isFlashSale,
        is_active: isActive,
      },
      images,
      () => setLocalBusy(false)
    );
  }

  return (
    <div>
      {duplicate && (
        <div
          style={{
            background: 'var(--badge-blue-bg)', color: 'var(--badge-blue-text)',
            borderRadius: 10, padding: '10px 14px', fontSize: '0.78rem',
            fontWeight: 600, lineHeight: 1.5, marginBottom: 14,
          }}
        >
          📋 Ye product ki <b>copy</b> banegi — naya product ID, images copy hongi.
          Status abhi <b>Inactive</b> hai — customer site par dikhane ke liye
          neeche <b>Status: Active</b> karein aur Save dabayein.
        </div>
      )}
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
          <label htmlFor="p-brand">Brand</label>
          <select id="p-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">No brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
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
          <label htmlFor="p-cost">Cost Price (₹) — profit ke liye</label>
          <input id="p-cost" type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="p-gst">GST %</label>
          <input id="p-gst" type="number" value={gst} onChange={(e) => setGst(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="p-minstock">Low Stock Alert Level</label>
          <input id="p-minstock" type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
        </div>
        <div className="f-group">
          <label htmlFor="p-sku">SKU</label>
          <input id="p-sku" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="RKM-001" />
        </div>
        <div className="f-group">
          <label htmlFor="p-barcode">Barcode</label>
          <input id="p-barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="8901..." />
        </div>
        <div className="f-group">
          <label htmlFor="p-weight">Weight</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="p-weight" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="500" style={{ flex: 1 }} />
            <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)} style={{ width: 90 }} aria-label="Weight unit">
              <option value="g">g</option><option value="kg">kg</option>
              <option value="ml">ml</option><option value="L">L</option>
              <option value="pc">pc</option>
            </select>
          </div>
        </div>
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <label htmlFor="p-video">Product Video URL (optional)</label>
          <input id="p-video" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." />
        </div>
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <label>Badges &amp; Flags</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 4px' }}>
            {[
              { label: '⭐ Featured', val: isFeatured, set: setIsFeatured },
              { label: '🔥 Trending', val: isTrending, set: setIsTrending },
              { label: '🏆 Best Seller', val: isBestseller, set: setIsBestseller },
              { label: '✨ New Arrival', val: isNewArrival, set: setIsNewArrival },
              { label: '⚡ Flash Sale', val: isFlashSale, set: setIsFlashSale },
            ].map((f) => (
              <label key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.val} onChange={(e) => f.set(e.target.checked)} style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} />
                {f.label}
              </label>
            ))}
          </div>
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
          {localBusy ? 'Saving...' : (duplicate ? 'Create Duplicate' : (initial ? 'Save Changes' : 'Add Product'))}
        </button>
      </div>
    </div>
  );
}

const FILTERS = ['All', 'Featured', 'Low Stock', 'Out of Stock'];

/* ── Main Products Page ──────────────────────────────────────────────────── */
export default function Products() {
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts]   = useState([]);
  const [prodImages, setProdImages] = useState({}); // { product_id: [rows] }
  const [categories, setCategories] = useState([]);
  const [brands, setBrands]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('All');
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState(''); // immediate input value (debounce alag)
  const [selectedIds, setSelectedIds] = useState(() => new Set()); // bulk image search ke liye
  const modal = useModal();
  const toast = useToast();

  // Global search deep-link: /products with state.searchQuery aaye to search prefill
  // dep `location.state?.searchQuery` par depend taaki same-page navigation bhi kaam kare
  useEffect(() => {
    const sq = location.state?.searchQuery;
    if (!sq) return;
    navigate(location.pathname, { replace: true, state: null });
    setSearchInput(sq);
    setSearch(sq);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.searchQuery]);

  const brandById = {};
  brands.forEach((b) => { brandById[b.id] = b; });

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

  async function loadBrands() {
    const { data } = await db.from('brands').select('id,name').eq('is_active', true).order('sort_order');
    setBrands(data || []);
  }

  useEffect(() => { loadCategories(); loadBrands(); }, []);
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [search]);

  const onSearchChange = debounce((value) => setSearch(value), 350);

  // Compute primary image per product (the is_default one, or first)
  function getPrimaryImage(p) {
    const imgs = prodImages[p.id] || [];
    if (imgs.length === 0) return null;
    return (imgs.find((i) => i.is_default) || imgs[0])?.image_url || null;
  }

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = products.filter((p) => {
    if (filter === 'Featured') return p.is_featured;
    if (filter === 'Low Stock') return (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) < 20;
    if (filter === 'Out of Stock') return (p.stock_quantity ?? 0) <= 0;
    return true;
  });

  // BUG FIX (Critical — TDZ crash): `filtered` pehle declare hua, uske BAAD hi
  // `allFilteredSelected`/`toggleSelectAll` define karein. Pehle `filtered` ko
  // use karne par "Cannot access 'filtered' before initialization" aata tha
  // (Products page render hote hi crash).
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));
  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });
  }

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
    audit(id ? 'product.update' : 'product.create', 'product', productId, { name: payload.name, price: payload.selling_price });
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
          brands={brands}
          onSave={(payload, imgs, onErr) => saveProduct(payload, imgs, null, onErr)}
        />
      ),
    });
  }

  /* ── Product Image Manager (search / upload / AI / gallery) ──────────── */
  function openImageManager(p) {
    modal.open({
      title: `🖼️ Images — ${p.name}`,
      content: (
        <ProductImageManager
          product={p}
          existingImages={prodImages[p.id] || []}
          onDone={() => load()}
        />
      ),
      xwide: true,
    });
  }

  /* ── Bulk Image Search (5-10 products ek saath) ──────────────────────── */
  function openBulkImageManager() {
    const selected = products.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) {
      toast.show('Pehle products select karo (row checkbox)', { type: 'error' });
      return;
    }
    modal.open({
      title: `⚡ Bulk Image Search (${selected.length} products)`,
      content: (
        <BulkImageManager
          products={selected}
          onDone={() => load()}
        />
      ),
      xwide: true,
    });
  }

  /* ── Bulk FREE AI image generation (Cloudflare → Cloudinary → Supabase) ── */
  // Har product me max 5 images ho sakti hain — jo 5 se kam rakhte hain unhe
  // top-up karo (imgCount ke saath pass karte hain taaki generator sirf missing
  // images banaye aur sort_order/is_default sahi rakhe).
  function openAiGen() {
    const missing = products
      .map((p) => ({ ...p, imgCount: (prodImages[p.id] || []).length }))
      .filter((p) => p.imgCount < 5);
    if (missing.length === 0) {
      toast.show('Saare products ke paas pehle se 5 images hain 🎉', { type: 'success' });
      return;
    }
    modal.open({
      title: '✨ AI Bulk Image Generator',
      content: (
        <AiImageGen products={missing} categories={categories} onDone={() => load()} />
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
          brands={brands}
          onSave={(payload, imgs, onErr) => saveProduct(payload, imgs, p.id, onErr)}
        />
      ),
    });
  }

  // ── Duplicate Product (Feature: 1-click copy) ─────────────────────────
  // Original ki saari fields + images copy hoti hain, par: naya ID, naam ke
  // aage "(Copy)", SKU/barcode khaali, aur status Inactive (live na dikhe jab
  // tak admin ready ho kar Active na kare). saveProduct id=null dete hain isliye
  // insert hota hai, update nahi. Agar pehle se "(Copy)" hai to stack nahi hoga.
  function openDuplicate(p) {
    const baseName = (p.name || '').replace(/\s*\(Copy\)$/i, '');
    modal.open({
      title: `Duplicate "${p.name}"`,
      content: (
        <ProductForm
          duplicate
          initial={{
            ...p,
            name: `${baseName} (Copy)`,
            sku: '',
            barcode: '',
            is_active: false,
          }}
          existingImages={prodImages[p.id] || []}
          categories={categories}
          brands={brands}
          onSave={(payload, imgs, onErr) => saveProduct(payload, imgs, null, onErr)}
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
    audit('product.delete', 'product', p.id, { name: p.name });
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
          <div className="tb-search" role="search" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', maxWidth: 'none', flex: 1 }}>
            <label htmlFor="products-search" className="sr-only">Search products</label>
            <input
              id="products-search" type="search"
              placeholder="Search products..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); onSearchChange(e.target.value); }}
              style={{ minHeight: 40, flex: '1 1 180px' }}
            />
            <button
              className="btn-ghost"
              onClick={openBulkImageManager}
              disabled={selectedIds.size === 0}
              title={`Selected products (${selectedIds.size}) ke images ek saath search karo`}
              style={{ minHeight: 40, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              <span className="bulk-lbl-full">🖼️ Bulk Image Search</span>
              <span className="bulk-lbl-short">🖼️ Bulk</span>
              {selectedIds.size > 0 && <span className="bulk-count"> ({selectedIds.size})</span>}
            </button>
            <button
              className="btn-ai"
              onClick={openAiGen}
              title="Saare products ke liye FREE AI images generate karo (Cloudflare)"
            >
              ✨ AI Generate
            </button>
            <button className="btn-main" onClick={openAdd}>＋ Add Product</button>
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="th-check">
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all filtered products"
                  />
                </th>
                <th>Product</th>
                <th>Brand</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi product nahi mila</td></tr>
              ) : (
                filtered.map((p) => {
                  const s = statusFor(p);
                  const thumb = getPrimaryImage(p);
                  const imgCount = (prodImages[p.id] || []).length;
                  const flags = [
                    p.is_flash_sale && '⚡',
                    p.is_bestseller && '🏆',
                    p.is_trending && '🔥',
                    p.is_new_arrival && '✨',
                    p.is_featured && '⭐',
                  ].filter(Boolean);
                  return (
                    <tr key={p.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="row-check"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                          aria-label={`Select ${p.name}`}
                        />
                      </td>
                      <td>
                        {/* Product name/thumbnail click → Edit modal. User ko search ke
                            baad product par click karke EDIT ka option chahiye — pehle
                            click kuch nahi karta tha (row me koi handler nahi tha). */}
                        <div
                          className="prod-name-cell clickable"
                          role="button"
                          tabIndex={0}
                          title={`"${p.name}" edit karo`}
                          onClick={() => openEdit(p)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(p); } }}
                        >
                          {thumb
                            ? <img className="prod-thumb" src={thumb} alt={p.name} loading="lazy" />
                            : <div className="prod-thumb-placeholder">🛒</div>
                          }
                          <div>
                            <div style={{ fontWeight: 700 }}>{p.name}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--gray)' }}>
                              {flags.length > 0 && <span title="Flags">{flags.join(' ')} </span>}
                              {imgCount > 0 && <>📷 {imgCount}</>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{p.brand_id ? (brandById[p.brand_id]?.name || '—') : '—'}</td>
                      <td>{p.categories?.name || '—'}</td>
                      <td>₹{p.selling_price}</td>
                      <td>{p.stock_quantity ?? 0}</td>
                      <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="act-btn"
                            onClick={() => openImageManager(p)}
                            title="Image manager — search / upload / AI / gallery"
                          >
                            🖼️ Images
                          </button>
                          <button className="act-btn" onClick={() => openEdit(p)}>✏️ Edit</button>
                          <button
                            className="act-btn"
                            onClick={() => openDuplicate(p)}
                            title={`"${p.name}" ki copy banao`}
                          >
                            📋 Duplicate
                          </button>
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