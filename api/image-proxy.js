/*!
 * /api/image-proxy — CORS-safe image downloader
 * ----------------------------------------------------------------------------
 * Selected image ko save karte waqt browser directly fetch nahi kar sakta
 * (bahut se image hosts CORS headers nahi dete / hotlink protection hoti hai).
 * Ye function image ko server-side fetch karke binary return karta hai, jisse
 * browser ka fetch hamesha same-origin rahta hai.
 *
 * GET /api/image-proxy?url=<encoded absolute image url>
 *   → binary image body (content-type: image/*)
 *   400 → invalid / blocked URL
 *   502 → upstream failure
 *
 * Security: sirf http(s) allowed, private/internal hosts block hain (SSRF guard).
 */

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.local$/i,
  /^::1$/,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\.0\.0\.0$/,
];

const ALLOWED_ORIGINS = [/rinkukiranaadmin\.vercel\.app$/i, /^https?:\/\/localhost(:\d+)?$/i, /^https?:\/\/127\.0\.0\.1(:\d+)?$/i];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Sirf GET requests chalti hain.' });

  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGINS.some((re) => re.test(origin))) {
    return res.status(403).json({ error: 'origin not allowed' });
  }

  const target = String(req.query.url || '').trim();
  if (!target) return res.status(400).json({ error: 'url required' });

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).json({ error: 'invalid url' });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return res.status(400).json({ error: 'sirf http/https allowed' });
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (BLOCKED_HOST_PATTERNS.some((re) => re.test(host))) {
    return res.status(400).json({ error: 'blocked host' });
  }

  try {
    const r = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
        Referer: 'https://rinkukiranaadmin.vercel.app/',
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });

    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) {
      return res.status(502).json({ error: 'upstream ne image nahi di' });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 200) return res.status(502).json({ error: 'empty image body' });

    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('Content-Length', String(buf.length));
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e).slice(0, 160) });
  }
}
