# ShotCaller cloud (Supabase)

Accounts, profiles and (later) achievements live in one Supabase project.

| Path | What it is |
| --- | --- |
| `migrations/` | Postgres schema with row-level security on every table |
| `functions/steam-auth/` | Steam sign-in (OpenID 2.0) and Steam account linking |
| `functions/steam-api/` | Steam Web API proxy: signed-in users only, allow-listed methods; the key stays here |
| `config.toml` | Local-dev config (redirect URLs, JWT settings per function) |

## How sign-in works

The app never handles provider passwords or tokens in the renderer. The main process opens the system
browser and catches the redirect on a loopback port (`127.0.0.1:47615`, or `47616` / `47617` if that
one is busy):

- **Discord / Google:** Supabase OAuth with PKCE → `/auth/callback?code=…` → `exchangeCodeForSession`.
- **Steam:** `steam-auth/start` → Steam's login page → `steam-auth/callback` checks the signed assertion
  with Steam, finds or creates the user, then sends the app a one-time token hash → `verifyOtp`.
  Steam-only accounts get a placeholder email on the reserved `.invalid` domain, so no mail can reach it.
- **Email:** password sign-in directly. Sign-up confirmation and password-reset links also redirect to the
  loopback port, so opening them on the same PC signs you straight in.
- **Linking** (Settings → Account): Discord / Google use Supabase identity linking; Steam uses a one-time
  ticket from `steam-auth/link-ticket`, so the Steam ID is only ever written by the server.

Sessions are stored in `userData/auth.json`, encrypted with the OS keychain (Electron `safeStorage`).

## One-time setup

1. **Create the project** at [supabase.com](https://supabase.com) (free tier). Put its Project URL and anon
   (publishable) key into `electron/cloudConfig.ts`. Both are public by design.
2. **Push the schema and functions** from the repo folder:

   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   npx supabase functions deploy steam-auth --no-verify-jwt
   npx supabase functions deploy steam-api
   ```

3. **Steam Web API key:** get one at <https://steamcommunity.com/dev/apikey>, then
   `npx supabase secrets set STEAM_API_KEY=<key>`.
4. **Authentication → URL Configuration:** Site URL `http://127.0.0.1:47615/auth/callback`; Redirect URLs
   `http://127.0.0.1:47615/**`, `http://127.0.0.1:47616/**`, `http://127.0.0.1:47617/**`.
5. **Authentication → Sign In / Providers:**
   - Email: on, "Confirm email" on.
   - Turn on **Allow manual linking**.
   - Discord: create an app at <https://discord.com/developers/applications> → OAuth2 → add redirect
     `https://<project-ref>.supabase.co/auth/v1/callback` → paste its Client ID and Secret into Supabase.
   - Google: Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application) →
     authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` → paste the ID and secret.
6. **Email sending:** Supabase's built-in mailer is rate-limited and only delivers to your project's team
   members. That's fine for testing; set up custom SMTP (Authentication → Emails) before friends sign up.

## Tables

`profiles` (one per user, created by a trigger on sign-up), `friends`, `games` + `achievements`
(public cache, written by Edge Functions), `unlocks`, `proofs`, `xp_events` (a trigger keeps
`profiles.xp` in step), `steam_link_tickets` (server only) and `crash_reports` (opt-in, anonymous,
insert-only). Users can edit only their own presentational profile columns; `steam_id` and `xp` are
written by the server.
