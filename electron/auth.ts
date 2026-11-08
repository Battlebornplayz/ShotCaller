// Accounts: Firebase Auth and the synced Firestore profile, all in the main process.
// The renderer never sees tokens; it gets an AuthState snapshot and calls actions over IPC.
//
// Google: OAuth 2.0 "installed app" flow with PKCE in the system browser, caught on a loopback port
// (loopback.ts), then the Google ID token signs in to Firebase with signInWithCredential.
// Email: Firebase email/password. Verification and password-reset links open Firebase's own pages.

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  initializeAuth,
  linkWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  unlink,
  updateProfile as fbUpdateAuthProfile,
  type Auth,
  type Persistence,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { app, safeStorage, shell } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AccountProvider, AccountUser, ActionResult, AuthState, Profile, ProfilePatch, SignInMethod } from '../shared/types';
import { cloudConfigured, FIREBASE_CONFIG, GOOGLE_OAUTH, googleConfigured } from './cloudConfig';
import { waitForCallback, type LoopbackWait } from './loopback';

const BROWSER_TIMEOUT = 10 * 60_000;

let fbApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let profileUnsub: Unsubscribe | null = null;
let pending: LoopbackWait | null = null;
/** Display name typed at sign-up, used when the profile is first created. */
let signUpName: string | null = null;
const listeners = new Set<(s: AuthState) => void>();

let state: AuthState = { configured: false, status: 'loading', user: null, profile: null, flow: null, message: null };

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

export const getAuthState = (): AuthState => state;

export function onAuthStateChange(fn: (s: AuthState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** For other cloud features (crash reports). Null when not configured. */
export const getDb = (): Firestore | null => db;

// ---------------------------------------------------------------- session persistence
// Firebase Auth has no Node persistence, so this is a file-backed one: userData/auth.json,
// encrypted with the OS keychain (safeStorage) where available. Implements Firebase's
// persistence interface (the same shape its browser persistences use).

const storeFile = () => path.join(app.getPath('userData'), 'auth.json');
let store: Record<string, unknown> | null = null;

function loadStore(): Record<string, unknown> {
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

class FilePersistence {
  static type = 'LOCAL' as const;
  readonly type = 'LOCAL' as const;
  async _isAvailable(): Promise<boolean> {
    return true;
  }
  async _set(key: string, value: unknown): Promise<void> {
    loadStore()[key] = value;
    saveStore();
  }
  async _get<T>(key: string): Promise<T | null> {
    return (loadStore()[key] as T) ?? null;
  }
  async _remove(key: string): Promise<void> {
    delete loadStore()[key];
    saveStore();
  }
  _addListener(): void {}
  _removeListener(): void {}
}

// ---------------------------------------------------------------- profile

const ts = (v: unknown): string => (v instanceof Timestamp ? v.toDate().toISOString() : '');

function toProfile(id: string, d: DocumentData): Profile {
  return {
    id,
    username: String(d.username ?? ''),
    displayName: String(d.displayName ?? ''),
    bio: String(d.bio ?? ''),
    avatarUrl: typeof d.avatarUrl === 'string' ? d.avatarUrl : null,
    visibility: d.visibility === 'friends' || d.visibility === 'private' ? d.visibility : 'public',
    steamId: typeof d.steamId === 'string' ? d.steamId : null,
    xp: Number(d.xp ?? 0),
    createdAt: ts(d.createdAt),
    updatedAt: ts(d.updatedAt),
  };
}

function toUser(u: User): AccountUser {
  const providers = new Set<AccountProvider>();
  for (const p of u.providerData) {
    if (p.providerId === 'google.com') providers.add('google');
    if (p.providerId === 'password') providers.add('email');
  }
  return { id: u.uid, email: u.email, emailVerified: u.emailVerified, providers: [...providers] };
}

function slug(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 15);
  return s.length >= 3 ? s : 'player';
}

/** First sign-in: create users/{uid} and reserve a unique username in one transaction. */
async function ensureProfile(u: User): Promise<void> {
  const d = db!;
  const ref = doc(d, 'users', u.uid);
  if ((await getDoc(ref)).exists()) return;
  const shown = signUpName || u.displayName || u.email?.split('@')[0] || '';
  const displayName = (shown || 'Player').slice(0, 32);
  const base = slug(shown);
  const avatar = u.photoURL?.startsWith('https://') && u.photoURL.length <= 500 ? u.photoURL : null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const username = attempt === 0 ? base : `${base}_${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
    const created = await runTransaction(d, async (tx) => {
      const nameRef = doc(d, 'usernames', username);
      if ((await tx.get(nameRef)).exists()) return false;
      if ((await tx.get(ref)).exists()) return true;
      tx.set(nameRef, { uid: u.uid });
      tx.set(ref, {
        username,
        displayName,
        bio: '',
        avatarUrl: avatar,
        visibility: 'public',
        steamId: null,
        xp: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    });
    if (created) {
      signUpName = null;
      return;
    }
  }
  throw new Error('Couldn’t pick a username. Try again.');
}

/** Live profile: an edit on another PC shows up here straight away. */
function watchProfile(uid: string): void {
  profileUnsub?.();
  profileUnsub = onSnapshot(
    doc(db!, 'users', uid),
    (snap) => {
      if (snap.exists()) setState({ profile: toProfile(uid, snap.data()) });
    },
    (err) => setState({ message: { kind: 'error', text: `Profile sync stopped: ${friendly(err)}` } }),
  );
}

async function onUser(u: User | null): Promise<void> {
  if (!u) {
    profileUnsub?.();
    profileUnsub = null;
    setState({ status: 'signed-out', user: null, profile: null });
    return;
  }
  setState({ status: 'signed-in', user: toUser(u) });
  try {
    await ensureProfile(u);
    watchProfile(u.uid);
  } catch (err) {
    setState({ message: { kind: 'error', text: `Couldn’t load your profile: ${friendly(err)}` } });
  }
}

// ---------------------------------------------------------------- init

export function initAuth(): void {
  if (!cloudConfigured()) {
    setState({ configured: false, status: 'signed-out' });
    return;
  }
  fbApp = initializeApp(FIREBASE_CONFIG);
  auth = initializeAuth(fbApp, { persistence: FilePersistence as unknown as Persistence });
  db = getFirestore(fbApp);
  setState({ configured: true });
  onAuthStateChanged(auth, (u) => void onUser(u));
}

// ---------------------------------------------------------------- helpers

const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

function friendly(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  const msg = err instanceof Error ? err.message : String(err);
  const byCode: Record<string, string> = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/email-already-in-use': 'There’s already an account with that email. Sign in instead.',
    'auth/weak-password': 'Use at least 8 characters for your password.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'Couldn’t reach the ShotCaller server. Check your connection.',
    'auth/credential-already-in-use': 'That Google account is already linked to a different ShotCaller account.',
    'auth/account-exists-with-different-credential': 'This email already has an account. Sign in with your password, then link Google in Settings.',
    'auth/operation-not-allowed': 'That sign-in method isn’t switched on for this ShotCaller server yet.',
    'auth/requires-recent-login': 'Sign out and back in, then try again.',
    'permission-denied': 'The server refused that change.',
    unavailable: 'Couldn’t reach the ShotCaller server. Check your connection.',
  };
  return byCode[code] ?? msg;
}

function requireAuth(): Auth {
  if (!auth) throw new Error('This build isn’t connected to a ShotCaller server.');
  return auth;
}

function stopPending(): void {
  pending?.close();
  pending = null;
}

const b64url = (buf: Buffer) => buf.toString('base64url');

/** Google OAuth (installed-app flow with PKCE) → Firebase credential. */
async function googleCredential(linking: boolean) {
  if (!googleConfigured()) throw new Error('Google sign-in isn’t set up in this build.');
  stopPending();
  setState({ flow: { kind: 'browser', method: 'google', linking }, message: null });
  pending = await waitForCallback('/auth/callback', BROWSER_TIMEOUT);
  const wait = pending;
  const redirectUri = `http://127.0.0.1:${wait.port}/auth/callback`;
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const oauthState = b64url(randomBytes(24));

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: GOOGLE_OAUTH.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: oauthState,
    prompt: 'select_account',
  }).toString();
  await shell.openExternal(url.toString());

  const q = await wait.result;
  const error = q.get('error');
  if (error) throw new Error(error === 'access_denied' ? 'cancelled' : `Google said: ${error}`);
  if (q.get('state') !== oauthState) throw new Error('Sign-in response didn’t match. Try again.');
  const code = q.get('code');
  if (!code) throw new Error('Google didn’t return a code.');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_OAUTH.clientId,
      client_secret: GOOGLE_OAUTH.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id_token?: string; access_token?: string; error_description?: string };
  if (!res.ok || !body.id_token) throw new Error(body.error_description ?? 'Google sign-in failed.');
  return GoogleAuthProvider.credential(body.id_token, body.access_token);
}

async function browserAction(linking: boolean, act: (cred: ReturnType<typeof GoogleAuthProvider.credential>) => Promise<unknown>): Promise<ActionResult> {
  try {
    const cred = await googleCredential(linking);
    await act(cred);
    setState({ flow: null });
    return ok;
  } catch (err) {
    const msg = friendly(err);
    if (msg === 'cancelled') {
      setState({ flow: null });
      return fail('cancelled');
    }
    setState({ flow: null, message: { kind: 'error', text: msg } });
    return fail(msg);
  } finally {
    stopPending();
  }
}

// ---------------------------------------------------------------- actions

export async function signIn(method: SignInMethod): Promise<ActionResult> {
  if (method !== 'google') return fail('Unknown sign-in method.');
  return browserAction(false, (cred) => signInWithCredential(requireAuth(), cred));
}

export async function linkAccount(method: SignInMethod): Promise<ActionResult> {
  const u = auth?.currentUser;
  if (!u) return fail('Sign in first.');
  if (method !== 'google') return fail('Unknown sign-in method.');
  return browserAction(true, async (cred) => {
    await linkWithCredential(u, cred);
    await u.reload();
    setState({ user: toUser(u) });
  });
}

export async function unlinkAccount(method: SignInMethod): Promise<ActionResult> {
  try {
    const u = auth?.currentUser;
    if (!u) return fail('Sign in first.');
    if (method !== 'google') return fail('Unknown sign-in method.');
    if (u.providerData.length < 2) return fail('You need at least one other way to sign in first.');
    await unlink(u, 'google.com');
    setState({ user: toUser(u) });
    return ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signInWithEmail(email: string, password: string): Promise<ActionResult> {
  try {
    if (!EMAIL.test(email.trim())) return fail('Enter a valid email address.');
    await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
    return ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

export async function signUpWithEmail(email: string, password: string, displayName: string): Promise<ActionResult> {
  try {
    email = email.trim();
    if (!EMAIL.test(email)) return fail('Enter a valid email address.');
    if (password.length < 8) return fail('Use at least 8 characters for your password.');
    signUpName = displayName.trim().slice(0, 32) || null;
    const cred = await createUserWithEmailAndPassword(requireAuth(), email, password);
    if (signUpName) await fbUpdateAuthProfile(cred.user, { displayName: signUpName }).catch(() => undefined);
    await sendEmailVerification(cred.user).catch(() => undefined);
    setState({ message: { kind: 'info', text: `Welcome! We sent a verification link to ${email}.` } });
    return ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

export async function sendPasswordReset(email: string): Promise<ActionResult> {
  try {
    email = email.trim();
    if (!EMAIL.test(email)) return fail('Enter a valid email address.');
    await sendPasswordResetEmail(requireAuth(), email);
    setState({ message: { kind: 'info', text: `If ${email} has an account, a reset link is on its way.` } });
    return ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

export async function resendVerification(): Promise<ActionResult> {
  try {
    const u = auth?.currentUser;
    if (!u) return fail('Sign in first.');
    await sendEmailVerification(u);
    setState({ message: { kind: 'info', text: `Verification link sent to ${u.email}.` } });
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
  if (auth) await fbSignOut(auth);
}

const USERNAME = /^[a-z0-9_]{3,20}$/;

export async function updateProfile(patch: ProfilePatch): Promise<ActionResult> {
  try {
    const u = auth?.currentUser;
    if (!u || !db) return fail('Sign in first.');
    const d = db;
    const changes: Record<string, unknown> = {};
    let newName: string | null = null;
    if (patch.username !== undefined) {
      const name = String(patch.username).trim().toLowerCase();
      if (!USERNAME.test(name)) return fail('Usernames are 3-20 characters: letters, numbers and _.');
      newName = name;
    }
    if (patch.displayName !== undefined) {
      const v = String(patch.displayName).trim();
      if (v.length < 1 || v.length > 32) return fail('Display names are 1-32 characters.');
      changes.displayName = v;
    }
    if (patch.bio !== undefined) {
      const v = String(patch.bio).trim();
      if (v.length > 160) return fail('Keep your bio to 160 characters.');
      changes.bio = v;
    }
    if (patch.visibility !== undefined) {
      if (!['public', 'friends', 'private'].includes(patch.visibility)) return fail('Unknown visibility.');
      changes.visibility = patch.visibility;
    }

    const ref = doc(d, 'users', u.uid);
    const taken = await runTransaction(d, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Your profile isn’t ready yet. Try again in a moment.');
      const current = String(snap.data().username);
      if (newName && newName !== current) {
        const nameRef = doc(d, 'usernames', newName);
        if ((await tx.get(nameRef)).exists()) return true;
        tx.set(nameRef, { uid: u.uid });
        tx.delete(doc(d, 'usernames', current));
        changes.username = newName;
      }
      if (Object.keys(changes).length === 0) return false;
      tx.update(ref, { ...changes, updatedAt: serverTimestamp() });
      return false;
    });
    return taken ? fail('That username is taken.') : ok;
  } catch (err) {
    return fail(friendly(err));
  }
}

/** Reloads the account (e.g. to pick up email verification done in the browser). Throttled. */
let lastRefresh = 0;
export async function refreshProfile(): Promise<void> {
  const u = auth?.currentUser;
  if (!u || Date.now() - lastRefresh < 30_000) return;
  lastRefresh = Date.now();
  try {
    await u.reload();
    setState({ user: toUser(u) });
  } catch {
    // Offline: keep the cached state.
  }
}

export function disposeAuth(): void {
  stopPending();
  profileUnsub?.();
}
