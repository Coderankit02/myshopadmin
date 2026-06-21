import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { debounce } from '../lib/utils';
import { db } from '../lib/supabase';
import '../pagestyles/products.css';

function statusFor(p) {
  if (!p.is_active) return { label: 'Inactive', cls: 'b-cancelled' };
  if ((p.stock_quantity ?? 0) <= 0) return { label: 'Out of Stock', cls: 'b-cancelled' };
  if ((p.stock_quantity ?? 0) < 20) return { label: 'Low Stock', cls: 'b-pending' };
  return { label: 'Active', cls: 'b-delivered' };
}

function ProductForm({ initial, categories, busy, onSave }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [categoryId, setCategoryId] = useState(initial?.category_id || (categories[0]?.id ?? ''));
  const [sellingPrice, setSellingPrice] = useState(initial?.selling_price ?? '');
  const [originalPrice, setOriginalPrice] = useState(initial?.original_price ?? '');
  const [stock, setStock] = useState(initial?.stock_quantity ?? '');
  const [unit, setUnit] = useState(initial?.unit_value || '');
  const [imageUrl, setImageUrl] = useState(initial?.primary_image || '');
  const [isFeatured, setIsFeatured] = useState(initial?.is_featured ?? false);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  const valid = name.trim() && categoryId && sellingPrice !== '' && stock !== '';

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
          <label htmlFor="p-img">Image URL</label>
          <input id="p-img" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
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
      </div>
      <div className="modal-actions">
        <button
          className="btn-main"
          disabled={busy || !valid}
          onClick={() =>
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
              imageUrl.trim() || null
            )
          }
        >
          {initial ? 'Save Changes' : 'Add Product'}
        </button>
      </div>
    </div>
  );
}

const FILTERS = ['All', 'Featured', 'Low Stock', 'Out of Stock'];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const modal = useModal();
  const toast = useToast();

  async function load() {
    setLoading(true);
    let q = db
      .from('products')
      .select('*,categories(id,name),product_images(id,image_url,sort_order)')
      .order('created_at', { ascending: false });
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) {
      toast.show(`Products load nahi ho paye: ${error.message}`, { type: 'error' });
      setProducts([]);
      setLoading(false);
      return;
    }
    const enriched = (data || []).map((p) => ({
      ...p,
      primary_image: (p.product_images || []).sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url || null,
    }));
    setProducts(enriched);
    setLoading(false);
  }

  async function loadCategories() {
    const { data } = await db.from('categories').select('id,name').eq('is_active', true).order('sort_order');
    setCategories(data || []);
  }

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const onSearchChange = debounce((value) => setSearch(value), 350);

  const filtered = products.filter((p) => {
    if (filter === 'Featured') return p.is_featured;
    if (filter === 'Low Stock') return (p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) < 20;
    if (filter === 'Out of Stock') return (p.stock_quantity ?? 0) <= 0;
    return true;
  });

  async function saveProduct(payload, imageUrl, id) {
    setBusy(true);
    let productId = id;
    let error;

    if (id) {
      ({ error } = await db.from('products').update(payload).eq('id', id));
    } else {
      const { data, error: insErr } = await db.from('products').insert(payload).select().single();
      error = insErr;
      productId = data?.id;
    }

    if (!error && productId && imageUrl) {
      // Replace the primary image (sort_order 0) for this product.
      await db.from('product_images').delete().eq('product_id', productId).eq('sort_order', 0);
      const { error: imgErr } = await db.from('product_images').insert({
        product_id: productId,
        image_url: imageUrl,
        sort_order: 0,
      });
      if (imgErr) console.error('[Products] image save failed:', imgErr.message);
    }

    setBusy(false);
    if (error) {
      toast.show(`Save nahi hua: ${error.message}`, { type: 'error' });
      return;
    }
    modal.close();
    toast.show(id ? 'Product update ho gaya' : 'Product add ho gaya', { type: 'success' });
    load();
  }

  function openAdd() {
    if (categories.length === 0) {
      toast.show('Pehle ek Category banayein, fir product add karein', { type: 'error' });
      return;
    }
    modal.open({
      title: 'Add Product',
      content: <ProductForm categories={categories} busy={busy} onSave={(payload, img) => saveProduct(payload, img, null)} />,
    });
  }

  function openEdit(p) {
    modal.open({
      title: `Edit "${p.name}"`,
      content: <ProductForm initial={p} categories={categories} busy={busy} onSave={(payload, img) => saveProduct(payload, img, p.id)} />,
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
      // Likely blocked by past orders referencing this product — deactivate instead.
      const deactivate = await modal.confirm({
        title: 'Delete nahi ho saka',
        message: `Ye product delete nahi ho paya (${error.message}), shayad iske purane orders maujood hain. Isse Inactive kar dein?`,
        confirmLabel: 'Inactive Karein',
      });
      if (deactivate) {
        const { error: e2 } = await db.from('products').update({ is_active: false }).eq('id', p.id);
        if (!e2) {
          toast.show('Product inactive kar diya gaya', { type: 'success' });
          load();
        } else {
          toast.show(`Wo bhi fail ho gaya: ${e2.message}`, { type: 'error' });
        }
      }
      return;
    }
    toast.show('Product deleted', { type: 'success' });
    load();
  }

  return (
    <AppLayout title="Products">
      <div className="section-title">Products Management</div>
      <div className="section-sub">Inventory me products add/edit karein — live Supabase data</div>

      <div className="table-wrap">
        <div className="table-head">
          <div className="filter-row">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
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
            <input id="products-search" type="search" placeholder="Search products..." onChange={(e) => onSearchChange(e.target.value)} style={{ minHeight: 40 }} />
            <button className="btn-main" onClick={openAdd}>+ Add Product</button>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi product nahi mila</td></tr>
              ) : (
                filtered.map((p) => {
                  const s = statusFor(p);
                  return (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 700 }}>{p.name}</td>
                      <td>{p.categories?.name || '—'}</td>
                      <td>₹{p.selling_price}</td>
                      <td>{p.stock_quantity ?? 0}</td>
                      <td><span className={`badge ${s.cls}`}>{s.label}</span></td>
                      <td>
                        <div className="row-actions">
                          <button className="act-btn" onClick={() => openEdit(p)}>Edit</button>
                          <button className="act-btn danger" onClick={() => handleDelete(p)}>Delete</button>
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
