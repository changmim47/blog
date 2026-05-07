import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Create a .env.local file with VITE_SUPABASE_URL and VITE_SUPABASE_KEY. ' +
    'See .env.example for the required format.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export const checkConnection = async () => {
  try {
    const { error } = await supabase.from('posts').select('id').limit(1);
    return !error;
  } catch (e) {
    return false;
  }
};
