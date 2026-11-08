// The ShotCaller Supabase project. Both values are public by design: the anon (publishable) key only
// grants what row-level security allows. Secrets (service role key, Steam Web API key, OAuth client
// secrets) live in Supabase, never in the app.
//
// Dev override: set SHOTCALLER_SUPABASE_URL / SHOTCALLER_SUPABASE_ANON_KEY before `npm run dev`.

const PROJECT_URL = '';
const ANON_KEY = '';

export const SUPABASE_URL = (process.env.SHOTCALLER_SUPABASE_URL || PROJECT_URL).replace(/\/+$/, '');
export const SUPABASE_ANON_KEY = process.env.SHOTCALLER_SUPABASE_ANON_KEY || ANON_KEY;

export const cloudConfigured = (): boolean => /^https:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

/** Loopback ports for sign-in redirects. Each must be in Supabase's redirect allow-list. */
export const LOOPBACK_PORTS = [47615, 47616, 47617];
