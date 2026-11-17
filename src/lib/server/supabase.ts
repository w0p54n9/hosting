import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Server-only Supabase client using the service role key (bypasses RLS). */
export function db(): SupabaseClient {
  if (!client) {
    // Accept the project URL with or without a trailing /rest/v1/ (an easy copy-paste slip).
    const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}
