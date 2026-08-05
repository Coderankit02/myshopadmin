/*!
 * /api/generate-image — Vercel serverless proxy for AI product image generation
 * -----------------------------------------------------------------------------
 * Browser se secret keys kabhi expose nahi hote — ye function server-side
 * Cloudflare Workers AI (flux-1-schnell) ko call karta hai aur base64 image
 * return karta hai.
 *
 * SETUP (ek baar):
 *   1. Cloudflare account banao (FREE, no credit card) — dash.cloudflare.com
 *   2. Account ID lo: dashboard me kisi bhi page ke right sidebar me milta hai
 *   3. API Token: My Profile → API Tokens → Create Token → "Custom token"
 *      → Permission: Account → Workers AI → Edit
 *   4. Vercel Dashboard → myshopadmin → Settings → Environment Variables:
 *        CLOUDFLARE_ACCOUNT_ID = <account id>
 *        CLOUDFLARE_API_TOKEN  = <api token>
 *   5. Redeploy
 *
 * FREE TIER: 10,000 neurons/day ≈ ~170 images/day (1024x1024, 4 steps).
 * Steps 4 rakhne se best quality-per-neuron milta hai (schnell 4-8 range).
 *
 * REQUEST (POST, JSON):  { "prompt": "..." }
 * RESPONSE:
 *   200 → { "image": { "data": "<base64>", "mimeType": "image/jpeg" }, "model": "@cf/black-forest-labs/flux-1-schnell" }
 *   4xx/5xx → { "error": "..." }
 *
 * NOTE (verified Aug 2026): Cloudflare ka raw response `result.image` me base64
 * string deta hai (JSON.parse karna zaroori hai — raw body image nahi hai).
 */

const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const CF_TIMEOUT_MS = 45000;

async function generateWithCloudflare(accountId, apiToken, prompt) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        prompt,
        steps: 4,          // schnell optimized: 4-8; 4 = best quality-per-neuron
        width: 1024,
        height: 1024,
      }),
      signal: AbortSignal.timeout(CF_TIMEOUT_MS),
    }
  );

  // BUG FIX (Critical): pehle raw body ko hi image maan liya jaata tha — par
  // Cloudflare ka response JSON hai: { result: { image: "<base64>" } }. Ab
  // JSON parse karke result.image (base64 string) extract hota hai.
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    const msg = json?.errors?.[0]?.message || json?.errors?.[0] || `HTTP ${res.status}`;
    throw new Error(`Cloudflare ${res.status}: ${String(msg).slice(0, 250)}`);
  }
  const b64 = json?.result?.image;
  if (!b64 || typeof b64 !== 'string' || b64.length < 1000) {
    throw new Error(`Cloudflare ne image nahi di (${String(b64 || '').length}b)`);
  }
  // flux-1-schnell JPEG deta hai (/9j/), PNG bhi ho sakta hai — detect karo
  const mime = b64.startsWith('iVBORw0KGgo') ? 'image/png' : 'image/jpeg';
  return { data: b64, mime };
}

export default async function handler(req, res) {
  // Same-origin call hai, par cross-origin testing ke liye CORS headers safe rakhne
  // me koi harm nahi — POST response par bhi daalte hain.
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
      error: 'CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN set nahi hain. Cloudflare Dashboard se free account banao, token banao, aur Vercel env me daalo (README dekho).',
    });
  }

  let body = {};
  try { body = req.body || {}; } catch { /* ignore */ }
  const prompt = String(body.prompt || '').trim();
  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    const img = await generateWithCloudflare(accountId, apiToken, prompt);
    return res.status(200).json({ image: { data: img.data, mimeType: img.mime }, model: CF_MODEL });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 250) });
  }
}
