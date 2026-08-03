import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { uploadToCloudinary } from '../lib/cloudinary';

/*!
 * AiImageGen — Bulk FREE AI Product Image Generator (admin panel)
 * -----------------------------------------------------------------
 * 1. Har product (jiske paas image nahi hai) ke liye Pollinations.ai
 *    (Flux model) se SQUARE image generate karta hai — BILKUL FREE,
 *    koi API key nahi chahiye.
 * 2. Cloudinary par UNSIGNED upload preset (`myshop_preset`) se upload
 *    karta hai — isliye Cloudinary API key/secret ki bhi zaroorat nahi.
 * 3. Supabase `product_images` table me insert karta hai — site par
 *    image turant dikhti hai.
 *
 * NOTE: Pollinations anonymous ~1 request / 15s per IP — isliye default
 * delay 15s, sequential processing. Full 152 products ~40 min (FREE).
 */

const POLL_URL = 'https://image.pollinations.ai/prompt/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildPrompt(p, categoryName) {
  const cat = categoryName ? `, ${categoryName}` : '';
  const unit = p.unit_value ? ` (${p.unit_value})` : '';
  return (
    `Professional e-commerce product photograph of ${p.name}${unit}${cat}. ` +
    `Clean light-grey studio background, soft even lighting, sharp focus, realistic, ` +
    `square 1:1 composition, product centered in frame, no text, no watermark, no brand logo, no hands.`
  );
}

async function fetchAiImageBlob(prompt) {
  const params = new URLSearchParams({
    model: 'flux',
    width: '1024',
    height: '1024',
    nologo: 'true',
    seed: String(Math.floor(Math.random() * 1000000)),
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
  { label: '10s (risk: rate-limit)', value: 10000 },
  { label: '15s (safe, recommended)', value: 15000 },
  { label: '20s (super safe)', value: 20000 },
];

export default function AiImageGen({ products, categories, onDone }) {
  const catMap = useMemo(() => new Map((categories || []).map((c) => [c.id, c.name])), [categories]);
  const todo = products || [];

  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [current, setCurrent] = useState(-1);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [delayMs, setDelayMs] = useState(15000);
  const [log, setLog] = useState([]);
  const stopRef = useRef(false);
  const doneIdsRef = useRef(new Set());

  // CRITICAL: Modal ✕ band karne par bhi background loop turant rukna chahiye
  // — warna uploads silently chalte rahenge (duplicate images ban sakti hain).
  useEffect(() => () => { stopRef.current = true; }, []);

  function pushLog(type, text) {
    setLog((l) => [...l.slice(-199), { type, text }]);
  }

  async function run() {
    setRunning(true);
    setStarted(true);
    setFinished(false);
    setDone(0);
    setFailed(0);
    setLog([]);
    stopRef.current = false;

    let ok = 0;
    let fail = 0;
    for (let i = 0; i < todo.length; i++) {
      if (stopRef.current) break;
      const p = todo[i];
      // Resume par pehle se done products skip karo — duplicate images na banein
      if (doneIdsRef.current.has(p.id)) continue;
      setCurrent(i);
      const label = `${p.name}${p.unit_value ? ` (${p.unit_value})` : ''}`;
      pushLog('info', `[${i + 1}/${todo.length}] ${label} — generate…`);
      try {
        const blob = await fetchAiImageBlob(buildPrompt(p, catMap.get(p.category_id)));
        const file = new File([blob], `${p.name}.jpg`, { type: blob.type || 'image/jpeg' });
        const { url, error } = await uploadToCloudinary(file, 'products');
        if (!url) throw new Error(error || 'Cloudinary upload fail');

        // Sort_order = existing count, is_default sirf pehli image ke liye
        const existing = await db.from('product_images').select('id').eq('product_id', p.id);
        const count = existing.data?.length || 0;
        const { error: insErr } = await db.from('product_images').insert({
          product_id: p.id,
          image_url: url,
          is_default: count === 0,
          sort_order: count,
        });
        if (insErr) throw new Error(insErr.message);

        doneIdsRef.current.add(p.id);
        ok++;
        pushLog('ok', `✅ ${label} — done`);
      } catch (e) {
        fail++;
        pushLog('err', `❌ ${label} — ${String(e.message || e).slice(0, 100)}`);
      }
      setDone(ok);
      setFailed(fail);

      if (i < todo.length - 1 && !stopRef.current && delayMs > 0) {
        await sleep(delayMs);
      }
    }
    setCurrent(-1);
    setRunning(false);
    setFinished(true);
    if (onDone) onDone();
  }

  function stop() {
    stopRef.current = true;
  }

  const total = todo.length;
  const processed = done + failed;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  return (
    <div className="aigen">
      {total === 0 ? (
        <p style={{ color: 'var(--gray)', fontSize: '0.86rem' }}>
          🎉 Saare products ke paas pehle se images hain — kuch generate karne ko nahi.
        </p>
      ) : (
        <>
          <div className="aigen-hero">
            <div className="aigen-hero-icon">✨</div>
            <div>
              <div className="aigen-hero-title">
                {total} products ke liye FREE AI images
              </div>
              <div className="aigen-hero-sub">
                Pollinations (Flux) — ₹0 · koi API key nahi · square 1:1
              </div>
            </div>
          </div>

          {!started && (
            <div className="aigen-setup">
              <label className="aigen-label">Requests ke beech gap (rate-limit ke liye):</label>
              <div className="aigen-delay-row">
                {DELAY_OPTIONS.map((o) => (
                  <label key={o.value} className={`aigen-delay-opt${delayMs === o.value ? ' on' : ''}`}>
                    <input
                      type="radio"
                      name="aigen-delay"
                      value={o.value}
                      checked={delayMs === o.value}
                      onChange={() => setDelayMs(o.value)}
                      disabled={running}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              <p className="aigen-warn">
                ⏱️ 15s gap = ~40 min total (sab FREE). Tab band mat karna — progress yahin dikhega.
              </p>
            </div>
          )}

          {started && (
            <div className="aigen-progress">
              <div className="aigen-progress-bar-wrap">
                <div className="aigen-progress-bar" style={{ width: `${pct}%` }} />
              </div>
              <div className="aigen-progress-info">
                <span>{processed}/{total} processed</span>
                <span>{pct}%</span>
              </div>
              <div className="aigen-stats">
                <span className="aigen-stat ok">✅ {done}</span>
                <span className="aigen-stat err">❌ {failed}</span>
                <span className="aigen-stat info">
                  {running
                    ? (current >= 0 ? `▶ ${todo[current]?.name || '…'}` : 'finishing…')
                    : finished
                      ? '✔️ complete'
                      : 'stopped'}
                </span>
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
              <button className="btn-main" onClick={run} disabled={started && finished && failed === 0}>
                {started ? '▶ Resume (baaki retry)' : '▶ Generate (FREE)'}
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
