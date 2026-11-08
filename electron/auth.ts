// Accounts: Supabase auth and the synced profile, all in the main process.
// The renderer never sees tokens; it gets an AuthState snapshot and calls actions over IPC.
//
// Sign-in flows open the system browser and catch the redirect on a loopback port (see loopback.ts):
//   Discord / Google: Supabase OAuth with PKCE → ?code → exchangeCodeForSession.
//   Steam: the steam-auth Edge Function does OpenID → ?token_hash → verifyOtp.
//   Email: password sign-in directly; sign-up confirmation and password-reset links also land on loopback.

import { createClient, type Session, type SupabaseClient, type User, type RealtimeChannel } from '@supabase/supabase-js';
import { app, safeStorage, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AccountProvider, AccountUser, ActionResult, AuthFlow, AuthState, Profile, ProfilePatch, SignInMethod } from '../shared/types';
import { cloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './cloudConfig';
import { waitForCallback, type LoopbackWait } from './loopback';

const BROWSER_TIMEOUT = 10 * 60_000;
const EMAIL_TIMEOUT = 30 * 60_000;

let client: SupabaseClient | null = null;
let profileChannel: RealtimeChannel | null = null;
let pending: LoopbackWait | null = null;
const listeners = new Set<(s: AuthState) => void>();

let state: AuthState = {
  configured: false,
  status: 'loading',
  user: null,
  profile: null,
  flow: null,
  message: null,
};

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

export const getAuthState = (): AuthState => state;

export function onAuthStateChange(fn: (s: AuthState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For other cloud features (crash reports, later the Steam proxy). Null when not configured. */
export const getCloudClient = (): SupabaseClient | null => client;

// ---------------------------------------------------------------- session storage
// Tokens are stored in userData/auth.json, encrypted with the OS keychain (safeStorage) where available.

const storeFile = () => path.join(app.getPath('userData'), 'auth.json');
let store: Record<string, string> | null = null;

function loadStore(): Record<string, string> {
  if (store) return store;
  try {
    const raw = fs.readFileSync(storeFile());
    const text = safeStorage.isEncryptionAvailable() && raw[0] !== 0x7b ? safeStorage.decryptString(raw) : raw.toString('utf8');
    const parsed = JSON.parse(text);
    store = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    store = {};
  }
  return store!;
}

function saveStore(): void {
  const text = JSON.stringify(store ?? {});
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : Buffer.from(text, 'utf8');
  try {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
    fs.writeFileSync(storeFile(), data, { mode: 0o600 });
  } catch (err) {
    console.error('Could not save the sign-in session:', err);
  }
}

const storage = {
  getItem: (key: string) => loadStore()[key] ?? null,
  setItem: (key: string, value: string) => {
    loadStore()[key] = value;
    saveStore();
  },
  removeItem: (key: string) => {
    delete loadStore()[key];
    saveStore();
  },
};

// ---------------------------------------------------------------- profile

type Row = Record<string, unknown>;

function toProfile(r: Row): Profile {
  const s = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    id: String(r.id),
    username: String(r.username ?? ''),
    displayName: String(r.display_name ?? ''),
    bio: String(r.bio ?? ''),
    avatarUrl: s(r.avatar_url),
    bannerUrl: s(r.banner_url),
    visibility: r.visibility === 'friends' || r.visibility === 'private' ? r.visibility : 'public',
    steamId: s(r.steam_id),
    steamName: s(r.steam_name),
    steamAvatarUrl: s(r.steam_avatar_url),
    xp: Number(r.xp ?? 0),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? ''),
  };
}

function toUser(u: User, profile: Profile | null): AccountUser {
  const providers = new Set<AccountProvider>();
  for (const i of u.identities ?? []) {
    if (i.provider === 'discord' || i.provider === 'google' || i.provider === 'email') providers.add(i.provider);
  }
  const steamOnly = (u.email ?? '').endsWith('.invalid');
  if (steamOnly) providers.delete('email');
  if (profile?.steamId) providers.add('steam');
  return { id: u.id, email: steamOnly ? null : (u.email ?? null), providers: [...providers] };
}

async function loadProfile(): Promise<void> {
  if (!client) return;
  const { data: userData } = await client.auth.getUser();
  const user = userData.user;
  if (!user) return;
  const { data, error } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (error) {
    setState({ message: { kind: 'error', text: `Couldn’t load your profile: ${error.message}` } });
    return;
  }
  const profile = data ? toProfile(data) : null;
  setState({ status: 'signed-in', user: toUser(user, profile), profile });
  subscribeProfile(user.id);
}

/** Live updates: an edit on another PC shows up here without a refresh. */
function subscribeProfile(userId: string): void {
  if (!client || profileChannel?.topic === `realtime:profile:${userId}`) return;
  void profileChannel?.unsubscribe();
  profileChannel = client
    .channel(`profile:${userId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, (payload) => {
      const profile = toProfile(payload.new as Row);
      setState({ profile, user: state.user ? { ...state.user, providers: withSteam(state.user.providers, profile) } : null });
    })
    .subscribe();
}

function withSteam(providers: AccountProvider[], profile: Profile): AccountProvider[] {
  const rest = providers.filter((p) => p !== 'steam');
  return profile.steamId ? [...rest, 'steam'] : rest;
}

function onSession(session: Session | null): void {
  if (!session) {
    void profileChannel?.unsubscribe();
    profileChannel = null;
    setState({ status: 'signed-out', user: null, profile: null });
    return;
  }
  void loadProfile();
}

// ---------------------------------------------------------------- init

export function initAuth(): void {
  if (!cloudConfigured()) {
    setState({ configured: false, status: 'signed-out' });
    return;
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  setState({ configured: true });
  client.auth.onAuthStateChange((event, session) => {
    // Don't call other Supabase methods inside this callback (it can deadlock); defer.
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') setState({ flow: { kind: 'recovery' } });
      onSession(session);
    }, 0);
  });
}

// ---------------------------------------------------------------- helpers

const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

function friendly(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first: check your inbox for the link.';
  if (/user already registered/i.test(msg)) return 'There’s already an account with that email. Sign in instead.';
  if (/identity is already linked/i.test(msg)) return 'That account is already linked to a different ShotCaller account.';
  if (/manual linking is disabled/i.test(msg)) return 'Account linking isn’t switched on for this ShotCaller server yet.';
  if (/provider is not enabled/i.test(msg)) return 'That sign-in method isn’t switched on for this ShotCaller server yet.';
  if (/fetch failed|network/i.test(msg)) return 'Couldn’t reach the ShotCaller server. Check your connection.';
  return msg;
}

const STEAM_ERRORS: Record<string, string> = {
  cancelled: 'Steam sign-in was cancelled.',
  steam_verify_failed: 'Steam couldn’t confirm the sign-in. Try again.',
  steam_in_use: 'That Steam account is already linked to a different ShotCaller account.',
  link_expired: 'The link request expired. Try again.',
  no_email: 'This account can’t sign in with Steam.',
  server_error: 'The ShotCaller server hit an error. Try again in a minute.',
};

function requireClient(): SupabaseClient {
  if (!client) throw new Error('This build isn’t connected to a ShotCaller server.');
  return client;
}

function stopPending(): void {
  pending?.close();
  pending = null;
}

/** Opens `url` in the browser and waits for the loopback callback. Handles cancel and flow state. */
async function browserFlow(
  method: SignInMethod,
  linking: boolean,
  callbackPath: string,
  buildUrl: (redirect: string, port: number) => Promise<string>,
  finish: (q: URLSearchParams) => Promise<void>,
): Promise<ActionResult> {
  stopPending();
  setState({ flow: { kind: 'browser', method, linking }, message: null });
  try {
    pending = await waitForCallback(callbackPath, BROWSER_TIMEOUT);
    const wait = pending;
    const url = await buildUrl(`http://127.0.0.1:${wait.port}${callbackPath}`, wait.port);
    await shell.openExternal(url);
    const q = await wait.result;
    const error = q.get('error_description') ?? q.get('error');
    if (error) throw new Error(STEAM_ERRORS[error] ?? error.replace(/\+/g, ' '));
    await finish(q);
    setState({ flow: null });
    if (linking) await loadProfile();
    return ok;
  } catch (err) {
    const msg = friendly(err);
    if (msg === 'cancelled') {
      return fail('cancelled');
    }
    setState({ flow: null, message: { kind: 'error', text: msg } });
    return fail(msg);
  } finally {
    stopPending();
  }
}

async function exchangeCode(q: URLSearchParams): Promise<void> {
  const code = q.get('code');
  if (!code) throw new Error('The sign-in page didn’t return a code.');
  const { error } = await requireClient().auth.exchangeCodeForSession(code);
  if (error) throw error;
}

function steamStartUrl(port: number, stateToken: string, ticket?: string): string {
  const q = new URLSearchParams({ port: String(port), state: stateToken });
  if (ticket) q.set('ticket', ticket);
  return `${SUPABASE_URL}/functions/v1/steam-auth/start?${q}`;
}

function newState(): string {
  return randomBytes(24).toString('base64url');
}

// ---------------------------------------------------------------- actions

export async function signIn(method: SignInMethod): Promise<ActionResult> {
  try {
    const c = requireClient();
    if (method === 'steam') {
      const st = newState();
      return await browserFlow(
        'steam',
        false,
        '/auth/steam',
        async (_redirect, port) => steamStartUrl(port, st),
        async (q) => {
          if (q.get('state') !== st) throw new Error('Sign-in response didn’t match. Try again.');
          const tokenHash = q.get('token_hash');
          if (!tokenHash) throw new Error('Steam sign-in didn’t return a token.');
          let { error } = await c.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
          if (error) ({ error } = await c.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }));
          if (error) throw error;
        },
      );
    }
    return await browserFlow(
      method,
      false,
      '/auth/callback',
      async (redirectTo) => {
        const { data, error } = await c.auth.signInWithOAuth({
          provider: method,
          options: { redirectTo, skipBrowserRedirect: true, scopes: method === 'discord' ? 'identify email' : undefined },
        });
        if (error || !data.url) throw error ?? new Error('No sign-in URL.');
        return data.url;
      },
      exchangeCode,
    );
  } catch (err) {
    return fail(friendly(err));
  }
}

export async function linkAccount(method: SignInMethod): Promise<ActionResult> {
  try {
    const c = requireClient();
    const { data: s } = await c.auth.getSession();
    if (!s.session) return fail('Sign in first.');
    if (method === 'steam') {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/steam-auth/link-ticket`, {
        method: 'POST',
        headers: { authorization: `Bearer ${s.session.access_token}`, apikey: SUPABASE_ANON_KEY },
      });
      const body = (await res.json().catch(() => ({}))) as { ticket?: string; error?: string };
      if (!res.ok || !body.ticket) return fail(STEAM_ERRORS[body.error ?? ''] ?? 'Couldn’t start Steam linking.');
      const st = newState();
      const ticket = body.ticket;
      return await browserFlow(
        'steam',
        true,
        '/auth/steam',
        async (_r, port) => steamStartUrl(port, st, ticket),
        async (q) => {
          if (q.get('state') !== st || q.get('linked') !== '1') throw new Error('Steam linking didn’t finish.');
        },
      );
    }
    return await browserFlow(
      method,
      true,
      '/auth/callback',
      async (redirectTo) => {
        const { data, error } = await c.auth.linkIdentity({ provider: method, options: { redirectTo, skipBrowserRedirect: true } });
        if (error || !data.url) throw error ?? new Error('No link URL.');
        return data.url;
      },
      exchangeCode,
    );
  } catch (err) {
    return fail(friendly(err));
  }
}

export async function unlinkAccount(method: 'discord' | 'google'): Promise<ActionResult> {
  try {
    const c = requireClient();
    const { data } = await c.auth.getUserIdentities();
    const identities = data?.identities ?? [];
    const identity = identities.find((i) => i.provider === method);
    if (!identity) return fail('That account isn’t linked.');
    const others = (state.user?.providers ?? []).filter((p) => p !== method);
    if (others.length === 0) return fail('You need at least one other way to sign in first.');
    const { error } = await c.auth.unlinkIdentity(identity);
    if (error) return fail(friendly(error));
    await c.auth.refreshSession();
    await loadProfile();
    return ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInWithEmail(email: string, password: string): Promise<ActionResult> {
  try {
    if (!EMAIL.test(email)) return fail('Enter a valid email address.');
    const { error } = await requireClient().auth.signInWithPassword({ email: email.trim(), password });
    return error ? fail(friendly(error)) : ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

/** Waits (in the background) for an emailed link to land on the loopback port. */
async function awaitEmailLink(flow: AuthFlow): Promise<string> {
  stopPending();
  pending = await waitForCallback('/auth/callback', EMAIL_TIMEOUT);
  const wait = pending;
  setState({ flow, message: null });
  wait.result
    .then(async (q) => {
      const error = q.get('error_description') ?? q.get('error');
      if (error) throw new Error(error.replace(/\+/g, ' '));
      await exchangeCode(q);
      // A reset link signs the user in; they still have to pick the new password.
      setState({ flow: flow.kind === 'reset-sent' ? { kind: 'recovery' } : null });
    })
    .catch((err) => {
      const msg = friendly(err);
      if (msg !== 'cancelled' && state.flow === flow) setState({ flow: null, message: { kind: 'error', text: msg } });
    })
    .finally(() => {
      if (pending === wait) pending = null;
    });
  return `http://127.0.0.1:${wait.port}/auth/callback`;
}

export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<ActionResult> {
  try {
    const c = requireClient();
    email = email.trim();
    if (!EMAIL.test(email)) return fail('Enter a valid email address.');
    if (password.length < 8) return fail('Use at least 8 characters for your password.');
    const name = displayName.trim().slice(0, 32);
    const redirect = await awaitEmailLink({ kind: 'email-confirm', email });
    const { data, error } = await c.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirect, data: name ? { display_name: name } : undefined },
    });
    if (error) {
      stopPending();
      setState({ flow: null });
      return fail(friendly(error));
    }
    if (data.session) {
      // Email confirmation is off on this server: signed in straight away.
      stopPending();
      setState({ flow: null });
    }
    return ok;
  } catch (err) {
    stopPending();
    setState({ flow: null });
    return fail(friendly(err));
  }
}

export async function sendPasswordReset(email: string): Promise<ActionResult> {
  try {
    email = email.trim();
    if (!EMAIL.test(email)) return fail('Enter a valid email address.');
    const redirectTo = await awaitEmailLink({ kind: 'reset-sent', email });
    const { error } = await requireClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      stopPending();
      setState({ flow: null });
      return fail(friendly(error));
    }
    return ok;
  } catch (err) {
    stopPending();
    setState({ flow: null });
    return fail(friendly(err));
  }
}

export async function setNewPassword(password: string): Promise<ActionResult> {
  try {
    if (password.length < 8) return fail('Use at least 8 characters for your password.');
    const { error } = await requireClient().auth.updateUser({ password });
    if (error) return fail(friendly(error));
    setState({ flow: null, message: { kind: 'info', text: 'Password updated.' } });
    return ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

export function cancelAuthFlow(): void {
  stopPending();
  setState({ flow: null });
}

export function dismissAuthMessage(): void {
  setState({ message: null });
}

export async function signOut(): Promise<void> {
  stopPending();
  setState({ flow: null, message: null });
  // Local scope: only this PC signs out; the other PCs stay signed in.
  await client?.auth.signOut({ scope: 'local' });
  onSession(null);
}

const USERNAME = /^[a-z0-9_]{3,20}$/;

export async function updateProfile(patch: ProfilePatch): Promise<ActionResult> {
  try {
    const c = requireClient();
    if (!state.profile) return fail('Sign in first.');
    const row: Row = {};
    if (patch.username !== undefined) {
      const u = String(patch.username).trim().toLowerCase();
      if (!USERNAME.test(u)) return fail('Usernames are 3-20 characters: letters, numbers and _.');
      row.username = u;
    }
    if (patch.displayName !== undefined) {
      const d = String(patch.displayName).trim();
      if (d.length < 1 || d.length > 32) return fail('Display names are 1-32 characters.');
      row.display_name = d;
    }
    if (patch.bio !== undefined) {
      const b = String(patch.bio).trim();
      if (b.length > 160) return fail('Keep your bio to 160 characters.');
      row.bio = b;
    }
    if (patch.visibility !== undefined) {
      if (!['public', 'friends', 'private'].includes(patch.visibility)) return fail('Unknown visibility.');
      row.visibility = patch.visibility;
    }
    if (Object.keys(row).length === 0) return ok;
    const { data, error } = await c.from('profiles').update(row).eq('id', state.profile.id).select('*').single();
    if (error) return fail(error.code === '23505' ? 'That username is taken.' : friendly(error));
    setState({ profile: toProfile(data) });
    return ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

let lastRefresh = 0;

/** Re-reads the profile; called on window focus, so it's throttled to once every 30 s. */
export async function refreshProfile(): Promise<void> {
  if (state.status !== 'signed-in' || Date.now() - lastRefresh < 30_000) return;
  lastRefresh = Date.now();
  await loadProfile();
}

export function disposeAuth(): void {
  stopPending();
  void profileChannel?.unsubscribe();
}
