// ── Master Prompt AI — client helper ──────────────────────────────────────
// Image generation se pehle product ke title + description se ek professional
// e-commerce "master prompt" banata hai (/api/enhance-prompt → Cloudflare
// Workers AI text, FREE — wahi keys jo image gen use karta hai).
//
// 🗄️ CACHE: har product ka prompt EK BAAR generate hota hai aur localStorage
// me save rehta hai (product_id + input hash ke saath). Dobara run/resume par
// turant cache se milta hai — 0 neurons, instant. Product ki details (name/
// description) badalne par hash mismatch → naya prompt auto-generate.
//
// Fail/timeout hone par ye ERROR throw karta hai — caller ko existing template
// prompt use karna chahiye (image generation KABHI block nahi hota).

const ENHANCE_TIMEOUT_MS = 20000; // server maxDuration 30s — client 20s par abort
const CACHE_KEY = 'rk_master_prompt_v1';
const CACHE_MAX = 500; // entries (purane delete)

// FNV-1a 32-bit — deterministic, sirf cache key ke liye (crypto nahi chahiye).
// NOTE: hash inputs payload jaisi hi normalize hote hain (trim + 300-char
// slice + category_name fallback) — warna mismatch par bekaar regenerate hota.
function hashInput(p) {
  const name = String(p?.name || '').trim();
  const unit = String(p?.unit_value || '').trim();
  const description = String(p?.description || '').trim().slice(0, 300);
  const categoryName = String(p?.categoryName || p?.category_name || '').trim();
  const s = `${name}|${unit}|${description}|${categoryName}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {}; // private mode / SSR — cache off
  }
}

function writeCache(entry) {
  try {
    const obj = readCache();
    obj[entry.productId] = { hash: entry.hash, prompt: entry.prompt, ts: Date.now() };
    const keys = Object.keys(obj);
    if (keys.length > CACHE_MAX) {
      keys
        .sort((a, b) => (obj[a].ts || 0) - (obj[b].ts || 0))
        .slice(0, keys.length - CACHE_MAX)
        .forEach((k) => delete obj[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    /* storage full / blocked — ignore */
  }
}

/**
 * Product info se master image prompt banata hai (server-side, Cloudflare text)
 * — localStorage cache se turant mil sakta hai.
 * @param {object} product — { id?, name, unit_value?, description?, categoryName? }
 * @returns {Promise<{ prompt: string, cached: boolean }>}
 */
export async function enhanceProductPrompt(product) {
  const id = String(product?.id || '');
  const hash = hashInput(product);

  // Cache hit → 0 neurons, instant
  if (id) {
    const c = readCache()[id];
    if (
      c &&
      c.hash === hash &&
      typeof c.prompt === 'string' &&
      c.prompt.length >= 30
    ) {
      return { prompt: c.prompt, cached: true };
    }
  }

  const payload = {
    // id diya to server shared cache (product_image_prompts) use karta hai
    id: String(product?.id || ''),
    name: String(product?.name || '').trim(),
    unit: String(product?.unit_value || '').trim(),
    description: String(product?.description || '').trim().slice(0, 300),
    categoryName: String(
      product?.categoryName || product?.category_name || ''
    ).trim(),
  };
  if (!payload.name) throw new Error('product name required');

  const res = await fetch('/api/enhance-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product: payload }),
    signal: AbortSignal.timeout(ENHANCE_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

  const prompt = String(data?.prompt || '').trim();
  if (!prompt || prompt.length < 30) {
    throw new Error('Enhancer ne khaali prompt diya');
  }

  if (id) writeCache({ productId: id, hash, prompt });
  return { prompt, cached: false };
}
