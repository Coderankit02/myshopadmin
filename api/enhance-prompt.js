/*!
 * /api/enhance-prompt — Master Prompt AI (Cloudflare Workers AI text, FREE)
 * -----------------------------------------------------------------------------
 * Image generation se PEHLE ye step chalta hai: product ke title (name) +
 * description + category se ek professional e-commerce grade "master prompt"
 * banata hai (jaise real grocery sites product photos ke liye use karte hain).
 * Fir wo master prompt image AI (flux-1-schnell) ko milta hai — images zyada
 * realistic aur product-specific ban jaati hain.
 *
 * Keys server-side rehti hain (Vercel env: CLOUDFLARE_ACCOUNT_ID /
 * CLOUDFLARE_API_TOKEN) — wahi keys jo image generation use karta hai, koi
 * naya setup nahi chahiye. FREE tier (10k neurons/day) me text bahut cheap hai
 * (~0.3-0.5 neurons per call) vs images (~59 neurons/image).
 *
 * REQUEST (POST, JSON):  { "product": { "id"?, "name", "unit", "description", "categoryName" } }
 *   id diya to shared cache (product_image_prompts) use hota hai — cache hit
 *   → 0 neurons, instant. Cache response: { prompt, cached: true, model: "cache" }
 * RESPONSE:
 *   200 → { "prompt": "<master prompt>", "model": "...", "usage": { ... } }
 *   4xx/5xx → { "error": "..." }
 *
 * NOTE (verified Aug 2026): Cloudflare Workers AI text models OpenAI-style
 * `messages` array accept karte hain; response `result.response` me aata hai.
 */

const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CF_TIMEOUT_MS = 25000;

// ── Cross-device cache (Supabase) ──────────────────────────────────────────
// `product_image_prompts` table (admin-wiring-migration.sql → section 14) me
// har product ka master prompt save hota hai — localStorage (browser) + ye
// shared cache dono mil kar neurons bachate hain. Agar table abhi maujood na
// ho (migration abhi run nahi hui) to ye code SILENTLY skip hota hai — koi
// error nahi, sirf cache on nahi hota.
const CACHE_TABLE = 'product_image_prompts';
const SB_URL = process.env.VITE_SUPABASE_URL || '';
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY || '';

// FNV-1a 32-bit — same normalization as client (name|unit|desc300|category)
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function clean(s, max) {
  return String(s || '')
    .replace(/["'`]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function cacheGet(productId, inputHash) {
  if (!SB_URL || !SB_ANON || !productId) return null;
  try {
    const url = `${SB_URL}/rest/v1/${CACHE_TABLE}?product_id=eq.${encodeURIComponent(productId)}&input_hash=eq.${encodeURIComponent(inputHash)}&select=prompt`;
    const r = await fetch(url, {
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return null; // table missing / RLS — graceful skip
    const rows = await r.json().catch(() => null);
    const prompt = rows?.[0]?.prompt;
    return typeof prompt === 'string' && prompt.length >= 30 ? prompt : null;
  } catch {
    return null;
  }
}

async function cacheSet(productId, inputHash, prompt, model) {
  if (!SB_URL || !SB_ANON || !productId) return;
  try {
    await fetch(`${SB_URL}/rest/v1/${CACHE_TABLE}`, {
      method: 'POST',
      headers: {
        apikey: SB_ANON,
        Authorization: `Bearer ${SB_ANON}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([
        { product_id: productId, prompt, model, input_hash: inputHash, updated_at: new Date().toISOString() },
      ]),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* non-fatal */
  }
}

function buildMessages(product) {
  const name = clean(product?.name, 120) || 'Unknown product';
  const unit = product?.unit ? ` (${clean(product.unit, 30)})` : '';
  const desc = clean(product?.description, 300);
  const cat = clean(product?.categoryName, 80);

  const system =
    'You are a professional e-commerce product photography prompt engineer, like the ones working for ' +
    'top grocery delivery apps. Create ONE detailed image-generation prompt for a single product photo. ' +
    'Rules: single subject only, product centered, clean studio background, photorealistic, high quality, ' +
    'professional lighting, no text, no watermark, no hands, no other objects, no leaves, no basket, no bowl. ' +
    'Use the product details given to make the prompt vivid and specific (packaging, contents, texture). ' +
    'Reply with ONLY the prompt text, maximum 100 words, no quotes, no explanations.';

  const user =
    `Product: ${name}${unit}.${desc ? ` Description: ${desc}.` : ''}${cat ? ` Category: ${cat}.` : ''}\n` +
    'Write the image-generation prompt now.';

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sirf POST requests chalti hain.' });
  }

  let product = {};
  try { product = req.body?.product || {}; } catch { /* ignore */ }
  if (!String(product.name || '').trim()) {
    return res.status(400).json({ error: 'product.name required' });
  }

  // Cache lookup (cross-device shared) — product_id + input_hash match par hit.
  // Cloudflare keys check se PEHLE — cache hit ke liye CF zaroori nahi (quota
  // khatam/keys missing hone par bhi cached prompts chalte rahen).
  const productId = String(product?.id || '').trim();
  const inputHash = fnv1a(
    [clean(product.name, 120), clean(product.unit, 30), clean(product.description, 300), clean(product.categoryName, 80)].join('|')
  );
  if (productId) {
    const cachedPrompt = await cacheGet(productId, inputHash);
    if (cachedPrompt) {
      return res.status(200).json({ prompt: cachedPrompt, cached: true, model: 'cache' });
    }
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    return res.status(500).json({
      error: 'CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN set nahi hain (Vercel env me daalo — image generation wali keys).',
    });
  }

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CF_MODEL}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({
          messages: buildMessages(product),
          max_tokens: 220,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(CF_TIMEOUT_MS),
      }
    );

    const json = await cfRes.json().catch(() => null);
    if (!cfRes.ok || !json?.success) {
      const msg = json?.errors?.[0]?.message || json?.errors?.[0] || `HTTP ${cfRes.status}`;
      throw new Error(`Cloudflare ${cfRes.status}: ${String(msg).slice(0, 250)}`);
    }

    const raw = String(json.result?.response || '').trim();
    // Kuch models quotes ke andar reply karte hain — strip karo
    const prompt = raw.replace(/^["']|["']$/g, '').trim();
    if (!prompt || prompt.length < 30) {
      throw new Error('Cloudflare ne khaali ya bekaar prompt diya');
    }

    // Shared cache me save (agar table ho) — product details badlne par hash
    // mismatch → agla call naya generate karega
    if (productId) await cacheSet(productId, inputHash, prompt, CF_MODEL);

    return res.status(200).json({ prompt, model: CF_MODEL, usage: json.result?.usage || null });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 250) });
  }
}
