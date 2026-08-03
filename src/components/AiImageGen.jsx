import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';

/*!
 * AiImageGen — Bulk FREE AI Product Image Generator (admin panel)
 * -----------------------------------------------------------------
 * Har product ke liye UP TO 5 alag images generate karta hai (alag
 * backgrounds/styles + alag seeds) — taaki user best wali default
 * choose kar sake (edit form me ⭐ button se).
 *
 * - Source: Pollinations.ai (Flux) — BILKUL FREE, koi API key nahi.
 * - Upload: Cloudinary UNSIGNED preset (`myshop_preset`) — koi keys nahi.
 * - Insert: Supabase `product_images` (sort_order 0..4, pehli is_default).
 *
 * RATE LIMIT: Pollinations anonymous ~1 img / 15-45s per IP. Isliye:
 * - delay option (default 15s) + per-run product limit + resume support.
 * - 5 images × 145 products ≈ 9 ghante — batches me chalane ke liye
 *   "products per run" limit diya hai (estimate bhi dikhta hai).
 */

const POLL_URL = 'https://image.pollinations.ai/prompt/';
const MAX_PER_PRODUCT = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 5 alag images — quality consistent rakho (SINGLE-subject, no scene styles).
// TESTED: flux model + strict "one single X, isolated, no other items" prompt
// = ~2/3 clean single-product images (best free option). `enhance` param kabhi
// mat use karo — wo prompt ko LLM se rewrite karke kuch aur bana deta hai.
// Variety sirf halki background variation + random seed se aati hai.
const STYLES = [
  'plain seamless light grey studio background',
  'plain seamless white studio background',
  'plain seamless very light beige background',
  'plain seamless white studio background with soft shadow',
  'plain seamless light cool grey background',
];

function buildPrompt(p, categoryName, styleIdx) {
  const cat = categoryName ? `, ${categoryName}` : '';
  const unit = p.unit_value ? ` (${p.unit_value})` : '';
  return (
    `one single ${p.name}${unit}${cat} only, single subject, no other objects, no leaves, ` +
    `no basket, no bowl, ${STYLES[styleIdx % STYLES.length]}, studio product photo, isolated, ` +
    `centered, photorealistic, high quality, no text, no watermark, no hands`
  );
}

async function fetchAiImageBlob(prompt) {
  const params = new URLSearchParams({
    model: 'flux',
    width: '1024',
    height: '1024',
    nologo: 'true',
    seed: String(Math.floor(Math.random() * 1000000)), // random → har baar alag
  });
  const res = await fetch(`${POLL_URL}${encodeURIComponent(prompt)}?${params}`);
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 120);
    throw new Error(`Pollinations ${res.status} ${txt}`);
  }
  const ct = res.headers.get('content-type') || '';
  const blob = await res.blob();
  if (!ct.includes('image') || blob.size < 1000) {
    throw new Error(`Image nahi mili (${ct}, ${blob.size}b)`);
  }
  return blob;
}

const DELAY_OPTIONS = [
  { label: '5s (fast, risky)', value: 5000 },
  { label: '10s (normal)', value: 10000 },
  { label: '15s (safe)', value: 15000 },
];

const EST_SECONDS_PER_IMG = 45; // Pollinations anonymous queue ka observed average

export default function AiImageGen({ products, categories, onDone }) {
  // products: [{ id, name, unit_value, category_id, imgCount }]
  const catMap = useMemo(() => new Map((categories || []).map((c) => [c.id, c.name])), [categories]);

  // Sirf wo products jo target se kam images rakhte hain
  const todo = useMemo(
    () => (products || []).filter((p) => (p.imgCount || 0) < MAX_PER_PRODUCT),
    [products]
  );

  const [imgPerProduct, setImgPerProduct] = useState(5);
  const [productLimit, setProductLimit] = useState(5); // per-run limit (batches)
  const [delayMs, setDelayMs] = useState(10000);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [imgDone, setImgDone] = useState(0);
  const [imgFailed, setImgFailed] = useState(0);
  const [log, setLog] = useState([]);
  const [recentThumbs, setRecentThumbs] = useState([]); // last ~12 generated images
  const stopRef = useRef(false);
  const doneIdsRef = useRef(new Set());

  // Modal ✕ band karne par background loop ruk jaye
  useEffect(() => () => { stopRef.current = true; }, []);

  // Per product kitni images chahiye (limit bhi apply hoti hai)
  const batch = useMemo(() => {
    const limited = productLimit > 0 ? todo.slice(0, productLimit) : todo;
    return limited.map((p) => ({
      ...p,
      needed: Math.max(0, imgPerProduct - (p.imgCount || 0)),
    })).filter((p) => p.needed > 0);
  }, [todo, productLimit, imgPerProduct]);

  const totalImages = useMemo(() => batch.reduce((s, p) => s + p.needed, 0), [batch]);
  const estMinutes = Math.round((totalImages * EST_SECONDS_PER_IMG) / 60);

  function pushLog(type, text) {
    setLog((l) => [...l.slice(-199), { type, text }]);
  }

  async function run() {
    setRunning(true);
    setStarted(true);
    setFinished(false);
    setImgDone(0);
    setImgFailed(0);
    setLog([]);
    setRecentThumbs([]);
    stopRef.current = false;

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < batch.length; i++) {
      if (stopRef.current) break;
      const p = batch[i];
      if (doneIdsRef.current.has(p.id)) continue;
      setCurrent(i);

      const label = `${p.name}${p.unit_value ? ` (${p.unit_value})` : ''}`;

      // CRITICAL: Resume/re-run par LIVE DB count lo — stale snapshot se
      // nahi. Warna adhure product par dobara se full count generate hoke
      // >5 images ban jayengi (duplicate sort_order + admin max exceed).
      const { data: existing } = await db.from('product_images').select('id').eq('product_id', p.id);
      let count = existing?.length || 0;
      const needed = Math.min(imgPerProduct - count, imgPerProduct);
      if (needed <= 0) {
        doneIdsRef.current.add(p.id);
        continue;
      }

      pushLog('info', `[${i + 1}/${batch.length}] ${label} — ${needed} images generate…`);

      let productOk = 0;
      let productFail = 0;
      for (let k = 0; k < needed; k++) {
        if (stopRef.current) break;
        try {
          const styleIdx = count + k;
          const blob = await fetchAiImageBlob(buildPrompt(p, catMap.get(p.category_id), styleIdx));
          const file = new File([blob], `${p.name}-${styleIdx + 1}.jpg`, { type: blob.type || 'image/jpeg' });
          const { url, error } = await uploadToCloudinary(file, 'products');
          if (!url) throw new Error(error || 'Cloudinary upload fail');

          const { error: insErr } = await db.from('product_images').insert({
            product_id: p.id,
            image_url: url,
            is_default: styleIdx === 0, // pehli wali default; user baad me ⭐ se badal sakta hai
            sort_order: styleIdx,
          });
          if (insErr) throw new Error(insErr.message);

          productOk++;
          ok++;
          setRecentThumbs((t) => [...t.slice(-11), { name: p.name, url }]);
          pushLog('ok', `  ✅ ${label} — img ${styleIdx + 1} (style ${(styleIdx % STYLES.length) + 1})`);
        } catch (e) {
          productFail++;
          fail++;
          pushLog('err', `  ❌ ${label} — ${String(e.message || e).slice(0, 90)}`);
        }
        setImgDone(ok);
        setImgFailed(fail);

        if (!stopRef.current && delayMs > 0) await sleep(delayMs);
      }

      if (productOk >= needed) doneIdsRef.current.add(p.id);
    }
    setCurrent(-1);
    setRunning(false);
    setFinished(true);
    if (onDone) onDone();
  }

  function stop() {
    stopRef.current = true;
  }

  const totalProducts = batch.length;
  const processedProducts = doneIdsRef.current.size;
  const pct = totalImages > 0 ? Math.round((imgDone / totalImages) * 100) : 0;

  return (
    <div className="aigen">
      {totalProducts === 0 ? (
        <p style={{ color: 'var(--gray)', fontSize: '0.86rem' }}>
          🎉 Saare products ke paas pehle se {MAX_PER_PRODUCT} images hain — kuch generate karne ko nahi.
        </p>
      ) : (
        <>
          <div className="aigen-hero">
            <div className="aigen-hero-icon">✨</div>
            <div>
              <div className="aigen-hero-title">
                {totalProducts} products × up to {imgPerProduct} images — FREE
              </div>
              <div className="aigen-hero-sub">
                Pollinations (Flux) · ₹0 · har image alag style me · ⭐ best default choose karo
              </div>
            </div>
          </div>

          {!started && (
            <div className="aigen-setup">
              <div className="aigen-setup-grid">
                <div>
                  <label className="aigen-label">Har product me kitni images?</label>
                  <div className="aigen-delay-row">
                    {[1, 3, 5].map((n) => (
                      <label key={n} className={`aigen-delay-opt${imgPerProduct === n ? ' on' : ''}`}>
                        <input
                          type="radio" name="aigen-count" value={n}
                          checked={imgPerProduct === n} onChange={() => setImgPerProduct(n)}
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="aigen-label" htmlFor="aigen-limit">
                    Is run me kitne products? (batches me chalao — tab band mat karna)
                  </label>
                  <input
                    id="aigen-limit" type="number" min={1} max={totalProducts}
                    value={productLimit}
                    onChange={(e) => setProductLimit(Math.max(1, Math.min(totalProducts, Number(e.target.value) || 1)))}
                    className="aigen-num"
                  />
                </div>
                <div>
                  <label className="aigen-label">Requests ke beech gap:</label>
                  <div className="aigen-delay-row">
                    {DELAY_OPTIONS.map((o) => (
                      <label key={o.value} className={`aigen-delay-opt${delayMs === o.value ? ' on' : ''}`}>
                        <input
                          type="radio" name="aigen-delay" value={o.value}
                          checked={delayMs === o.value} onChange={() => setDelayMs(o.value)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <p className="aigen-warn">
                ⏱️ {totalImages} images ≈ <b>~{estMinutes} min</b> (Pollinations free queue ~45s/img).
                Tab/chrome band mat karna — rukne par jo bane wo save rehte hain, dobara chalao to wahi se continue hota hai.
              </p>
            </div>
          )}

          {started && (
            <div className="aigen-progress">
              <div className="aigen-progress-bar-wrap">
                <div className="aigen-progress-bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="aigen-progress-info">
                <span>{imgDone}/{totalImages} images</span>
                <span>{pct}%</span>
              </div>
              <div className="aigen-stats">
                <span className="aigen-stat ok">✅ {imgDone}</span>
                <span className="aigen-stat err">❌ {imgFailed}</span>
                <span className="aigen-stat info">
                  {running
                    ? (current >= 0 ? `▶ ${batch[current]?.name || '…'}` : 'waiting…')
                    : finished ? '✔️ complete' : 'stopped'}
                </span>
              </div>
            </div>
          )}

          {recentThumbs.length > 0 && (
            <div className="aigen-thumbs">
              <div className="aigen-label">Abhi generate hui images:</div>
              <div className="aigen-thumb-grid">
                {recentThumbs.map((t, i) => (
                  <div key={i} className="aigen-thumb" title={t.name}>
                    <img src={t.url} alt={t.name} loading="lazy" />
                    <span>{t.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {log.length > 0 && (
            <div className="aigen-log" role="log" aria-live="polite">
              {log.map((l, i) => (
                <div key={i} className={`aigen-log-item ${l.type}`}>{l.text}</div>
              ))}
            </div>
          )}

          <div className="modal-actions">
            {!running ? (
              <button className="btn-main" onClick={run} disabled={started && finished && imgFailed === 0 && processedProducts >= totalProducts}>
                {started ? '▶ Resume (baaki retry)' : `▶ Generate (${totalImages} FREE images)`}
              </button>
            ) : (
              <button className="btn-ghost" onClick={stop} style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                ⏹ Stop
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
