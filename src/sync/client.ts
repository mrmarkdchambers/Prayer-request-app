import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** Which backend settings this build is missing; shown in Settings to help with setup. */
export const missingBackendSettings: string[] =
  url || key ? [!url && 'VITE_SUPABASE_URL', !key && 'VITE_SUPABASE_ANON_KEY'].filter((x): x is string => !!x) : [];

/** Null when no backend is configured; the app then runs fully on this device. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        // PKCE puts the sign-in code in the query string, which works with the app's #/ routes.
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
