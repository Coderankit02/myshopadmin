import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://pffaflasgwhydkmxwkky.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable__tFDYhkM3blZ0pIVT0YxLA_YvkKq79L';

// Single Supabase client instance, reused across the whole React app.
export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
