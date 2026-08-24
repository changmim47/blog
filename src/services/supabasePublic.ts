import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from './supabaseEnv';

export function createPublicSupabaseClient() {
  const { url, key } = getSupabaseEnv();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
