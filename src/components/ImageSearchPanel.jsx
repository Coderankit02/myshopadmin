import { useEffect, useRef, useState } from 'react';
import {
  PROVIDERS, SIZE_OPTIONS, TYPE_OPTIONS, ORIENTATION_OPTIONS, COUNT_OPTIONS,
} from '../lib/imageSearch';
import '../pagestyles/image-manager.css';

/*!
 * ImageSearchPanel — reusable search + grid + multi-select UI
 * ---------------------------------------------------------------------------
 * FULLY CONTROLLED component — saara state parent (ProductImageManager /
 * BulkImageManager) ke paas rehta hai, taaki single aur bulk dono mode isse
 * reuse kar sakein. Search results, selection, pagination sab props ke through
 * aate hain.
 *
 * Features: source dropdown, query box (Enter = search), filters, 20/50/100
 * count, responsive grid, checkbox select, hover overlay + preview lightbox,
 * source/resolution badges, select-all, infinite scroll + Load More, skeletons,
 * error + retry, dark mode (CSS vars), keyboard shortcuts (Enter, Ctrl+A).
 */

const providerById = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

function FilterChips({ title, options, value, onChange }) {
  return (
    <div className="im-filter-row">
      <span className="im-filter-label">{title}</span>
      <div className="im-filter-chips">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            className={`im-filter-chip${value === o ? ' on' : ''}`}
            onClick={() => onChange(value === o ? '' : o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ImageSearchPanel({
  // search state (controlled)
  source, setSource,
  query, setQuery,
  filters, setFilters,
  count, setCount,
  images, loading, error, hasMore, page,
  onSearch,          // ({ page, append }) => void
  // selection (controlled)
  selected, onToggle, onSelectAll, onClear,
  // misc
  sourceStatus,      // { enabled: {...} }
  disabled,          // true = save in progress
  productLabel,      // title chip me dikhane ke liye
}) {
  const provider = providerById(source);
  const [preview, setPreview] = useState(null); // lightbox
  const sentinelRef = useRef(null);
  const gridRef = useRef(null);

  const enabled = !!(sourceStatus?.enabled && sourceStatus.enabled[source]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typing) {
        e.preventDefault();
        onSelectAll();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSelectAll]);

  // ── Infinite scroll ───────────────────────────────────────────────────────
  // Sentinel grid ke ANDAR hai (root = grid scroll container) — isliye sirf
  // tab fire hota hai jab user grid ko neeche scroll karta hai. Grid ki fixed
  // max-height ki wajah se sentinel bahar rakhte to sab pages auto-load ho
  // jaate — ye bug pehle fix kiya.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || !images.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loading) onSearch({ page: page + 1, append: true });
      },
      { root: gridRef.current, rootMargin: '300px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, page, images.length, images]);

  function submitSearch(e) {
    e?.preventDefault();
    if (!enabled || loading) return;
    onSearch({ page: 1, append: false });
  }

  const selCount = selected.length;
  const allSelected = images.length > 0 && selCount === images.length;

  const showSize = provider.filters.includes('size');
  const showType = provider.filters.includes('type');
  const showOrient = provider.filters.includes('orientation');

  const canCounts = COUNT_OPTIONS.filter((c) => c <= provider.maxPerPage);
  const countOptions = canCounts.length ? canCounts : [provider.maxPerPage];

  return (
    <div className="im-panel">
      {/* ── Source dropdown + search box ── */}
      <div className="im-toolbar">
        <div className="im-source">
          <label className="im-label" htmlFor={`im-source-${productLabel || 'x'}`}>Image Source</label>
          <select
            id={`im-source-${productLabel || 'x'}`}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            disabled={disabled}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id} disabled={!(sourceStatus?.enabled && sourceStatus.enabled[p.id])}>
                {p.emoji} {p.label}
              </option>
            ))}
          </select>
          {!enabled && provider.key && (
            <span className="im-source-hint">⚠️ Key set nahi — .env me <b>{provider.key}</b> daalo</span>
          )}
        </div>

        <form className="im-search" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="im-query">Search images</label>
          <input
            id="im-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search… (product name auto-filled)"
            disabled={!enabled || disabled}
          />
          <button type="submit" className="btn-main im-search-btn" disabled={!enabled || loading || disabled}>
            {loading && page === 1 ? 'Searching…' : '🔎 Search'}
          </button>
        </form>

        <div className="im-count">
          <label className="im-label" htmlFor="im-count">Count</label>
          <select id="im-count" value={countOptions.includes(count) ? count : countOptions[0]} onChange={(e) => setCount(Number(e.target.value))} disabled={disabled}>
            {countOptions.map((c) => <option key={c} value={c}>{c} images</option>)}
          </select>
        </div>
      </div>

      {/* ── Filters ── */}
      {(showSize || showType || showOrient) && (
        <div className="im-filters">
          {showSize && (
            <FilterChips title="Image Size" options={SIZE_OPTIONS} value={filters.size} onChange={(v) => setFilters((f) => ({ ...f, size: v }))} />
          )}
          {showType && (
            <FilterChips title="Image Type" options={TYPE_OPTIONS} value={filters.type} onChange={(v) => setFilters((f) => ({ ...f, type: v }))} />
          )}
          {showOrient && (
            <FilterChips title="Orientation" options={ORIENTATION_OPTIONS} value={filters.orientation} onChange={(v) => setFilters((f) => ({ ...f, orientation: v }))} />
          )}
        </div>
      )}

      {/* ── Selection bar ── */}
      <div className="im-selbar">
        <span className="im-sel-count">Selected: <b>{selCount}</b> {selCount === 1 ? 'Image' : 'Images'}</span>
        <div className="im-sel-actions">
          <button type="button" className="im-chip-btn" onClick={onSelectAll} disabled={!images.length || disabled}>
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <button type="button" className="im-chip-btn" onClick={onClear} disabled={!selCount || disabled}>
            Clear Selection
          </button>
        </div>
      </div>

      {/* ── Grid ── */}
      {loading && page === 1 ? (
        <div className="im-grid" aria-busy="true">
          {Array.from({ length: Math.min(count, 12) }).map((_, i) => (
            <div key={i} className="im-card"><div className="skel im-skel" /></div>
          ))}
        </div>
      ) : error ? (
        <div className="im-state" role="alert">
          <div className="im-state-icon">😵</div>
          <div className="im-state-title">Search fail ho gaya</div>
          <div className="im-state-sub">{error}</div>
          <button type="button" className="btn-main" onClick={() => onSearch({ page: 1, append: false })} disabled={disabled}>
            🔄 Retry
          </button>
        </div>
      ) : images.length === 0 ? (
        <div className="im-state">
          <div className="im-state-icon">🖼️</div>
          <div className="im-state-title">Abhi koi image nahi</div>
          <div className="im-state-sub">Upar query likh kar Search dabao — ya Upload / Paste URL / AI Generate use karo</div>
        </div>
      ) : (
        <>
          <div className="im-grid" ref={gridRef}>
            {images.map((img, i) => {
              const isSel = !!selected.find((s) => s.url === img.url);
              return (
                <div key={`${img.url}-${i}`} className={`im-card${isSel ? ' sel' : ''}`}>
                  <label className="im-card-check">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggle(img)}
                      disabled={disabled}
                      aria-label={`Select ${img.title || 'image'}`}
                    />
                    <span className="im-checkbox" />
                  </label>
                  <img
                    src={img.thumb || img.url}
                    alt={img.title || 'image'}
                    loading="lazy"
                    className="im-card-img"
                    onClick={() => setPreview(img)}
                  />
                  <div className="im-card-hover">
                    <button type="button" className="im-zoom" onClick={() => setPreview(img)} aria-label="Preview">⛶</button>
                    <span className="im-card-title">{img.title || 'Image'}</span>
                  </div>
                  {img.source && <span className="im-badge im-src">{img.sourceLabel || provider.label}</span>}
                  {img.width && img.height && (
                    <span className="im-badge im-res">{img.width}×{img.height}</span>
                  )}
                  {isSel && <span className="im-sel-tick">✓</span>}
                </div>
              );
            })}
            {hasMore && <div ref={sentinelRef} className="im-sentinel-card" aria-hidden="true" />}
            {loading && <div className="skel im-skel-row" />}
          </div>

          {hasMore && !loading && (
            <div className="im-more-wrap">
              <button type="button" className="im-chip-btn im-more" onClick={() => onSearch({ page: page + 1, append: true })}>
                Load more images…
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Lightbox preview ── */}
      {preview && (
        <div className="im-lightbox" onClick={() => setPreview(null)} role="dialog" aria-modal="true">
          <button type="button" className="im-lightbox-close" onClick={() => setPreview(null)} aria-label="Close preview">✕</button>
          <img src={preview.url} alt={preview.title || 'preview'} />
          <div className="im-lightbox-meta">
            <span>{preview.title || 'Image'}</span>
            {preview.width && preview.height && <span>{preview.width}×{preview.height}</span>}
            {preview.source && <span>{preview.source}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
