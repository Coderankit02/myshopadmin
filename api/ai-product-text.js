/*!
 * /api/ai-product-text — Product Name + Description AI (Cloudflare Workers AI, FREE)
 * -----------------------------------------------------------------------------
 * Admin Products form me jab admin sirf HINDI naam daalta hai (e.g. "गेहूं का
 * आटा"), to ye endpoint usse ek professional ENGLISH product name aur chhota
 * description generate karta hai — bilkul FREE (wahi Cloudflare keys jo image
 * generation use karti hain, koi naya setup nahi).
 *
 * REQUEST (POST, JSON): { "name": "गेहूं का आटा", "category": "Atta & Flour" }
 * RESPONSE: { "englishName": "Wheat Flour", "description": "...", "model": "..." }
 *
 * NOTE (verified Aug 2026): Cloudflare Workers AI text models OpenAI-style
 * `messages` array accept karte hain; response `result.response` me aata hai.
 */

const CF_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CF_TIMEOUT_MS = 25000;

function clean(s, max) {
  return String(s || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function buildMessages(name, category) {
  const product = clean(name, 120) || 'Unknown product';
  const cat = clean(category, 80);

  const system =
    'You are a professional assistant for an Indian grocery e-commerce store. ' +
    'You receive a product name that may be in HINDI, Hinglish, or a mix. ' +
    'Your job: (1) give the correct ENGLISH product name (title case, max 45 characters, ' +
    'include quantity/pack size if present in the input), and (2) a short, attractive ' +
    'product description (2-3 sentences, max 70 words) suitable for a grocery app — ' +
    'mention quality, uses, and pack details. Reply in STRICT JSON with exactly two keys: ' +
    '{"englishName": "...", "description": "..."}. No markdown, no extra text.';

  const user =
    `Product name: ${product}${cat ? `\nCategory: ${cat}` : ''}\n` +
    'Return the JSON now.';

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function parseJson(raw) {
  // Models kabhi-kabhi markdown code fence me wrap kar dete hain — strip karo
  const stripped = String(raw || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  // Pehla { ... last } — aas-paas koi text ho to bhi JSON mil jaye
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Sirf POST requests chalti hain.' });
  }

  let body = {};
  try { body = req.body || {}; } catch { /* ignore */ }
  if (!String(body.name || '').trim()) {
    return res.status(400).json({ error: 'name required' });
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
          messages: buildMessages(body.name, body.category),
          max_tokens: 220,
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(CF_TIMEOUT_MS),
      }
    );

    const json = await cfRes.json().catch(() => null);
    if (!cfRes.ok || !json?.success) {
      const msg = json?.errors?.[0]?.message || json?.errors?.[0] || `HTTP ${cfRes.status}`;
      throw new Error(`Cloudflare ${cfRes.status}: ${String(msg).slice(0, 250)}`);
    }

    const parsed = parseJson(json.result?.response);
    if (!parsed || !String(parsed.englishName || '').trim()) {
      // JSON nahi mila to fallback: raw text hi naam ke tor par (safe)
      const raw = String(json.result?.response || '').trim();
      const firstLine = raw.split('\n')[0].replace(/^[-*•]?\s*/, '').replace(/["']/g, '').slice(0, 60);
      return res.status(200).json({
        englishName: firstLine || clean(body.name, 45),
        description: clean(raw.split('\n').slice(1).join(' '), 300),
        model: CF_MODEL,
        usage: json.result?.usage || null,
        fallback: true,
      });
    }

    return res.status(200).json({
      englishName: clean(parsed.englishName, 60),
      description: clean(parsed.description, 400),
      model: CF_MODEL,
      usage: json.result?.usage || null,
    });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 250) });
  }
}
