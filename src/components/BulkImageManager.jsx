import { useEffect, useMemo, useState } from 'react';
import ImageSearchPanel from './ImageSearchPanel';
import { db } from '../lib/supabase';
import { PROVIDERS, getProviderStatus, searchImages } from '../lib/imageSearch';
import { saveProductImages } from '../lib/saveImages';
import { useToast } from '../context/ToastContext';
import '../pagestyles/image-manager.css';

/*!
 * BulkImageManager — 5-10 products ke images ek saath search + save
 * ---------------------------------------------------------------------------
 * - Products page par checkboxes se products select karke khula jaata hai
 * - ⚡ Search All: ek provider se saare products ke liye PARALLEL search
 *   (concurrency 4) — results har product ke tab me milte hain
 * - Har product ka apna grid + selection + Save button (same UI as single)
 * - 💾 Save All: saare products ki selected images ek-ek karke save
 * - Progress bar: "3/10 products searched", tabs par ✓ badge jab saved
 *
 * Rate-limit note: search-all = jitne products utne API calls — isliye
 * search/save sequential-drain ke saath chalta hai aur quota aaram se dikhta hai.
 */

const CONCURRENCY = 4;

async function mapWithConcurrency(list, worker) {
  const results = new Array(list.length);
  let idx = 0;
  async function runner() {
    while (idx < list.length) {
      const i = idx++;
      results[i] = await worker(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, runner));
  return results;
}

export default function BulkImageManager({ products, onDone }) {
  const toast = useToast();
  const productList = useMemo(() => (products || []).filter(Boolean), [products]);

  const [provider, setProvider] = useState('serpapi');
  const [count, setCount] = useState(20);
  const [sourceStatus, setSourceStatus] = useState({ enabled: {} });

  // per-product state
  const [queries, setQueries] = useState(() => {
    const m = {};
    productList.forEach((p) => {
      m[p.id] = `${p.name || ''}${p.unit_value ? ` ${p.unit_value}` : ''}`.trim();
    });
    return m;
  });
  const [resultsByProduct, setResultsByProduct] = useState({}); // id -> {images,page,hasMore,loading,error}
  const [selectedByProduct, setSelectedByProduct] = useState({}); // id -> [items]
  const [savedIds, setSavedIds] = useState(() => new Set());

  const [currentId, setCurrentId] = useState(productList[0]?.id || null);
  const [searchAllBusy, setSearchAllBusy] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ done: 0, total: 0 });
  const [savingAll, setSavingAll] = useState(null); // {productIndex, productName, done, total, grandTotal, grandDone}
  const [perProductSaving, setPerProductSaving] = useState(null); // productId | null

  useEffect(() => {
    getProviderStatus().then((st) => {
      setSourceStatus(st);
      const enabledId = PROVIDERS.find((p) => st.enabled && st.enabled[p.id])?.id;
      if (enabledId) setProvider((cur) => (st.enabled && st.enabled[cur] ? cur : enabledId));
    }).catch(() => {});
  }, []);

  // Provider badalte hi count clamp karo
  function changeProvider(id) {
    setProvider(id);
    const p = PROVIDERS.find((x) => x.id === id);
    if (p) setCount((c) => Math.min(c, p.maxPerPage));
  }

  const providerLabel = (id) =>
    ({ brave: 'Brave', serpapi: 'SerpAPI', bing: 'Bing', google: 'Google', pexels: 'Pexels', pixabay: 'Pixabay', openverse: 'Openverse' }[id] || id);
  const maxPerPage = PROVIDERS.find((p) => p.id === provider)?.maxPerPage || 50;
  const countOptions = [20, 50, 100].filter((c) => c <= maxPerPage);
  if (countOptions.length === 0) countOptions.push(maxPerPage);

  const enabled = !!(sourceStatus.enabled && sourceStatus.enabled[provider]);

  const searchedCount = productList.filter((p) => resultsByProduct[p.id]?.searched).length;

  // ── Search one product ────────────────────────────────────────────────────
  async function searchOne(p, opts = {}) {
    const { page = 1, append = false } = opts;
    const q = queries[p.id]?.trim() || p.name;
    if (!q) return;
    const cur = resultsByProduct[p.id] || {};
    if (cur.loading) return;

    setResultsByProduct((s) => ({ ...s, [p.id]: { ...cur, loading: true, error: '' } }));
    const res = await searchImages({
      provider,
      query: q,
      page,
      count,
      size: '',
      type: '',
      orientation: '',
    });
    setResultsByProduct((s) => {
      const prev = s[p.id] || {};
      let images;
      if (append && prev.images?.length) {
        const seen = new Set(prev.images.map((i) => i.url));
        images = [...prev.images, ...res.images.filter((i) => !seen.has(i.url)).map((i) => ({ ...i, sourceLabel: providerLabel(provider) }))];
      } else {
        images = res.images.map((i) => ({ ...i, sourceLabel: providerLabel(provider) }));
      }
      return {
        ...s,
        [p.id]: { ...prev, images, page, hasMore: !!res.hasMore, loading: false, error: res.error || '', searched: true },
      };
    });
    return res.error;
  }

  // ── ⚡ Search All (parallel, concurrency 4) ───────────────────────────────
  async function handleSearchAll() {
    if (!enabled) {
      toast.show(`Provider key set nahi hai — ${provider.toUpperCase()} env var check karo`, { type: 'error' });
      return;
    }
    setSearchAllBusy(true);
    setSearchProgress({ done: 0, total: productList.length });
    const errors = [];
    await mapWithConcurrency(productList, async (p) => {
      const err = await searchOne(p, { page: 1, append: false });
      if (err) errors.push(`${p.name}: ${err}`);
      setSearchProgress((s) => ({ ...s, done: s.done + 1 }));
    });
    setSearchAllBusy(false);
    if (errors.length) {
      toast.show(`${productList.length - errors.length} searched · ${errors.length} fail — ${errors[0]}`, { type: 'error' });
    } else {
      toast.show(`Saare ${productList.length} products search ho gaye ✅`, { type: 'success' });
    }
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  function toggleSelect(pId, img) {
    setSelectedByProduct((s) => {
      const cur = s[pId] || [];
      return {
        ...s,
        [pId]: cur.some((x) => x.url === img.url) ? cur.filter((x) => x.url !== img.url) : [...cur, img],
      };
    });
  }
  function selectAll(pId) {
    const imgs = resultsByProduct[pId]?.images || [];
    setSelectedByProduct((s) => {
      const cur = s[pId] || [];
      return { ...s, [pId]: cur.length === imgs.length && imgs.length > 0 ? [] : imgs.slice() };
    });
  }
  function clearSelection(pId) {
    setSelectedByProduct((s) => ({ ...s, [pId]: [] }));
  }

  const totalSelected = productList.reduce((n, p) => n + (selectedByProduct[p.id]?.length || 0), 0);

  // ── Save one product ──────────────────────────────────────────────────────
  async function saveOne(pId, items) {
    if (!items?.length) return { saved: [], failed: [], skipped: 0 };
    setPerProductSaving(pId);
    // Pehle se saved gallery URLs nikaal kar dedupe karo (duplicate save na ho)
    const { data: existing } = await db
      .from('product_images')
      .select('image_url')
      .eq('product_id', pId);
    const res = await saveProductImages({
      productId: pId,
      items,
      existingUrls: (existing || []).map((r) => r.image_url),
    });
    setPerProductSaving(null);
    if (res.saved.length) {
      const savedSet = new Set(res.saved);
      setSelectedByProduct((s) => ({ ...s, [pId]: (s[pId] || []).filter((i) => !savedSet.has(i.url)) }));
      setSavedIds((s) => { const n = new Set(s); n.add(pId); return n; });
    }
    return res;
  }

  async function handleSaveCurrent() {
    const items = selectedByProduct[currentId] || [];
    if (!items.length) { toast.show('Is product me koi image select nahi', { type: 'error' }); return; }
    const res = await saveOne(currentId, items);
    if (res.failed.length) toast.show(`${res.saved.length} saved · ${res.failed.length} failed — ${res.failed[0].error}`, { type: 'error' });
    else toast.show(`${res.saved.length} images save ho gayin ✅`, { type: 'success' });
    onDone?.();
  }

  // ── 💾 Save All ───────────────────────────────────────────────────────────
  async function handleSaveAll() {
    const todo = productList.filter((p) => (selectedByProduct[p.id]?.length || 0) > 0);
    if (!todo.length) { toast.show('Kisi product me images select nahi hain', { type: 'error' }); return; }
    const grandTotal = todo.reduce((n, p) => n + selectedByProduct[p.id].length, 0);
    setSavingAll({ productIndex: 0, productName: '', done: 0, total: 0, grandTotal, grandDone: 0 });
    let grandDone = 0;
    let savedTotal = 0;
    let failedTotal = 0;

    for (let i = 0; i < todo.length; i++) {
      const p = todo[i];
      const items = selectedByProduct[p.id];
      setSavingAll((s) => ({ ...s, productIndex: i, productName: p.name, done: 0, total: items.length }));
      const { data: existing } = await db
        .from('product_images')
        .select('image_url')
        .eq('product_id', p.id);
      const res = await saveProductImages({
        productId: p.id,
        items,
        existingUrls: (existing || []).map((r) => r.image_url),
        onProgress: (pp) => setSavingAll((s) => ({ ...s, done: pp.done, total: pp.total })),
      });
      grandDone += items.length;
      savedTotal += res.saved.length;
      failedTotal += res.failed.length;
      setSavingAll((s) => ({ ...s, grandDone }));
      if (res.saved.length) {
        const savedSet = new Set(res.saved);
        setSelectedByProduct((s) => ({ ...s, [p.id]: (s[p.id] || []).filter((i) => !savedSet.has(i.url)) }));
        setSavedIds((s) => { const n = new Set(s); n.add(p.id); return n; });
      }
    }
    setSavingAll(null);
    toast.show(
      failedTotal
        ? `${savedTotal} saved · ${failedTotal} failed`
        : `Sab save ho gaya ✅ (${savedTotal} images, ${todo.length} products)`,
      { type: failedTotal ? 'error' : 'success' }
    );
    onDone?.();
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="im-manager">
      {/* ── Bulk header ── */}
      <div className="im-product-head">
        <div className="im-product-avatar">⚡</div>
        <div className="im-product-info">
          <div className="im-product-name">Bulk Image Search — {productList.length} products</div>
          <div className="im-product-sub">
            {searchedCount}/{productList.length} searched · <b>{totalSelected}</b> images selected
            {savedIds.size > 0 && <> · <b>{savedIds.size}</b> products saved ✓</>}
          </div>
        </div>
        <button type="button" className="btn-main" onClick={handleSaveAll} disabled={!totalSelected || !!savingAll || searchAllBusy} style={{ minWidth: 170 }}>
          {savingAll ? `Saving ${savingAll.grandDone}/${savingAll.grandTotal}…` : `💾 Save All (${totalSelected})`}
        </button>
      </div>

      {/* ── Shared provider + Search All ── */}
      <div className="im-bulk-toolbar">
        <div className="im-source" style={{ flex: 1, minWidth: 200 }}>
          <label className="im-label" htmlFor="im-bulk-provider">Image Source (sab products ke liye)</label>            <select
              id="im-bulk-provider"
              value={provider}
              onChange={(e) => changeProvider(e.target.value)}
              disabled={searchAllBusy}
            >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} disabled={!(sourceStatus.enabled && sourceStatus.enabled[p.id])}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
          {!enabled && <span className="im-source-hint">⚠️ Key set nahi — .env me check karo</span>}
        </div>
        <div className="im-count">
          <label className="im-label" htmlFor="im-bulk-count">Count</label>
          <select id="im-bulk-count" value={countOptions.includes(count) ? count : countOptions[0]} onChange={(e) => setCount(Number(e.target.value))} disabled={searchAllBusy}>
            {countOptions.map((c) => (
              <option key={c} value={c}>{c} images</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-main im-search-btn" onClick={handleSearchAll} disabled={searchAllBusy || !enabled}>
          {searchAllBusy ? `Searching ${searchProgress.done}/${searchProgress.total}…` : `⚡ Search All (${productList.length})`}
        </button>
      </div>

      {searchAllBusy && (
        <div className="aigen-progress" style={{ margin: '8px 0' }}>
          <div className="aigen-progress-bar-wrap">
            <div className="aigen-progress-bar" style={{ width: `${Math.round((searchProgress.done / searchProgress.total) * 100)}%` }} />
          </div>
          <div className="aigen-progress-info">
            <span>Parallel search chalu hai…</span>
            <span>{searchProgress.done}/{searchProgress.total}</span>
          </div>
        </div>
      )}

      {savingAll && (
        <div className="aigen-progress" style={{ margin: '8px 0' }}>
          <div className="aigen-progress-bar-wrap">
            <div className="aigen-progress-bar" style={{ width: `${Math.round((savingAll.grandDone / savingAll.grandTotal) * 100)}%` }} />
          </div>
          <div className="aigen-progress-info">
            <span>💾 Saving: {savingAll.productName} ({savingAll.done}/{savingAll.total})</span>
            <span>{savingAll.grandDone}/{savingAll.grandTotal}</span>
          </div>
        </div>
      )}

      {/* ── Product tabs ── */}
      <div className="im-tabs" role="tablist">
        {productList.map((p) => {
          const res = resultsByProduct[p.id];
          const selCount = selectedByProduct[p.id]?.length || 0;
          const saved = savedIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={currentId === p.id}
              className={`im-tab${currentId === p.id ? ' on' : ''}`}
              onClick={() => setCurrentId(p.id)}
            >
              <span className="im-tab-name">{p.name}</span>
              <span className="im-tab-meta">
                {saved ? '✓ saved' : res?.searched ? `${res.images?.length || 0} results` : res?.loading ? '…' : '—'}
                {selCount > 0 && <b> · {selCount} sel</b>}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Active product panel ── */}
      {currentId && (() => {
        const p = productList.find((x) => x.id === currentId);
        if (!p) return null;
        const res = resultsByProduct[p.id] || { images: [], page: 1, hasMore: false, loading: false, error: '' };
        const sel = selectedByProduct[p.id] || [];
        return (
          <div key={currentId} className="im-tab-body">
            <ImageSearchPanel
              source={provider} setSource={changeProvider}
              query={queries[p.id]} setQuery={(q) => setQueries((s) => ({ ...s, [p.id]: q }))}
              filters={{ size: '', type: '', orientation: '' }}
              setFilters={() => {}}
              count={count} setCount={setCount}
              images={res.images || []}
              loading={res.loading}
              error={res.error}
              hasMore={res.hasMore}
              page={res.page || 1}
              onSearch={({ page: pgn, append }) => searchOne(p, { page: pgn, append })}
              selected={sel}
              onToggle={(img) => toggleSelect(p.id, img)}
              onSelectAll={() => selectAll(p.id)}
              onClear={() => clearSelection(p.id)}
              sourceStatus={sourceStatus}
              disabled={!!perProductSaving || !!savingAll}
              productLabel={p.id}
            />
            <div className="im-savebar">
              <span className="im-sel-count">Selected: <b>{sel.length}</b> images</span>
              <div className="im-sel-actions">
                <button
                  type="button"
                  className="btn-main"
                  onClick={handleSaveCurrent}
                  disabled={!sel.length || !!perProductSaving || !!savingAll}
                  style={{ minWidth: 170 }}
                >
                  {perProductSaving === p.id ? 'Saving…' : `💾 Save (${sel.length})`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
