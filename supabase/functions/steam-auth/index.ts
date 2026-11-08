// Steam sign-in (OpenID 2.0) and Steam account linking for the ShotCaller desktop app.
//
//   GET  /steam-auth/start?port=&state=[&ticket=]  → redirects to Steam's login page
//   GET  /steam-auth/callback                      → Steam returns here; we verify, then redirect to
//                                                    the app's loopback server on 127.0.0.1:<port>
//   POST /steam-auth/link-ticket   (user JWT)      → one-time ticket for linking Steam to the signed-in account
//
// Sign-in: the verified SteamID finds (or creates) a Supabase user, and we hand the app a one-time
// magic-link token hash, which it exchanges for a session with verifyOtp. Deployed with verify_jwt = false
// (the browser can't send a JWT); link-ticket checks the JWT itself.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json, playerSummary } from '../_shared/steam.ts';

const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;
/** The app's loopback ports. Keep in sync with electron/auth.ts and the Supabase redirect allow-list. */
const PORTS = new Set(['47615', '47616', '47617']);
const STATE = /^[A-Za-z0-9_-]{16,128}$/;
const TICKET = /^[A-Za-z0-9_-]{32,128}$/;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CALLBACK = `${SUPABASE_URL}/functions/v1/steam-auth/callback`;

function page(title: string, text: string, status = 400): Response {
  const html = `<!doctype html><meta charset="utf-8"><title>${title}</title>
<body style="background:#0F1023;color:#F2F3FF;font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0">
<div style="background:#1A1C3A;padding:32px 40px;border-radius:12px;max-width:420px;text-align:center">
<h2 style="margin:0 0 8px">${title}</h2><p style="color:#8F93C9;margin:0">${text}</p></div></body>`;
  return new Response(html, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function toApp(port: string, params: Record<string, string>): Response {
  const url = `http://127.0.0.1:${port}/auth/steam?${new URLSearchParams(params)}`;
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'no-store' } });
}

function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------- start

function start(url: URL): Response {
  const port = url.searchParams.get('port') ?? '';
  const state = url.searchParams.get('state') ?? '';
  const ticket = url.searchParams.get('ticket');
  if (!PORTS.has(port) || !STATE.test(state) || (ticket !== null && !TICKET.test(ticket))) {
    return page('Sign-in link is broken', 'Start Steam sign-in again from ShotCaller.');
  }
  const returnTo = new URL(CALLBACK);
  returnTo.searchParams.set('port', port);
  returnTo.searchParams.set('state', state);
  if (ticket) returnTo.searchParams.set('ticket', ticket);

  const login = new URL(STEAM_OPENID);
  login.search = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo.toString(),
    'openid.realm': new URL(SUPABASE_URL).origin,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  }).toString();
  return new Response(null, { status: 302, headers: { location: login.toString(), 'cache-control': 'no-store' } });
}

// ---------------------------------------------------------------- callback

/** Asks Steam to confirm the signed assertion. Returns the SteamID or null. */
async function verifyAssertion(url: URL): Promise<string | null> {
  const p = url.searchParams;
  if (p.get('openid.mode') !== 'id_res') return null;
  if (p.get('openid.op_endpoint') !== STEAM_OPENID) return null;
  const match = CLAIMED_ID.exec(p.get('openid.claimed_id') ?? '');
  if (!match || p.get('openid.identity') !== p.get('openid.claimed_id')) return null;
  if (!(p.get('openid.return_to') ?? '').startsWith(`${CALLBACK}?`)) return null;
  // The signed fields must include return_to, so its port/state/ticket can be trusted.
  const signed = (p.get('openid.signed') ?? '').split(',');
  if (!['return_to', 'claimed_id', 'identity', 'response_nonce'].every((f) => signed.includes(f))) return null;

  const body = new URLSearchParams();
  for (const [k, v] of p) if (k.startsWith('openid.')) body.set(k, v);
  body.set('openid.mode', 'check_authentication');
  const res = await fetch(STEAM_OPENID, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  return /^is_valid\s*:\s*true$/m.test(text) ? match[1] : null;
}

async function profileBySteamId(steamId: string): Promise<{ id: string } | null> {
  const { data } = await admin.from('profiles').select('id').eq('steam_id', steamId).maybeSingle();
  return data;
}

async function setSteamOnProfile(userId: string, steamId: string, name?: string, avatar?: string) {
  const { error } = await admin
    .from('profiles')
    .update({ steam_id: steamId, steam_name: name ?? null, steam_avatar_url: avatar ?? null })
    .eq('id', userId);
  if (error) throw error;
  await admin.auth.admin.updateUserById(userId, { app_metadata: { steam_id: steamId } });
}

async function callback(url: URL): Promise<Response> {
  // Port/state/ticket come from the signed return_to, never from unsigned query params.
  const returnTo = new URL(url.searchParams.get('openid.return_to') ?? CALLBACK);
  const port = returnTo.searchParams.get('port') ?? '';
  const state = returnTo.searchParams.get('state') ?? '';
  const ticket = returnTo.searchParams.get('ticket');
  if (!PORTS.has(port) || !STATE.test(state)) return page('Sign-in link is broken', 'Start Steam sign-in again from ShotCaller.');

  if (url.searchParams.get('openid.mode') === 'cancel') return toApp(port, { state, error: 'cancelled' });

  const steamId = await verifyAssertion(url);
  if (!steamId) return toApp(port, { state, error: 'steam_verify_failed' });

  const summary = await playerSummary(steamId).catch(() => null);
  const name = summary?.personaname?.slice(0, 32);
  const avatar = summary?.avatarfull?.startsWith('https://') ? summary.avatarfull : undefined;

  try {
    // ----- Linking Steam to an already signed-in account
    if (ticket) {
      const { data: t } = await admin.from('steam_link_tickets').delete().eq('nonce', ticket).select().maybeSingle();
      if (!t || new Date(t.expires_at).getTime() < Date.now()) return toApp(port, { state, error: 'link_expired' });
      const owner = await profileBySteamId(steamId);
      if (owner && owner.id !== t.user_id) return toApp(port, { state, error: 'steam_in_use' });
      await setSteamOnProfile(t.user_id, steamId, name, avatar);
      return toApp(port, { state, linked: '1' });
    }

    // ----- Signing in with Steam
    let userId = (await profileBySteamId(steamId))?.id;
    let email: string | undefined;
    if (userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error) throw error;
      email = data.user.email;
    } else {
      // A Steam-only account. ".invalid" is a reserved TLD, so no mail can ever reach this address.
      email = `steam_${steamId}@steam.shotcaller.invalid`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { steam_id: steamId },
        user_metadata: { display_name: name ?? 'Steam player', user_name: name, avatar_url: avatar },
      });
      if (error) throw error;
      userId = data.user.id;
      await setSteamOnProfile(userId, steamId, name, avatar);
    }
    if (!email) return toApp(port, { state, error: 'no_email' });

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (linkErr) throw linkErr;
    if (name || avatar) {
      await admin.from('profiles').update({ steam_name: name ?? null, steam_avatar_url: avatar ?? null }).eq('id', userId);
    }
    return toApp(port, { state, token_hash: link.properties.hashed_token });
  } catch (err) {
    console.error('steam-auth callback failed', err);
    return toApp(port, { state, error: 'server_error' });
  }
}

// ---------------------------------------------------------------- link ticket

async function linkTicket(req: Request): Promise<Response> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) return json({ error: 'not_signed_in' }, 401);
  // Clear this user's old tickets, then issue a fresh one.
  await admin.from('steam_link_tickets').delete().eq('user_id', data.user.id);
  const nonce = randomToken();
  const { error: insErr } = await admin.from('steam_link_tickets').insert({ nonce, user_id: data.user.id });
  if (insErr) return json({ error: 'server_error' }, 500);
  return json({ ticket: nonce });
}

// ---------------------------------------------------------------- router

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const route = url.pathname.replace(/\/+$/, '').split('/').pop();
  if (req.method === 'GET' && route === 'start') return start(url);
  if (req.method === 'GET' && route === 'callback') return await callback(url);
  if (req.method === 'POST' && route === 'link-ticket') return await linkTicket(req);
  return json({ error: 'not_found' }, 404);
});
