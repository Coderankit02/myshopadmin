// ── Master Prompt AI — client helper ──────────────────────────────────────
// Image generation se pehle product ke title + description se ek professional
// e-commerce "master prompt" banata hai (/api/enhance-prompt → Cloudflare
// Workers AI text, FREE — wahi keys jo image gen use karta hai).
//
// Fail/timeout hone par ye ERROR throw karta hai — caller ko existing template
// prompt use karna chahiye (image generation KABHI block nahi hota).

// Server function maxDuration 30s hai — client 20s par abort kare taaki
// server ka 502 aane se pehle hi graceful template fallback mil jaye.
const ENHANCE_TIMEOUT_MS = 20000;

/**
 * Product info se master image prompt banata hai (server-side, Cloudflare text).
 * @param {object} product — { name, unit_value?, description?, categoryName? }
 * @returns {Promise<string>} master prompt
 */
export async function enhanceProductPrompt(product) {
  const payload = {
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
  return prompt;
}
