import { createClient } from '@supabase/supabase-js';

// ── BUG FIX (Critical): Keys ab hardcoded nahi hain.
// Deployment se pehle .env file banayein (example: .env.example dekho):
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=sb_publishable__xxxx
// Vite build time pe ye values inject ho jaati hain — browser mein readable
// hoti hain (anon key public hoti hai), lekin git history mein safe rehti hain.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '[supabase.js] VITE_SUPABASE_URL aur VITE_SUPABASE_ANON_KEY set nahi hain.\n' +
    'Project root mein .env file banayein (example ke liye .env.example dekho).'
  );
}

// Single Supabase client instance, reused across the whole React app.
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
