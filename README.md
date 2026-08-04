# myshopadmin (React SPA)

Vite + React conversion of the original multi-page vanilla-JS admin (`myshopadmin-main`)
into a single-page app with client-side routing (react-router-dom). Same Supabase
backend/credentials as the original (`shared/supabase.js`).

## Structure
- `src/lib/` — supabase client, auth helpers, utils (ported 1:1 from `shared/`)
- `src/context/` — AuthContext, ToastContext, ModalContext (replace global window.Auth/Toast/Modal)
- `src/components/` — Sidebar, Navbar, AppLayout, ProtectedRoute
- `src/pages/` — one component per original page (Dashboard, Orders, Products, Categories,
  Customers, Inventory, Payments, Delivery, Support, Ai, Analytics, Settings, Login)
- `src/pagestyles/` — each page's original CSS, imported only by its page component
- `src/global.css` — ported `shared/base.css` + modal/toast styles
- `api/generate-image.js` — Vercel serverless proxy: Cloudflare Workers AI
  (flux-1-schnell) se product images generate karta hai. `CLOUDFLARE_ACCOUNT_ID` /
  `CLOUDFLARE_API_TOKEN` Vercel env me set karo (server-side only, browser me nahi jati).

## AI Image Generation (✨ AI Generate)

Products page ka "✨ AI Generate" ab **Cloudflare Workers AI (flux-1-schnell)** use karta hai —
**completely FREE tier** (~170 images/day, no credit card).

- Browser → `/api/generate-image` (serverless proxy) → Cloudflare → base64 image
- Phir Cloudinary par upload → Supabase `product_images` me insert
- Agar Cloudflare fail ho (quota, etc.) to ek checkbox se **Pollinations (Flux) FREE**
  fallback on/off kar sakte ho — batch kabhi na ruke.

### Setup (ek baar)
```
# 1. Cloudflare free account banao:  https://dash.cloudflare.com/sign-up  (no credit card)
# 2. Account ID: Cloudflare dashboard me right sidebar
# 3. API Token: My Profile → API Tokens → Create Token → Custom token
#    → Account → Workers AI → Edit
# 4. Vercel Dashboard → Project (myshopadmin) → Settings → Environment Variables:
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
# 5. Re-deploy. Bas! Ab ✨ AI Generate Cloudflare se chalega (~170 images/day FREE).
```

Payments and Support pages keep their real Supabase queries
(`payment_verifications`, `orders`, `ananya_chat_sessions`, `ananya_chat_messages`).
All other pages use the same mock data as the original, exactly as before.

## Run
```
npm install
npm run dev      # dev server
npm run build    # production build -> dist/
```
