// ── Save selected images to a product ──────────────────────────────────────
// Flow: image-proxy se download (CORS-safe) → Cloudinary upload (compress ke
// saath, existing helper) → product_images me insert → site realtime se update.
//
// Duplicate prevention: already-saved URLs + batch ke andar ke duplicates skip
// hote hain. is_default sirf tab true jab product ke paas pehle koi image na ho.

import { db } from './supabase';
import { uploadToCloudinary } from './cloudinary';

async function fetchBlobViaProxy(url) {
  const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `Download fail (${res.status})`);
  }
  return res.blob();
}

/**
 * Download → Cloudinary → Supabase insert. Sequential (rate-limit friendly).
 * @param {object} opts
 * @param {string} opts.productId
 * @param {Array<{url:string,width?:number,height?:number,title?:string}>} opts.items
 * @param {string[]} [opts.existingUrls]  — pehle se saved image URLs (skip)
 * @param {(p:{done:number,total:number})=>void} [opts.onProgress]
 * @returns {Promise<{saved:string[], failed:Array<{url:string,error:string}>, skipped:number}>}
 */
export async function saveProductImages({ productId, items, existingUrls = [], onProgress }) {
  const skipped = [];
  const seen = new Set(existingUrls);
  const unique = [];
  for (const it of items || []) {
    const u = it.url;
    if (!u) continue;
    if (seen.has(u)) { skipped.push(u); continue; }
    seen.add(u);
    unique.push(it);
  }

  const saved = [];
  const failed = [];
  const total = unique.length;

  for (let i = 0; i < unique.length; i++) {
    const it = unique[i];
    try {
      const blob = await fetchBlobViaProxy(it.url);
      const ext = blob.type === 'image/png' ? 'png' : 'jpg';
      const file = new File([blob], `product-${Date.now()}-${i}.${ext}`, { type: blob.type || 'image/jpeg' });
      const { url, error } = await uploadToCloudinary(file, 'products');
      if (!url) throw new Error(error || 'Cloudinary upload fail');
      saved.push({ url, width: it.width, height: it.height, title: it.title });
    } catch (e) {
      failed.push({ url: it.url, error: String(e.message || e).slice(0, 120) });
    }
    if (onProgress) onProgress({ done: i + 1, total });
  }

  if (saved.length > 0) {
    // Live count lo (stale snapshot se duplicate sort_order na banein)
    const { data: existingRows } = await db
      .from('product_images')
      .select('sort_order')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });
    const start = existingRows?.length || 0;

    const rows = saved.map((s, idx) => ({
      product_id: productId,
      image_url: s.url,
      is_default: start === 0 && idx === 0, // product ki pehli image = default
      sort_order: start + idx,
    }));

    const { error } = await db.from('product_images').insert(rows);
    if (error) {
      failed.push(...rows.map((r) => ({ url: r.image_url, error: error.message })));
      return { saved: [], failed, skipped };
    }
  }

  return { saved: saved.map((s) => s.url), failed, skipped };
}

/**
 * Gallery order/main update — delete + reinsert (existing codebase pattern).
 * @param {string} productId
 * @param {Array<{url:string,isDefault:boolean}>} orderedImages
 */
export async function replaceProductImages(productId, orderedImages) {
  if (!productId) return { error: 'productId required' };
  await db.from('product_images').delete().eq('product_id', productId);
  if (!orderedImages.length) return { error: null };
  const rows = orderedImages.map((img, idx) => ({
    product_id: productId,
    image_url: img.url,
    is_default: img.isDefault || false,
    sort_order: idx,
  }));
  const { error } = await db.from('product_images').insert(rows);
  return { error };
}
