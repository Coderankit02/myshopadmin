// ── Product Image Search — client helper ────────────────────────────────────
// Provider registry + result cache + normalized fetch. Search API secrets
// server-side rehte hain (/api/search-images); browser me kabhi nahi.

// Order matters — dropdown me isi order me dikhenge. `key: null` = key chahiye
// hi nahi (Openverse — hamesha enabled).
export const PROVIDERS = [
  { id: 'serpapi',   label: 'Google Images (SerpAPI)', key: 'SERPAPI_API_KEY', emoji: '🔍', maxPerPage: 100, filters: ['size', 'type', 'orientation'] },
  { id: 'openverse', label: 'Openverse (no key)',      key: null,               emoji: '🌐', maxPerPage: 20,  filters: ['size', 'orientation'] },
  { id: 'pexels',    label: 'Pexels (stock)',          key: 'PEXELS_API_KEY',   emoji: '📷', maxPerPage: 40,  filters: ['size', 'orientation'] },
  { id: 'pixabay',   label: 'Pixabay (stock)',         key: 'PIXABAY_API_KEY',  emoji: '🎨', maxPerPage: 100, filters: ['type', 'orientation'] },
  { id: 'brave',     label: 'Brave Image Search',      key: 'BRAVE_API_KEY',    emoji: '🦁', maxPerPage: 50,  filters: ['size', 'type'] },
  { id: 'bing',      label: 'Bing Image Search',       key: 'BING_SEARCH_API_KEY', emoji: '🅱️', maxPerPage: 50, filters: ['size', 'type', 'orientation'] },
  { id: 'google',    label: 'Google Custom Search',    key: 'GOOGLE_CSE_API_KEY', emoji: '🇬', maxPerPage: 10, filters: ['size', 'type'] },
];

export const SIZE_OPTIONS = ['Small', 'Medium', 'Large', 'HD'];
export const TYPE_OPTIONS = ['Product', 'Front Pack', 'White Background', 'Transparent PNG', 'Lifestyle'];
export const ORIENTATION_OPTIONS = ['Square', 'Portrait', 'Landscape'];
export const COUNT_OPTIONS = [20, 50, 100];

// ── Provider status (keys set hain ya nahi) ────────────────────────────────
let statusCache = null; // { enabled: {brave:true,...}, ts }
export async function getProviderStatus(force = false) {
  if (!force && statusCache && Date.now() - statusCache.ts < 10 * 60 * 1000) {
    return statusCache;
  }
  try {
    const res = await fetch('/api/search-images?check=1');
    const data = await res.json();
    statusCache = { enabled: data.enabled || {}, ts: Date.now() };
  } catch {
    statusCache = statusCache || { enabled: {}, ts: Date.now() };
  }
  return statusCache;
}

// ── Result cache (10 min TTL) — baar-baar search na karna pade ─────────────
const cache = new Map(); // key -> { ts, data }
const CACHE_TTL = 10 * 60 * 1000;
const MAX_CACHE = 60;

function cacheKey(provider, query, page, count, size, type, orientation) {
  return [provider, query, page, count, size || '-', type || '-', orientation || '-'].join('|');
}

export function clearSearchCache() {
  cache.clear();
}

/**
 * Search images from ONE provider (spec: kabhi sab providers ek saath nahi).
 * @returns {Promise<{provider, query, page, hasMore, caps, images, error, code}>}
 */
export async function searchImages({ provider, query, page = 1, size, type, orientation, count = 20 }) {
  const key = cacheKey(provider, query, page, count, size, type, orientation);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { ...hit.data, cached: true };
  }

  const params = new URLSearchParams({
    provider,
    q: query,
    page: String(page),
    count: String(count),
  });
  if (size) params.set('size', size);
  if (type) params.set('type', type);
  if (orientation) params.set('orientation', orientation);

  let res;
  try {
    res = await fetch(`/api/search-images?${params.toString()}`, { signal: AbortSignal.timeout(45000) });
  } catch (e) {
    return { provider, query, page, hasMore: false, caps: null, images: [], error: String(e.message || e), code: 'NETWORK' };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok || !data) {
    const err = {
      provider, query, page,
      hasMore: false, caps: null, images: [],
      error: data?.error || `HTTP ${res.status}`,
      code: data?.code || 'ERROR',
    };
    return err;
  }

  const out = {
    provider: data.provider,
    query: data.query,
    page: data.page,
    hasMore: !!data.hasMore,
    caps: data.caps || null,
    images: data.images || [],
  };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { ts: Date.now(), data: out });
  return out;
}
