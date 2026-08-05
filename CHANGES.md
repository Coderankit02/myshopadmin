# MyShopAdmin — Complete Update Log

## 🖼️ Product Image Manager — Search / Bulk / Upload / AI / Gallery

- **Search:** 7 providers — SerpAPI (Google Images), Openverse (koi key nahi), Pexels, Pixabay,
  Brave, Bing, Google Custom Search — dropdown me se SIRF selected provider call hota hai; results
  responsive grid me (checkbox, hover preview, resolution/source badge, lazy load, infinite scroll +
  Load More, 20/50/100 count, filters: size/type/orientation)
- **No-card providers (added):** Openverse = ZERO key, hamesha enabled (CC images) · Pexels/Pixabay =
  instant FREE key, no credit card (stock photos) · SerpAPI = 100 free searches/mo, no card (asli
  Google Images). Brave/Bing/Google ko card chahiye — key daalne par enabled ho jayenge
- **Bulk:** Products table me checkboxes → "🖼️ Bulk Image Search" → 5-10 products ke liye PARALLEL search
  (concurrency 4), per-product tabs + progress bar + Save All
- **Save:** selected images → `/api/image-proxy` se download → Cloudinary (compress) → Supabase
  `product_images` → customer site realtime update (koi nayi table nahi)
- **Upload:** drag & drop, multiple files, auto-compress
- **Paste URL:** ek ya multiple URLs preview before save
- **AI Generate:** existing Cloudflare flux pipeline per-product (2/4/6 images) — same grid UI
- **Gallery:** drag-drop reorder, ⭐ main image, remove — live save (delete + reinsert)
- **UX:** skeletons, error + retry, lightbox, keyboard (Enter, Ctrl+A), dark mode (CSS vars), responsive
- **Performance:** 10-min search cache, URL dedupe (page merge + already-saved skip)
- **Files:** `api/search-images.js`, `api/image-proxy.js`, `src/lib/imageSearch.js`, `src/lib/saveImages.js`,
  `src/components/ImageSearchPanel.jsx`, `src/components/ProductImageManager.jsx`,
  `src/components/BulkImageManager.jsx`, `src/pagestyles/image-manager.css`, `src/pages/Products.jsx`,
  `src/context/ModalContext.jsx` (xwide modal), `vercel.json`, `.env.example`, `eslint.config.js` (api globals)
- **Setup:** Openverse turant kaam karta hai (koi key nahi). Baaki: Vercel env me key daalo — bina
  key wale dropdown me disabled dikhte hain. SerpAPI 100/mo · Pexels 200/hr · Pixabay free ·
  Brave ~2000/mo (card) · Bing ~1000/mo (card) · Google 100/day (card)
- **Security:** keys sirf server-side; API functions par origin guard (admin domain + localhost)

## ✨ AI Image Generation — Cloudflare Workers AI (flux-1-schnell)

- **Pehle:** Pollinations.ai (Flux) — free, quality kharab
- **Ab:** Cloudflare Workers AI (flux-1-schnell) — FREE tier (~170 images/day), no credit card
- **Files:** `api/generate-image.js` (serverless proxy), `src/components/AiImageGen.jsx`,
  `src/pages/Products.jsx`, `src/pagestyles/products.css`, `vercel.json`, `.env.example`
- **Kaise:** Browser → `/api/generate-image` → Cloudflare → base64 → Cloudinary → Supabase `product_images`
- **Security:** `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` sirf server-side (Vercel env) — browser me nahi
- **Fallback:** "Cloudflare fail ho to Pollinations (Flux) FREE par chalo" checkbox — batch kabhi na ruke
- **Setup:** Cloudflare free account (dash.cloudflare.com) → Account ID + API Token (Workers AI Edit)
  → Vercel Environment Variables me daalo → re-deploy

## Sabhi 15 Features (Fully Working)

### 🔔 Feature 1: Naye order ka browser notification + beep sound
- **File:** `src/lib/orderAlerts.js`, `src/pages/Orders.jsx`
- Orders page pe "🔔 Notification On Karein" button click karo
- Naya order aate hi OS notification + 2-tone beep sound aata hai
- Tab switch hone par bhi pata chalta hai

### 💬 Feature 2: Bulk WhatsApp
- **File:** `src/pages/Orders.jsx`
- Table mein orders select karo (checkbox) → "💬 Bulk WhatsApp" button
- Template choose karo ya custom message likho
- Ek-ek customer ke liye "Send" button — browser tab khulta hai

### ✏️ Feature 3: Order Edit (Items add/remove, amount adjust)
- **File:** `src/components/orders/OrderDetail.jsx`, `src/hooks/useOrders.js`
- Pending ya Confirmed orders mein "✏️ Edit Order" button dikhta hai
- Item ki qty change karo ya delete karo
- Save karte hi subtotal + final amount auto-recalculate hota hai

### 💰 Feature 4: COD Payment Collected Confirmation
- **File:** `src/components/orders/OrderDetail.jsx`, `src/hooks/useOrders.js`
- COD order "Delivered" ya "Out For Delivery" hone par yellow card dikhta hai
- Amount confirm karke "✅ Mark Collected" — payment_status "paid" ho jaata hai

### 🔁 Feature 5: Order Return (Partial ya Full)
- **File:** `src/components/orders/OrderDetail.jsx`, `src/hooks/useOrders.js`
- Delivered order mein "↩️ Initiate Return" option
- Reason, type (full/partial), refund amount note karo
- Order "returned" status mein chala jaata hai

### 📦 Feature 6: Bulk Status Update
- **File:** `src/pages/Orders.jsx`, `src/hooks/useOrders.js`
- Checkboxes se multiple orders select karo
- Bulk action bar mein status buttons — 20 orders ek saath confirm/pack/deliver

### 🗓️ Feature 7: Delivery Slot / Schedule
- **File:** `src/components/orders/OrderDetail.jsx`
- Status update karte waqt slot select karo: Morning 9–12 / Afternoon 12–4 / Evening 4–8
- Order detail mein slot dikh jaata hai

### 🗺️ Feature 8: Pincode / Area Filter
- **File:** `src/pages/Orders.jsx`, `src/hooks/useOrders.js`
- Filter bar mein "🗺️ Pincode / Area" input — us pincode ke sirf orders dikhenge
- Delivery boy ke liye area-wise planning easy

### 💬 Feature 9: Internal Admin Notes
- **File:** `src/components/orders/OrderDetail.jsx`, `src/hooks/useOrders.js`
- "🔒 Internal Notes (Admin Only)" section — customer/invoice pe nahi dikhta
- "Is customer ko kal call karo" jaisi notes save karo

### 🔍 Feature 10: Address → Google Maps Link
- **File:** `src/components/orders/OrderDetail.jsx`, `src/lib/utils.js`
- Customer address ke saath "🗺️ Open in Maps" link
- Quick Actions mein bhi maps button

### 📊 Feature 11: CSV Export (Items + All Pages)
- **File:** `src/hooks/useOrders.js`
- "⬇ Export" — sirf current page nahi, sabhi filtered orders export hote hain
- Har order ke items bhi CSV mein aate hain (accountant ke liye)

### ⏱️ Feature 12: Order Age Badge
- **File:** `src/pages/Orders.jsx`, `src/lib/utils.js`
- Table mein date ke neeche "2 ghante pehle" / "30 min pehle" dikhta hai
- 1 ghante se zyada pending hone par red highlight

### 🖨️ Feature 13: Thermal Packing Slip
- **File:** `src/components/orders/PackingSlip.jsx`
- "📃 Packing Slip" button — 58/80mm thermal printer ke liye compact slip
- Items list + address + amount — print ready

### 🔗 Feature 14: Customer Order History
- **File:** `src/pages/Orders.jsx`, `src/components/orders/OrderDetail.jsx`
- Order detail mein "📜 Is customer ke saare orders dekho" link
- Click karne par Orders list us phone number ke liye filter ho jaati hai

### 🎯 Feature 15: Cancellation Reason Track
- **File:** `src/components/orders/OrderDetail.jsx`, `src/hooks/useOrders.js`
- Cancel karte waqt reason choose karna zaroori hai
- Reasons: Out of stock, Customer ne mana kiya, Address nahi mila, etc.
- Order detail mein reason dikh jaata hai

---

## Bug Fixes

1. **Status update ke baad stale list** — Back karne par ab turant sahi status dikhta hai (optimistic patch)
2. **Stats queries whole-table download** — Ab sirf COUNT query + capped SELECT
3. **Realtime subscription stack** — Sirf ek channel, refs se latest callbacks
4. **Double API call on filter change** — React 18 batch mein page reset
5. **WhatsApp +91 double** — waLink() helper sahi handle karta hai
6. **Invoice divide-by-zero (qty=0)** — Safe calculation added
7. **CSV sirf current page** — Ab sabhi pages + items
8. **Dead code (nextStatusOptions)** — Hata diya
9. **validTransitions prop ignored** — Ab OrderDetail actually use karta hai
10. **Invoice items empty** — OrderInvoice + PackingSlip khud fetch karte hain fallback pe

## Profile Picture

- **Navbar** — Admin ka avatar Navbar mein dikhta hai (gol photo)
- **Settings** — Settings > My Profile mein photo upload + naam change
- **Supabase setup:** Storage → New bucket → name `avatars` → Public: ON

## Order Detail — Customer Photo
- Agar storefront `profiles` table mein `avatar_url` hai, toh customer ki pic dikhti hai
- Guest orders ya purane orders gracefully fallback karte hain

