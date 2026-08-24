import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ' +
    '(or NEXT_PUBLIC_SUPABASE_ANON_KEY).'
  );
}

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);

export const checkConnection = async () => {
  try {
    const { error } = await supabase.from('posts').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
};
