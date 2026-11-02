import { createClient } from '@supabase/supabase-js';
import { config } from './index';

// Service role client — full access, backend only
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Anon client — used to verify user tokens
export const supabaseAnon = createClient(
  config.supabase.url,
  config.supabase.anonKey
);
