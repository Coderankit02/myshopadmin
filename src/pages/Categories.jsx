import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useModal } from '../context/ModalContext';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import '../pagestyles/categories.css';

function slugify(name) {
  return (name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function CategoryForm({ initial, onSave, busy }) {
  const [name, setName] = useState(initial?.name || '');
  const [icon, setIcon] = useState(initial?.icon_emoji || '🗂️');
  const [image, setImage] = useState(initial?.image_url || '');
  const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 0);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

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
        <div className="f-group" style={{ gridColumn: '1/-1' }}>
          <label htmlFor="cat-image">Image URL (optional)</label>
          <input id="cat-image" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://..." />
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
      </div>
      <div className="modal-actions">
        <button
          className="btn-main"
          disabled={busy || !name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              slug: slugify(name),
              icon_emoji: icon.trim() || '🛒',
              image_url: image.trim() || null,
              sort_order: Number(sortOrder) || 0,
              is_active: isActive,
            })
          }
        >
          {initial ? 'Save Changes' : 'Add Category'}
        </button>
      </div>
    </div>
  );
}

export default function Categories() {
  const toast = useToast();
  const modal = useModal();
  const [categories, setCategories] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    const { data: cats, error } = await db.from('categories').select('*').order('sort_order', { ascending: true });
    if (error) {
      toast.show(`Categories load nahi ho payi: ${error.message}`, { type: 'error' });
      setCategories([]);
      setLoading(false);
      return;
    }
    setCategories(cats || []);

    const { data: prods } = await db.from('products').select('category_id');
    const c = {};
    (prods || []).forEach((p) => {
      if (p.category_id) c[p.category_id] = (c[p.category_id] || 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveCategory(payload, id) {
    setBusy(true);
    let error;
    if (id) {
      ({ error } = await db.from('categories').update(payload).eq('id', id));
    } else {
      ({ error } = await db.from('categories').insert(payload));
    }
    setBusy(false);
    if (error) {
      toast.show(`Save nahi hua: ${error.message}`, { type: 'error' });
      return;
    }
    modal.close();
    toast.show(id ? 'Category update ho gayi' : 'Category add ho gayi', { type: 'success' });
    load();
  }

  function openAdd() {
    modal.open({
      title: 'Add Category',
      content: <CategoryForm busy={busy} onSave={(payload) => saveCategory(payload, null)} />,
    });
  }

  function openEdit(c) {
    modal.open({
      title: `Edit "${c.name}"`,
      content: <CategoryForm initial={c} busy={busy} onSave={(payload) => saveCategory(payload, c.id)} />,
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
      // Likely an FK constraint (products still reference this category).
      const deactivate = await modal.confirm({
        title: 'Delete nahi ho saka',
        message: `Ye category delete nahi ho payi (${error.message}). Kya isse Inactive kar dein instead?`,
        confirmLabel: 'Inactive Karein',
      });
      if (deactivate) {
        const { error: e2 } = await db.from('categories').update({ is_active: false }).eq('id', c.id);
        if (!e2) {
          toast.show('Category inactive kar di gayi', { type: 'success' });
          load();
        } else {
          toast.show(`Wo bhi fail ho gaya: ${e2.message}`, { type: 'error' });
        }
      }
      return;
    }
    toast.show('Category delete ho gayi', { type: 'success' });
    load();
  }

  return (
    <AppLayout title="Categories">
      <div className="section-title">Categories Management</div>
      <div className="section-sub">Categories add, reorder ya edit karein — live Supabase data</div>

      <div className="stat-grid" aria-busy={loading}>
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div className="stat-card" key={i}>
              <div className="skel" style={{ height: 70 }} aria-hidden="true" />
            </div>
          ))
        ) : (
          <>
            {categories.map((c) => (
              <div className="stat-card" key={c.id} style={{ opacity: c.is_active ? 1 : 0.55 }}>
                <div className="stat-top">
                  <div className="stat-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                    {c.icon_emoji || '🗂️'}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="act-btn" onClick={() => openEdit(c)}>Edit</button>
                    <button className="act-btn danger" onClick={() => handleDelete(c)}>Delete</button>
                  </div>
                </div>
                <div className="stat-val" style={{ fontSize: '1rem' }}>
                  {c.name} {!c.is_active && <span className="badge b-cancelled" style={{ marginLeft: 6 }}>Inactive</span>}
                </div>
                <div className="stat-label">{counts[c.id] || 0} products</div>
              </div>
            ))}
            <div className="stat-card" style={{ alignItems: 'center', justifyContent: 'center', border: '1.5px dashed var(--border)' }}>
              <button className="btn-ghost" onClick={openAdd}>+ Add Category</button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
