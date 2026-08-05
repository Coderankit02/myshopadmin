/*!
 * /api/search-images — Vercel serverless proxy for product image search
 * ----------------------------------------------------------------------------
 * Browser se secret keys kabhi expose nahi hote — ye function server-side
 * selected provider ko call karta hai aur normalized results return karta hai.
 *
 * SIRF EK provider per request (spec requirement) — provider param se choose
 * hota hai. Naya provider add karna = PROVIDERS registry me ek entry — UI
 * change nahi karna padega.
 *
 * SETUP (ek baar):
 *   Vercel Dashboard → myshopadmin → Settings → Environment Variables:
 *     BRAVE_API_KEY          = https://brave.com/search/api/  (FREE ~2000/mo)
 *     SERPAPI_API_KEY        = https://serpapi.com/          (FREE 100/mo)
 *     BING_SEARCH_API_KEY    = Azure → Bing Search v7        (FREE 1000/mo)
 *     GOOGLE_CSE_API_KEY     = Google Cloud → Custom Search JSON API (100/day)
 *     GOOGLE_CSE_CX          = Custom Search Engine ID (cse.google.com)
 *   Redeploy.
 *
 * GET /api/search-images?check=1
 *   → { enabled: { brave: true, serpapi: false, ... } }   (UI dropdown state)
 *
 * GET /api/search-images?provider=brave&q=amul+butter&count=20&page=1&size=Large&type=White+Background&orientation=Square
 *   → { provider, query, page, hasMore, caps, images: [ { url, thumb, width, height, title, source, provider } ] }
 *   400 → { error, code: 'NO_KEY'|'BAD_PROVIDER'|'BAD_QUERY' }
 *   502 → { error } (upstream failure)
 */

const PROVIDERS = {
  brave: {
    keyName: 'BRAVE_API_KEY',
    url: 'https://api.search.brave.com/res/v1/images/search',
    maxPerPage: 50,   // Brave API ek call me up to 50 deta hai
    maxPages: 1,      // image search me pagination nahi hai
    // Native filter mapping (generic → provider-specific params)
    mapSize: null,
    mapType: () => null,
    mapOrientation: null,
  },
  serpapi: {
    keyName: 'SERPAPI_API_KEY',
    url: 'https://serpapi.com/search',
    maxPerPage: 100,  // google_images engine ek page me ~100 results deta hai
    maxPages: 4,
    mapSize: (s) => ({ Small: 'isz:i', Medium: 'isz:m', Large: 'isz:l', HD: 'isz:x' }[s] || null),
    mapType: (t) => (t === 'Transparent PNG' ? 'itp:transparent' : null),
    mapOrientation: (o) => ({ Square: 'iar:s', Portrait: 'iar:t', Landscape: 'iar:w' }[o] || null),
  },
  bing: {
    keyName: 'BING_SEARCH_API_KEY',
    url: 'https://api.bing.microsoft.com/v7.0/images/search',
    maxPerPage: 50,
    maxPages: 5,
    mapSize: (s) => ({ Small: 'Small', Medium: 'Medium', Large: 'Large', HD: 'Wallpaper' }[s] || null),
    mapType: (t) => (t === 'Transparent PNG' ? 'Transparent' : null),
    mapOrientation: (o) => ({ Square: 'Square', Portrait: 'Tall', Landscape: 'Wide' }[o] || null),
  },
  google: {
    keyName: 'GOOGLE_CSE_API_KEY',
    cxName: 'GOOGLE_CSE_CX',
    url: 'https://customsearch.googleapis.com/customsearch/v1',
    maxPerPage: 10,   // Custom Search JSON API: num max 10
    maxPages: 10,     // 100 queries/day
    mapSize: (s) => ({ Small: 'small', Medium: 'medium', Large: 'large', HD: 'xxlarge' }[s] || null),
    mapType: () => null,
    mapOrientation: null,
  },
  // ── No-card / instant-key providers ──────────────────────────────────────
  pexels: {
    keyName: 'PEXELS_API_KEY',
    url: 'https://api.pexels.com/v1/search',
    maxPerPage: 40,   // per_page max 80
    maxPages: 5,
    mapSize: (s) => ({ Small: 'small', Medium: 'medium', Large: 'large', HD: 'large' }[s] || null),
    mapType: () => null,
    mapOrientation: (o) => ({ Square: 'square', Portrait: 'portrait', Landscape: 'landscape' }[o] || null),
  },
  pixabay: {
    keyName: 'PIXABAY_API_KEY',
    url: 'https://pixabay.com/api/',
    maxPerPage: 100,
    maxPages: 3,
    mapSize: null,
    mapType: (t) => (t === 'Transparent PNG' ? 'vector' : null),
    mapOrientation: (o) => ({ Landscape: 'horizontal', Portrait: 'vertical' }[o] || null),
  },
  openverse: {
    keyName: null,    // koi key nahi chahiye — hamesha enabled
    url: 'https://api.openverse.org/v1/images/',
    maxPerPage: 20,   // page_size max 20
    maxPages: 10,
    mapSize: (s) => ({ Small: 'small', Medium: 'medium', Large: 'large', HD: 'large' }[s] || null),
    mapType: () => null,
    mapOrientation: (o) => ({ Square: 'square', Portrait: 'tall', Landscape: 'wide' }[o] || null),
  },
};

// Generic "Image Type" chips → query modifier (sab providers par kaam karta hai,
// search intent improve karne ke liye)
const TYPE_QUERY_MOD = {
  Product: '',
  'Front Pack': 'front pack',
  'White Background': 'white background',
  'Transparent PNG': 'transparent background png',
  Lifestyle: 'lifestyle',
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function buildRequestParams(providerId, cfg, q, count, page, size, type, orientation) {
  const params = new URLSearchParams();
  if (providerId === 'pexels') {
    params.set('query', q);
    params.set('per_page', String(count));
    params.set('page', String(page));
    const sz = cfg.mapSize && cfg.mapSize(size);
    if (sz) params.set('size', sz);
    const or = cfg.mapOrientation && cfg.mapOrientation(orientation);
    if (or) params.set('orientation', or);
  } else if (providerId === 'pixabay') {
    params.set('key', process.env[cfg.keyName]);
    params.set('q', q);
    params.set('per_page', String(count));
    params.set('page', String(page));
    params.set('safesearch', 'true');
    const ty = cfg.mapType && cfg.mapType(type);
    if (ty) params.set('image_type', ty);
    const or = cfg.mapOrientation && cfg.mapOrientation(orientation);
    if (or) params.set('orientation', or);
  } else if (providerId === 'openverse') {
    params.set('q', q);
    params.set('page_size', String(count));
    params.set('page', String(page));
    // Commercial store hai — sirf commercial CC-licensed images
    params.set('license_type', 'commercial');
    const sz = cfg.mapSize && cfg.mapSize(size);
    if (sz) params.set('size', sz);
    const or = cfg.mapOrientation && cfg.mapOrientation(orientation);
    if (or) params.set('aspect_ratio', or);
  } else if (providerId === 'serpapi') {
    params.set('engine', 'google_images');
    params.set('api_key', process.env[cfg.keyName]);
    params.set('q', q);
    params.set('ijn', String(page - 1));
    // Google Images ke liye tbs filters
    const tbs = [];
    const sz = cfg.mapSize && cfg.mapSize(size);
    if (sz) tbs.push(sz);
    const ty = cfg.mapType && cfg.mapType(type);
    if (ty) tbs.push(ty);
    const or = cfg.mapOrientation && cfg.mapOrientation(orientation);
    if (or) tbs.push(or);
    if (tbs.length) params.set('tbs', tbs.join(','));
  } else if (providerId === 'bing') {
    params.set('q', q);
    params.set('count', String(count));
    params.set('offset', String((page - 1) * count));
    params.set('safeSearch', 'Moderate');
    const sz = cfg.mapSize && cfg.mapSize(size);
    if (sz) params.set('size', sz);
    const or = cfg.mapOrientation && cfg.mapOrientation(orientation);
    if (or) params.set('aspect', or);
    const ty = cfg.mapType && cfg.mapType(type);
    if (ty) params.set('imageType', ty);
  } else if (providerId === 'google') {
    params.set('key', process.env[cfg.keyName]);
    params.set('cx', process.env[cfg.cxName] || '');
    params.set('searchType', 'image');
    params.set('q', q);
    params.set('num', String(count));
    params.set('start', String((page - 1) * count + 1));
    const sz = cfg.mapSize && cfg.mapSize(size);
    if (sz) params.set('imgSize', sz);
  } else {
    // brave
    params.set('q', q);
    params.set('count', String(count));
    params.set('safesearch', 'moderate');
  }
  return params;
}

function normalizeResults(providerId, data) {
  if (providerId === 'pexels') {
    const arr = data.photos || [];
    return arr.map((p) => ({
      url: p.src?.original,
      thumb: p.src?.medium || p.src?.large || p.src?.original,
      width: p.width || null,
      height: p.height || null,
      title: p.alt || p.photographer || '',
      source: p.photographer ? `Pexels · ${p.photographer}` : 'Pexels',
    }));
  }
  if (providerId === 'pixabay') {
    const arr = data.hits || [];
    return arr.map((h) => ({
      url: h.largeImageURL,
      thumb: h.webformatURL || h.previewURL || h.largeImageURL,
      width: h.imageWidth || null,
      height: h.imageHeight || null,
      title: h.tags || '',
      source: h.user ? `Pixabay · ${h.user}` : 'Pixabay',
    }));
  }
  if (providerId === 'openverse') {
    const arr = data.results || [];
    return arr.map((r) => ({
      url: r.url,
      thumb: r.thumbnail || r.url,
      width: r.width || null,
      height: r.height || null,
      title: r.title || '',
      source: r.source || '',
    }));
  }
  if (providerId === 'brave') {
    const arr = data.images || data.results || data.value || [];
    return arr.map((it) => ({
      url: it.url,
      thumb: it.thumbnail?.src || it.thumbnail || it.url,
      width: it.properties?.width || it.thumbnail?.width || null,
      height: it.properties?.height || it.thumbnail?.height || null,
      title: it.title || '',
      source: it.source || it.page_fetched || '',
    }));
  }
  if (providerId === 'serpapi') {
    const arr = data.images_results || [];
    return arr.map((it) => ({
      url: it.original,
      thumb: it.thumbnail || it.original,
      width: it.original_width || null,
      height: it.original_height || null,
      title: it.title || '',
      source: it.source || '',
    }));
  }
  if (providerId === 'bing') {
    const arr = data.value || [];
    return arr.map((it) => ({
      url: it.contentUrl,
      thumb: it.thumbnailUrl || it.contentUrl,
      width: it.width || null,
      height: it.height || null,
      title: it.name || '',
      source: it.hostPageDisplayUrl || '',
    }));
  }
  // google
  const arr = data.items || [];
  return arr.map((it) => ({
    url: it.link,
    thumb: it.image?.thumbnailLink || it.link,
    width: it.image?.width || null,
    height: it.image?.height || null,
    title: it.title || '',
    source: it.displayLink || it.image?.contextLink || '',
  }));
}

// BUG FIX: pehle sirf main domain allow tha — deployment/preview URLs
// (myshopadmin1-xxx-coderankit02s-projects.vercel.app) 403 aa jaate the, isliye
// search kabhi nahi chalta tha. Ab koi bhi *.vercel.app origin allowed.
const ALLOWED_ORIGINS = [/\.vercel\.app$/i, /^https?:\/\/localhost(:\d+)?$/i, /^https?:\/\/127\.0\.0\.1(:\d+)?$/i];

function originAllowed(req) {
  const origin = req.headers.origin || '';
  // Origin header nahi hai (curl/server) → allow (browser abuse rokna main goal hai)
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((re) => re.test(origin));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Sirf GET requests chalti hain.' });
  if (!originAllowed(req)) return res.status(403).json({ error: 'origin not allowed' });

  // Provider status check — UI dropdown me enabled/disabled state ke liye
  if (req.query.check === '1') {
    const enabled = {};
    for (const [id, cfg] of Object.entries(PROVIDERS)) {
      // keyName null = key chahiye hi nahi (Openverse) → hamesha enabled
      enabled[id] = !cfg.keyName || !!(process.env[cfg.keyName] && (cfg.cxName ? process.env[cfg.cxName] : true));
    }
    return res.status(200).json({ enabled });
  }

  const providerId = String(req.query.provider || '').trim();
  const cfg = PROVIDERS[providerId];
  if (!cfg) {
    return res.status(400).json({ error: `Unknown provider "${providerId}"`, code: 'BAD_PROVIDER' });
  }
  if (cfg.keyName && (!process.env[cfg.keyName] || (cfg.cxName && !process.env[cfg.cxName]))) {
    const missing = cfg.cxName ? `${cfg.keyName} / ${cfg.cxName}` : cfg.keyName;
    return res.status(400).json({
      error: `${missing} env var set nahi hai. Vercel Dashboard → myshopadmin → Settings → Environment Variables me daalo.`,
      code: 'NO_KEY',
      provider: providerId,
    });
  }

  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'q (search query) required', code: 'BAD_QUERY' });

  const size = String(req.query.size || '');
  const type = String(req.query.type || '');
  const orientation = String(req.query.orientation || '');
  const count = clamp(parseInt(req.query.count, 10) || 20, 1, cfg.maxPerPage);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);

  // Generic type chips → query modifier (intent boost)
  const mod = TYPE_QUERY_MOD[type];
  const fullQuery = mod ? `${q} ${mod}`.trim() : q;

  const params = buildRequestParams(providerId, cfg, fullQuery, count, page, size, type, orientation);
  const url = `${cfg.url}?${params.toString()}`;

  try {
    const headers = { Accept: 'application/json' };
    if (providerId === 'brave') headers['X-Subscription-Token'] = process.env[cfg.keyName];
    if (providerId === 'bing') headers['Ocp-Apim-Subscription-Key'] = process.env[cfg.keyName];
    if (providerId === 'pexels') headers.Authorization = process.env[cfg.keyName];

    const r = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const msg = data?.error?.message || data?.error || (data && JSON.stringify(data).slice(0, 160)) || `HTTP ${r.status}`;
      return res.status(502).json({ error: `${providerId} ${r.status}: ${String(msg).slice(0, 200)}` });
    }

    const images = normalizeResults(providerId, data).filter((im) => im.url);
    // Duplicate URLs hatao (page merge ke liye client bhi dedupe karta hai)
    const seen = new Set();
    const unique = images.filter((im) => {
      if (seen.has(im.url)) return false;
      seen.add(im.url);
      return true;
    });

    const hasMore = page < cfg.maxPages && unique.length >= Math.min(count, 10);
    return res.status(200).json({
      provider: providerId,
      query: q,
      page,
      hasMore,
      caps: { maxPerPage: cfg.maxPerPage, maxPages: cfg.maxPages },
      images: unique,
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 200) });
  }
}
