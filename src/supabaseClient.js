import { createClient } from '@supabase/supabase-js';
import { auth } from './firebaseAuth.js';

const url = import.meta.env?.VITE_SUPABASE_URL || '';
const key = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

// Firebase remains the identity provider. Supabase receives its verified ID token
// for every Postgres/RLS request; no service-role key is included in the client.
export const supabase = url && key
  ? createClient(url, key, {
    accessToken: async () => auth.currentUser?.getIdToken() || null,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  : null;

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase bağlantısı yapılandırılmamış. Ortam değişkenlerini kontrol edin.');
  return supabase;
}
