import { useEffect, useMemo, useRef, useState } from 'react';
import ImageSearchPanel from './ImageSearchPanel';
import { uploadToCloudinary } from '../lib/cloudinary';
import { PROVIDERS, getProviderStatus, searchImages } from '../lib/imageSearch';
import { saveProductImages, replaceProductImages } from '../lib/saveImages';
import { enhanceProductPrompt } from '../lib/promptEnhancer';
import { useToast } from '../context/ToastContext';
import '../pagestyles/image-manager.css';

/*!
 * ProductImageManager — ek product ke liye full image manager
 * ---------------------------------------------------------------------------
 * - Image search (Brave / SerpAPI / Bing / Google) — same grid + selection
 * - Upload from computer (drag-drop, compress, multiple)
 * - Paste image URL(s) with preview
 * - AI Generate (existing Cloudflare flux pipeline, multiple images)
 * - Save Selected → download → Cloudinary → product_images → site realtime update
 * - Product Gallery: drag-drop reorder, ⭐ main image, remove (live save)
 *
 * Images saved hote hi `onDone()` call hota hai (Products page refresh ke liye).
 */

const AI_STYLES = [
  'plain seamless white studio background',
  'plain seamless light grey studio background',
  'plain seamless white studio background with soft shadow',
  'plain seamless very light beige background',
];

const POLL_URL = 'https://image.pollinations.ai/prompt/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildAiPrompt(name, unit, styleIdx, masterPrompt) {
  const u = unit ? ` (${unit})` : '';
  // masterPrompt (🤖 Master Prompt AI) mile to wo base hota hai — style +
  // constraints append hote hain taaki quality consistent rahe.
  const base = masterPrompt || `one single "${name}"${u} only, single subject, no other objects`;
  return (
    `${base}, ${AI_STYLES[styleIdx % AI_STYLES.length]}, ` +
    `studio product photo, isolated, centered, photorealistic, high quality, no text, no watermark, no hands`
  );
}

// Cloudflare Workers AI via Vercel proxy (keys server-side)
async function fetchCloudflareBlob(prompt) {
  const res = await fetch('/api/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal: AbortSignal.timeout(65000),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  if (!data?.image?.data) throw new Error('AI response me image nahi mili');
  const { data: b64, mimeType } = data.image;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType || 'image/png' });
  if (blob.size < 1000) throw new Error('AI ne chhoti image di');
  return blob;
}

// Pollinations.ai FREE fallback — koi key nahi chahiye (existing AiImageGen jaisa)
async function fetchPollinationsBlob(prompt) {
  const params = new URLSearchParams({
    model: 'flux',
    width: '1024',
    height: '1024',
    nologo: 'true',
    seed: String(Math.floor(Math.random() * 1000000)), // random → har baar alag
  });
  const res = await fetch(`${POLL_URL}${encodeURIComponent(prompt)}?${params}`);
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 120);
    throw new Error(`Pollinations ${res.status} ${txt}`);
  }
  const ct = res.headers.get('content-type') || '';
  const blob = await res.blob();
  if (!ct.includes('image') || blob.size < 1000) throw new Error(`Image nahi mili (${ct})`);
  return blob;
}

// Primary: Cloudflare → fail par FREE Pollinations fallback (existing behavior match)
async function fetchAiBlob(prompt) {
  try {
    return await fetchCloudflareBlob(prompt);
  } catch (e) {
    const fallback = await fetchPollinationsBlob(prompt);
    return { blob: fallback, usedFallback: true, err: e };
  }
}

export default function ProductImageManager({ product, existingImages = [], onDone }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const dragCountRef = useRef(0);

  const unit = product.unit_value || '';
  const defaultQuery = useMemo(
    () => `${product.name || ''}${unit ? ` ${unit}` : ''}`.trim(),
    [product.name, unit]
  );

  // Default source Openverse — hamesha enabled (koi key nahi chahiye). SerpAPI
  // jaise key-wale providers default rakhe to pehli Search "NO_KEY" error dete hain.
  const [source, setSource] = useState('openverse');
  const [query, setQuery] = useState(defaultQuery);
  const [filters, setFilters] = useState({ size: '', type: '', orientation: '' });
  const [count, setCount] = useState(20);
  const [sourceStatus, setSourceStatus] = useState({ enabled: {} });

  const [images, setImages] = useState([]);   // merged grid (search + upload + url + ai)
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);

  const [mode, setMode] = useState('search'); // search | upload | url | ai
  const [urlText, setUrlText] = useState('');
  const [urlError, setUrlError] = useState('');
  const [aiCount, setAiCount] = useState(4);
  const [useEnhancer, setUseEnhancer] = useState(true); // 🤖 Master Prompt AI (title+description se)
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(null); // { done, total }

  // Gallery (product_images ka live state)
  const [gallery, setGallery] = useState(() =>
    (existingImages || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => ({ url: r.image_url, isDefault: !!r.is_default, id: r.id }))
  );
  const [galleryBusy, setGalleryBusy] = useState(false);

  useEffect(() => {
    getProviderStatus().then((st) => {
      setSourceStatus(st);
      // Current source disabled hai to pehle enabled provider par switch karo
      // (Openverse hamesha enabled hota hai — koi key nahi chahiye)
      const enabledId = PROVIDERS.find((p) => st.enabled && st.enabled[p.id])?.id;
      if (enabledId) setSource((cur) => (st.enabled && st.enabled[cur] ? cur : enabledId));
    }).catch(() => {});
  }, []);

  // Provider badalte hi count ko uske max per page tak clamp karo
  function changeSource(id) {
    setSource(id);
    const p = PROVIDERS.find((x) => x.id === id);
    if (p) setCount((c) => Math.min(c, p.maxPerPage));
  }

  const galleryUrls = useMemo(() => gallery.map((g) => g.url), [gallery]);

  const providerLabel = (id) =>
    ({ brave: 'Brave', serpapi: 'SerpAPI', bing: 'Bing', google: 'Google', pexels: 'Pexels', pixabay: 'Pixabay', openverse: 'Openverse' }[id] || id);

  // ── Search ────────────────────────────────────────────────────────────────
  async function handleSearch({ page: p, append }) {
    if (!query.trim()) { toast.show('Pehle search query likho', { type: 'error' }); return; }
    setLoading(true);
    setError('');
    const res = await searchImages({
      provider: source,
      query: query.trim(),
      page: p,
      count,
      size: filters.size,
      type: filters.type,
      orientation: filters.orientation,
    });
    setLoading(false);
    setPage(p);
    setHasMore(!!res.hasMore);
    if (res.error) {
      setError(res.error);
      if (res.code === 'NO_KEY') {
        setSourceStatus((s) => ({ enabled: { ...s.enabled, [source]: false } }));
      }
      return;
    }
    // dedupe by URL (page merge + upload/url/ai images ke saath)
    setImages((prev) => {
      const base = append ? prev : [];
      const seen = new Set(base.map((i) => i.url));
      const merged = [...base];
      for (const im of res.images) {
        if (seen.has(im.url)) continue;
        seen.add(im.url);
        merged.push({ ...im, sourceLabel: providerLabel(source) });
      }
      return merged;
    });
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  function toggleSelect(img) {
    setSelected((s) => (s.some((x) => x.url === img.url) ? s.filter((x) => x.url !== img.url) : [...s, img]));
  }
  function selectAll() {
    setSelected((s) => (s.length === images.length && images.length > 0 ? [] : images.slice()));
  }
  function clearSelection() { setSelected([]); }

  // ── Upload ────────────────────────────────────────────────────────────────
  async function handleFiles(files) {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    // BUG FIX: error state clear karo — warna pehle ka "Search fail" error grid par
    // priority le leta tha aur upload ki images chhup jaati thin.
    setError('');
    for (const f of list) {
      const { url, error } = await uploadToCloudinary(f, 'products');
      if (url) {
        setImages((prev) => [...prev, { url, thumb: url, width: null, height: null, title: f.name, source: 'Upload', sourceLabel: 'Upload 📤' }]);
      } else {
        toast.show(`Upload fail: ${error || 'unknown'}`, { type: 'error' });
      }
    }
    setMode('search');
  }

  // ── Paste URL ─────────────────────────────────────────────────────────────
  function previewUrls() {
    const urls = urlText
      .split(/\n|,| /)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((u) => /^https?:\/\//i.test(u));
    if (!urls.length) { setUrlError('Koi valid http(s) URL nahi mila'); return; }
    setUrlError('');
    // BUG FIX: error clear karo (upload path jaisa) — paste ki images bhi grid me dikhein
    setError('');
    setImages((prev) => {
      const seen = new Set(prev.map((i) => i.url));
      const next = [...prev];
      for (const u of urls) {
        if (seen.has(u)) continue;
        seen.add(u);
        next.push({ url: u, thumb: u, width: null, height: null, title: u.slice(0, 80), source: 'URL', sourceLabel: 'URL 🔗' });
      }
      return next;
    });
    setUrlText('');
    setMode('search');
  }

  // ── AI Generate ───────────────────────────────────────────────────────────
  async function handleAiGenerate() {
    setAiBusy(true);
    // BUG FIX (root cause): error state clear karo. Pehle Search fail hua (e.g.
    // SerpAPI key nahi) to `error` set rehta tha — grid me error state ko images
    // se priority milti hai, isliye generate hui images kabhi dikhti nahi thin.
    setError('');
    let ok = 0;
    let usedFallback = false;

    // 🤖 Master Prompt AI — product ke title+description se professional image
    // prompt banao (Cloudflare text, FREE). Fail ho to template use hota hai.
    let masterPrompt = null;
    if (useEnhancer) {
      try {
        // category product.categories.name par hota hai (select '*,categories(id,name)')
        masterPrompt = await enhanceProductPrompt({
          ...product,
          categoryName: product.categories?.name,
        });
      } catch (e) {
        toast.show(`Enhancer fail → template prompt: ${String(e.message || e).slice(0, 70)}`, { type: 'error' });
      }
    }

    for (let i = 0; i < aiCount; i++) {
      try {
        const prompt = buildAiPrompt(product.name, unit, i, masterPrompt);
        const r = await fetchAiBlob(prompt);
        const blob = r.blob || r;
        if (r.usedFallback) usedFallback = true;
        const file = new File([blob], `ai-${i}.jpg`, { type: blob.type || 'image/jpeg' });
        const { url, error } = await uploadToCloudinary(file, 'products');
        if (!url) throw new Error(error || 'upload fail');
        setImages((prev) => [...prev, { url, thumb: url, width: null, height: null, title: `${product.name} (AI ${i + 1})`, source: 'AI', sourceLabel: 'AI ✨' }]);
        ok++;
      } catch (e) {
        toast.show(`AI generate fail: ${String(e.message || e).slice(0, 80)}`, { type: 'error' });
      }
      if (i < aiCount - 1) await sleep(1200);
    }
    setAiBusy(false);
    if (ok > 0) {
      toast.show(
        usedFallback
          ? `${ok} AI images ready (Cloudflare keys nahi hain → Pollinations FREE se) ✨`
          : `${ok} AI images ready — select karke Save karo ✨`,
        { type: 'success' }
      );
      setMode('search');
    }
  }

  // ── Save Selected ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selected.length) { toast.show('Pehle images select karo', { type: 'error' }); return; }
    setSaving({ done: 0, total: selected.length });
    const res = await saveProductImages({
      productId: product.id,
      items: selected,
      existingUrls: galleryUrls,
      onProgress: (p) => setSaving({ ...p }),
    });
    setSaving(null);

    const savedSet = new Set(res.saved);
    if (savedSet.size) {
      setSelected((s) => s.filter((i) => !savedSet.has(i.url)));
      setImages((prev) => prev.filter((i) => !savedSet.has(i.url)));
      setGallery((g) => [...g, ...res.saved.map((u, idx) => ({ url: u, isDefault: g.length === 0 && idx === 0 }))]);
    }
    if (res.failed.length) {
      toast.show(`${res.saved.length} saved · ${res.failed.length} failed — ${res.failed[0].error}`, { type: 'error' });
    } else if (res.skipped.length) {
      toast.show(`${res.saved.length} saved · ${res.skipped.length} pehle se saved skip`, { type: 'success' });
    } else {
      toast.show(`${res.saved.length} images save ho gayin ✅`, { type: 'success' });
    }
    onDone?.();
  }

  // ── Gallery operations (live save) ────────────────────────────────────────
  function commitGallery(next) {
    setGallery(next);
    setGalleryBusy(true);
    replaceProductImages(product.id, next.map((g) => ({ url: g.url, isDefault: g.isDefault })))
      .then(({ error }) => {
        if (error) toast.show(`Gallery save fail: ${error.message}`, { type: 'error' });
        else onDone?.();
      })
      .finally(() => setGalleryBusy(false));
  }

  const dragIdx = useRef(null);
  function onDrop(targetIdx) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === targetIdx) return;
    // NOTE: commitGallery ko updater ke ANDAR mat bulao (StrictMode double-invoke
    // → duplicate DB writes). Pehle next compute karo, phir state + DB update.
    const next = [...gallery];
    const [moved] = next.splice(from, 1);
    next.splice(targetIdx, 0, moved);
    setGallery(next);
    commitGallery(next);
  }

  return (
    <div className="im-manager">
      {/* ── Product header ── */}
      <div className="im-product-head">
        <div className="im-product-avatar">🖼️</div>
        <div className="im-product-info">
          <div className="im-product-name">{product.name}{unit ? ` (${unit})` : ''}</div>
          <div className="im-product-sub">
            {gallery.length} images in gallery · saved images site par turant dikhegi (realtime)
          </div>
        </div>
        <span className={`im-chip-btn${galleryBusy ? ' im-disabled' : ''}`} title="Product id">
          #{product.id?.slice?.(0, 8) || product.id}
        </span>
      </div>

      {/* ── Mode switcher: search | upload | url | ai ── */}
      <div className="im-mode-row">
        {[
          { id: 'search', label: '🔎 Search' },
          { id: 'upload', label: '📤 Upload' },
          { id: 'url', label: '🔗 Paste URL' },
          { id: 'ai', label: '✨ AI Generate' },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            className={`im-mode-btn${mode === m.id ? ' on' : ''}`}
            onClick={() => setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'search' && (
        <ImageSearchPanel
          source={source} setSource={changeSource}
          query={query} setQuery={setQuery}
          filters={filters} setFilters={setFilters}
          count={count} setCount={setCount}
          images={images} loading={loading} error={error} hasMore={hasMore} page={page}
          onSearch={handleSearch}
          selected={selected} onToggle={toggleSelect} onSelectAll={selectAll} onClear={clearSelection}
          sourceStatus={sourceStatus}
          disabled={!!saving || aiBusy}
          productLabel="single"
        />
      )}

      {mode === 'upload' && (
        <div
          className="im-upload-zone"
          onDragOver={(e) => { e.preventDefault(); dragCountRef.current++; e.currentTarget.classList.add('drag'); }}
          onDragLeave={(e) => { dragCountRef.current--; if (!dragCountRef.current) e.currentTarget.classList.remove('drag'); }}
          onDrop={(e) => { e.preventDefault(); dragCountRef.current = 0; e.currentTarget.classList.remove('drag'); handleFiles(e.dataTransfer.files); }}
        >
          <div className="im-upload-icon">📤</div>
          <div className="im-upload-title">Drag &amp; drop images yahan</div>
          <div className="im-upload-sub">Multiple images · auto-compress · Cloudinary par jayengi</div>
          <button type="button" className="btn-main" onClick={() => fileRef.current?.click()}>Choose Files</button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      )}

      {mode === 'url' && (
        <div className="im-url-box">
          <label className="im-label" htmlFor="im-urls">Image URLs (ek line par ek / comma se alag)</label>
          <textarea
            id="im-urls"
            rows={4}
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder="https://example.com/img1.jpg&#10;https://example.com/img2.png"
          />
          {urlError && <div className="im-url-error">{urlError}</div>}
          <div className="modal-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn-main" onClick={previewUrls}>Preview in grid</button>
          </div>
        </div>
      )}

      {mode === 'ai' && (
        <div className="im-ai-box">
          <div className="im-ai-hero">✨ Flux AI — product ke liye images banao (FREE tier)</div>
          <div className="im-ai-row">
            <span className="im-label" style={{ margin: 0 }}>Kitni images?</span>
            {[2, 4, 6].map((n) => (
              <label key={n} className={`aigen-delay-opt${aiCount === n ? ' on' : ''}`}>
                <input type="radio" name="im-ai-count" checked={aiCount === n} onChange={() => setAiCount(n)} />
                {n}
              </label>
            ))}
          </div>
          <div className="modal-actions" style={{ marginTop: 10 }}>
            <button type="button" className="btn-main" onClick={handleAiGenerate} disabled={aiBusy}>
              {aiBusy ? 'Generating… (delay ~1.2s/img)' : `✨ Generate ${aiCount} images`}
            </button>
          </div>
          <label
            className="im-ai-enhancer"
            style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginTop: 10 }}
          >
            <input
              type="checkbox"
              checked={useEnhancer}
              onChange={(e) => setUseEnhancer(e.target.checked)}
              style={{ accentColor: 'var(--primary)', width: 15, height: 15 }}
            />
            🤖 <b>Master Prompt AI</b> — title + description se professional image prompt banao (jaise real grocery sites karti hain — Cloudflare text, FREE)
          </label>
          <p className="im-ai-hint">
            Generated images grid me dikhengi — unhe select karke Save dabao. Cloudflare keys set hain to
            wahi use hoga, warna FREE Pollinations fallback se banegi (koi key nahi chahiye).
          </p>
        </div>
      )}

      {/* ── Save bar ── */}
      <div className="im-savebar">
        <span className="im-sel-count">Selected: <b>{selected.length}</b></span>
        <div className="im-sel-actions">
          <button
            type="button"
            className="btn-main"
            onClick={handleSave}
            disabled={!selected.length || !!saving || aiBusy}
            style={{ minWidth: 180 }}
          >
            {saving ? `Saving ${saving.done}/${saving.total}…` : `💾 Save Selected (${selected.length})`}
          </button>
        </div>
      </div>
      {saving && (
        <div className="aigen-progress" style={{ marginTop: 8 }}>
          <div className="aigen-progress-bar-wrap">
            <div className="aigen-progress-bar" style={{ width: `${Math.round((saving.done / saving.total) * 100)}%` }} />
          </div>
          <div className="aigen-progress-info">
            <span>Downloading + uploading…</span>
            <span>{saving.done}/{saving.total}</span>
          </div>
        </div>
      )}

      {/* ── Product Gallery ── */}
      <div className="im-gallery">
        <div className="im-gallery-head">
          <span className="im-label" style={{ margin: 0 }}>Product Gallery ({gallery.length})</span>
          <span className="im-gallery-hint">drag to reorder · ⭐ main image · site par same order</span>
        </div>
        {gallery.length === 0 ? (
          <div className="im-gallery-empty">Abhi koi image nahi — upar se search/upload karke save karo</div>
        ) : (
          <div className="im-gallery-grid">
            {gallery.map((g, i) => (
              <div
                key={`${g.url}-${i}`}
                className={`im-gallery-slot${g.isDefault ? ' is-default' : ''}`}
                draggable={!galleryBusy}
                onDragStart={(e) => { dragIdx.current = i; e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); onDrop(i); }}
              >
                <img src={g.url} alt={`gallery ${i + 1}`} loading="lazy" />
                {g.isDefault && <span className="pimg-star">⭐ Main</span>}
                <span className="im-gallery-idx">{i + 1}</span>
                <div className="pimg-controls">
                  {!g.isDefault && (
                    <button
                      type="button"
                      className="pimg-ctrl-btn setdef"
                      title="Main image banao"
                      onClick={() => commitGallery(gallery.map((x, xi) => ({ ...x, isDefault: xi === i })))}
                    >
                      ⭐
                    </button>
                  )}
                  <button
                    type="button"
                    className="pimg-ctrl-btn del"
                    title="Remove"
                    onClick={() => commitGallery(gallery.filter((_, xi) => xi !== i))}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
