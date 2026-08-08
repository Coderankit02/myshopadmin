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
 * REQUEST (POST, JSON):  { "product": { "name", "unit", "description", "categoryName" } }
 * RESPONSE:
 *   200 → { "prompt": "<master prompt>", "model": "...", "usage": { ... } }
 *   4xx/5xx → { "error": "..." }
 *
 * NOTE (verified Aug 2026): Cloudflare Workers AI text models OpenAI-style
 * `messages` array accept karte hain; response `result.response` me aata hai.
 */

const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CF_TIMEOUT_MS = 25000;

// Prompt-injection hardening: product fields user/admin data hain — quotes,
// newlines, control chars LLM ke prompt me RAW nahi jaane chahiye (original
// code name ko quotes me rakhta tha isi liye).
function clean(s, max) {
  return String(s || '')
    .replace(/["'`]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
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

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    return res.status(500).json({
      error: 'CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN set nahi hain (Vercel env me daalo — image generation wali keys).',
    });
  }

  let product = {};
  try { product = req.body?.product || {}; } catch { /* ignore */ }
  if (!String(product.name || '').trim()) {
    return res.status(400).json({ error: 'product.name required' });
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

    return res.status(200).json({ prompt, model: CF_MODEL, usage: json.result?.usage || null });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 250) });
  }
}
