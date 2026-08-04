import { useEffect, useMemo, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { audit } from '../lib/audit';
import { formatDateTime } from '../lib/utils';
import '../pagestyles/coupons.css';

/* ── Searchable multi-select (customers / products / categories) ───────── */
function TargetPicker({ title, icon, options, selected, onChange, placeholder }) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.label || '').toLowerCase().includes(q));
  }, [options, query]);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="f-group" style={{ gridColumn: '1/-1' }}>
      <label>{icon} {title} <span style={{ color: 'var(--gray)', fontWeight: 400 }}>({selected.size} selected)</span></label>
      <div className="cp-target-box">
        <input
          type="search"
          placeholder={placeholder || `Search ${title.toLowerCase()}...`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minHeight: 38 }}
        />
        <div className="cp-target-list">
          {visible.length === 0 ? (
            <div style={{ color: 'var(--gray)', fontSize: '0.78rem', padding: 8 }}>Koi option nahi mila</div>
          ) : (
            visible.map((o) => (
              <label key={o.id} className={`cp-target-item${selected.has(o.id) ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggle(o.id)}
                  style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
                />
                <span className="cp-target-label">{o.label}</span>
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ── CouponForm ─────────────────────────────────────────────────────────── */
function CouponForm({ initial, products, categories, customers, busy, onSave }) {
  const [code, setCode] = useState(initial?.code || '');
  const [type, setType] = useState(initial?.discount_type || 'percent');
  const [value, setValue] = useState(initial?.discount_value ?? '');
  const [minOrder, setMinOrder] = useState(initial?.min_order ?? '');
  const [usageLimit, setUsageLimit] = useState(initial?.usage_limit ?? '');
  const [expiry, setExpiry] = useState(initial?.expiry_date || '');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [description, setDescription] = useState(initial?.description || '');
  const [customerIds, setCustomerIds] = useState(() => new Set(initial?.customer_ids || []));
  const [productIds, setProductIds] = useState(() => new Set(initial?.product_ids || []));
  const [categoryIds, setCategoryIds] = useState(() => new Set(initial?.category_ids || []));

  const valid = code.trim() && value !== '';

  function handleSave() {
    onSave({
      code: code.trim().toUpperCase(),
      discount_type: type,
      discount_value: Number(value),
      min_order: minOrder === '' ? 0 : Number(minOrder),
      usage_limit: usageLimit === '' ? null : Number(usageLimit),
      expiry_date: expiry || null,
      is_active: isActive,
      description: description.trim() || null,
      customer_ids: [...customerIds],
      product_ids: [...productIds],
      category_ids: [...categoryIds],
    });
  }

  return (
    <div>
      <div className="form-grid">
        <div className="f-group"><label htmlFor="cp-code">Coupon Code *</label><input id="cp-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME50" /></div>
        <div className="f-group">
          <label htmlFor="cp-type">Discount Type</label>
          <select id="cp-type" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="percent">Percent (%)</option>
            <option value="flat">Flat (₹)</option>
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
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <label htmlFor="cp-desc">Description (customer ko dikhne wala note)</label>
          <input id="cp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. First order par 50% off" />
        </div>

        <div className="cp-target-note" style={{ gridColumn: '1/-1' }}>
          🎯 Targeting — khaali chhodne par coupon <b>sabhi</b> customers/products par chalta hai. Select karne par sirf selected par.
        </div>
        <TargetPicker title="Specific Customers" icon="👥" options={customers} selected={customerIds} onChange={setCustomerIds} placeholder="Name/phone se search..." />
        <TargetPicker title="Specific Products" icon="🛒" options={products} selected={productIds} onChange={setProductIds} placeholder="Product search..." />
        <TargetPicker title="Specific Categories" icon="🗂️" options={categories} selected={categoryIds} onChange={setCategoryIds} placeholder="Category search..." />
      </div>

      <div className="modal-actions">
        <button className="btn-main" disabled={busy || !valid} onClick={handleSave}>
          {busy ? 'Saving...' : (initial ? 'Save Changes' : 'Create Coupon')}
        </button>
      </div>
    </div>
  );
}

/* ── Main Coupons Page ──────────────────────────────────────────────────── */
export default function Coupons() {
  const modal = useModal();
  const toast = useToast();
  const [coupons, setCoupons] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await db.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) {
      toast.show(`Coupons load nahi hue: ${error.message}`, { type: 'error' });
      setLoading(false);
      return;
    }
    setCoupons(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    db.from('products').select('id,name').eq('is_active', true).limit(500).then(({ data }) =>
      setProducts((data || []).map((p) => ({ id: p.id, label: p.name })))
    );
    db.from('categories').select('id,name').order('sort_order').then(({ data }) =>
      setCategories((data || []).map((c) => ({ id: c.id, label: c.name })))
    );
    db.from('profiles').select('id,name,phone').order('name').limit(500).then(({ data }) =>
      setCustomers((data || []).map((c) => ({ id: c.id, label: c.name ? `${c.name} (${c.phone || '—'})` : c.phone || c.id })))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCoupon(payload, id) {
    setBusy(true);
    let error;
    if (id) ({ error } = await db.from('coupons').update(payload).eq('id', id));
    else ({ error } = await db.from('coupons').insert(payload));
    setBusy(false);
    if (error) { toast.show(`Save nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit(id ? 'coupon.update' : 'coupon.create', 'coupon', id, { code: payload.code });
    modal.close();
    toast.show(id ? 'Coupon update ho gaya ✅' : 'Coupon create ho gaya ✅', { type: 'success' });
    load();
  }

  function openForm(coupon) {
    modal.open({
      title: coupon ? `Edit "${coupon.code}"` : 'Create Coupon',
      content: (
        <CouponForm
          initial={coupon}
          products={products}
          categories={categories}
          customers={customers}
          busy={busy}
          onSave={(p) => saveCoupon(p, coupon?.id || null)}
        />
      ),
    });
  }

  async function handleDelete(c) {
    const confirmed = await modal.confirm({
      title: 'Delete coupon?',
      message: `Delete coupon "${c.code}"?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const { error } = await db.from('coupons').delete().eq('id', c.id);
    if (error) { toast.show(`Delete nahi hua: ${error.message}`, { type: 'error' }); return; }
    audit('coupon.delete', 'coupon', c.id, { code: c.code });
    toast.show('Coupon deleted', { type: 'success' });
    load();
  }

  function targetingSummary(c) {
    const parts = [];
    if ((c.customer_ids || []).length) parts.push(`👥 ${c.customer_ids.length} customer`);
    if ((c.product_ids || []).length) parts.push(`🛒 ${c.product_ids.length} product`);
    if ((c.category_ids || []).length) parts.push(`🗂️ ${c.category_ids.length} category`);
    return parts.length ? parts.join(' · ') : 'All customers';
  }

  return (
    <AppLayout title="Coupons">
      <div className="section-title">Coupons &amp; Offers</div>
      <div className="section-sub">
        Coupons checkout par automatically apply hote hain — usage limit, expiry aur customer/product/category targeting ke saath
      </div>

      <div className="table-wrap">
        <div className="table-head">
          <h3 style={{ fontSize: '0.96rem', fontWeight: 800 }}>All Coupons ({coupons.length})</h3>
          <button className="btn-main" onClick={() => openForm(null)}>＋ Create Coupon</button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Usage</th><th>Targeting</th><th>Expiry</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8}><div className="skel" style={{ height: 20 }} aria-hidden="true" /></td></tr>
              ) : coupons.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--gray)' }}>Koi coupon nahi hai — pehla coupon banayein 🎉</td></tr>
              ) : (
                coupons.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 700 }}>
                      {c.code}
                      {!c.is_active && <span className="badge b-cancelled" style={{ marginLeft: 6 }}>Inactive</span>}
                    </td>
                    <td>{c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}</td>
                    <td>₹{c.min_order ?? 0}</td>
                    <td>{c.used_count}/{c.usage_limit ?? '∞'}</td>
                    <td style={{ fontSize: '0.78rem' }}>{targetingSummary(c)}</td>
                    <td>{c.expiry_date ? formatDateTime(c.expiry_date).split(',')[0] : '—'}</td>
                    <td>
                      <span className={`badge ${c.is_active ? 'b-delivered' : 'b-cancelled'}`}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="act-btn" onClick={() => openForm(c)}>✏️ Edit</button>
                        <button className="act-btn danger" onClick={() => handleDelete(c)}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
