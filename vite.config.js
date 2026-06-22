import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BUG FIX (Critical #1): Vite ab VITE_ prefix wale env vars ko
// automatically import.meta.env mein inject karta hai.
// .env file mein rakho:
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=sb_publishable__xxxx
// Vercel Deploy par: Project Settings > Environment Variables mein add karo.

export default defineConfig({
  plugins: [react()],
  // Optional: explicitly define env prefix (default 'VITE' already works)
  envPrefix: 'VITE_',
});
