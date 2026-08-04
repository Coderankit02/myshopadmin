import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout';
import { useToast } from '../context/ToastContext';
import { db } from '../lib/supabase';
import { audit } from '../lib/audit';
import '../pagestyles/homepage.css';

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
