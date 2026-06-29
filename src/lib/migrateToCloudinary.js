/**
 * ── Supabase → Cloudinary Image Migration Script ──────────────────────────
 *
 * Kya karta hai:
 *   1. Supabase DB se saari image URLs nikalta hai (sirf %supabase% wali)
 *   2. Cloudinary par upload karta hai
 *   3. Supabase DB mein nayi Cloudinary URL update karta hai
 *
 * NOTE: Avatar migration auth.users metadata update karta hai (profiles nahi)
 */

import { db } from './supabase';

const CLOUD_NAME    = 'delf8iyzt';
const UPLOAD_PRESET = 'myshop_preset';

// Ek image URL Cloudinary par upload karo
async function uploadUrlToCloudinary(imageUrl, folder) {
  const formData = new FormData();
  formData.append('file', imageUrl);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', folder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );
  const data = await res.json();
  if (data.secure_url) return data.secure_url;
  throw new Error(data.error?.message || 'Upload fail');
}

// ── Product Images Migrate ─────────────────────────────────────────────────
async function migrateProductImages() {
  console.log('📦 Product images migrate ho rahi hain...');

  const { data: rows, error } = await db
    .from('product_images')
    .select('id, image_url')
    .like('image_url', '%supabase%');   // Sirf Supabase URLs

  if (error) { console.error('Fetch error:', error.message); return; }
  console.log(`  ${rows.length} product images milein`);

  let done = 0, failed = 0;
  for (const row of rows) {
    try {
      const newUrl = await uploadUrlToCloudinary(row.image_url, 'myshop/products');
      await db.from('product_images').update({ image_url: newUrl }).eq('id', row.id);
      done++;
      console.log(`  ✅ (${done}/${rows.length}) Updated`);
    } catch (err) {
      failed++;
      console.error(`  ❌ Failed: ${row.image_url} — ${err.message}`);
    }
  }
  console.log(`Product images: ${done} done, ${failed} failed`);
}

// ── Category Images Migrate ────────────────────────────────────────────────
async function migrateCategoryImages() {
  console.log('🗂️ Category images migrate ho rahi hain...');

  const { data: rows, error } = await db
    .from('category_images')
    .select('id, image_url')
    .like('image_url', '%supabase%');

  if (error) { console.error('Fetch error:', error.message); return; }
  console.log(`  ${rows.length} category images milein`);

  let done = 0, failed = 0;
  for (const row of rows) {
    try {
      const newUrl = await uploadUrlToCloudinary(row.image_url, 'myshop/categories');
      await db.from('category_images').update({ image_url: newUrl }).eq('id', row.id);

      // categories table ka legacy image_url bhi update karo
      await db.from('categories').update({ image_url: newUrl })
        .eq('image_url', row.image_url);

      done++;
      console.log(`  ✅ (${done}/${rows.length}) Updated`);
    } catch (err) {
      failed++;
      console.error(`  ❌ Failed: ${row.image_url} — ${err.message}`);
    }
  }
  console.log(`Category images: ${done} done, ${failed} failed`);
}

// ── Payment Screenshots Migrate ────────────────────────────────────────────
async function migratePaymentScreenshots() {
  console.log('💳 Payment screenshots migrate ho rahi hain...');

  const { data: rows, error } = await db
    .from('payment_verifications')
    .select('id, screenshot_url')
    .like('screenshot_url', '%supabase%');  // Sirf Supabase URLs

  if (error) { console.error('Fetch error:', error.message); return; }
  console.log(`  ${rows.length} screenshots milein`);

  let done = 0, failed = 0;
  for (const row of rows) {
    try {
      const newUrl = await uploadUrlToCloudinary(row.screenshot_url, 'myshop/payment-screenshots');
      await db.from('payment_verifications').update({ screenshot_url: newUrl }).eq('id', row.id);
      done++;
      console.log(`  ✅ (${done}/${rows.length}) Updated`);
    } catch (err) {
      failed++;
      console.error(`  ❌ Failed: ${row.screenshot_url} — ${err.message}`);
    }
  }
  console.log(`Payment screenshots: ${done} done, ${failed} failed`);
}

// ── Avatar Images Migrate ──────────────────────────────────────────────────
// NOTE: Admin avatars auth.users metadata mein hain (profiles table mein nahi)
// Isliye ye migration profiles.avatar_url wali Supabase URLs fix karta hai
// jo customer side par use hoti hain. Admin avatar auth.updateUser se update hota hai.
async function migrateAvatarImages() {
  console.log('👤 Avatar images (profiles table) migrate ho rahi hain...');

  const { data: rows, error } = await db
    .from('profiles')
    .select('id, avatar_url')
    .like('avatar_url', '%supabase%');  // Sirf jo abhi Supabase par hain

  if (error) { console.error('Fetch error:', error.message); return; }
  console.log(`  ${rows.length} avatars milein`);

  if (rows.length === 0) {
    console.log('  Koi avatar migrate karna nahi — sab already Cloudinary par hain');
    return;
  }

  let done = 0, failed = 0;
  for (const row of rows) {
    try {
      const newUrl = await uploadUrlToCloudinary(row.avatar_url, `myshop/avatars/${row.id}`);
      await db.from('profiles').update({ avatar_url: newUrl }).eq('id', row.id);
      done++;
      console.log(`  ✅ (${done}/${rows.length}) Updated`);
    } catch (err) {
      failed++;
      console.error(`  ❌ Failed — ${err.message}`);
    }
  }
  console.log(`Avatars: ${done} done, ${failed} failed`);
}

// ── Main Function ──────────────────────────────────────────────────────────
export async function migrateAllImages() {
  console.log('🚀 Migration shuru ho rahi hai...');
  console.log('⚠️  Ye thoda time le sakta hai — console band mat karna\n');

  await migrateProductImages();
  console.log('');
  await migrateCategoryImages();
  console.log('');
  await migratePaymentScreenshots();
  console.log('');
  await migrateAvatarImages();

  console.log('\n✅ Migration complete! Ab Supabase Storage buckets delete kar sakte ho.');
}