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

Payments and Support pages keep their real Supabase queries
(`payment_verifications`, `orders`, `ananya_chat_sessions`, `ananya_chat_messages`).
All other pages use the same mock data as the original, exactly as before.

## Run
```
npm install
npm run dev      # dev server
npm run build    # production build -> dist/
```
