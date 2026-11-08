import { useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import type { AccountProvider, AuthState, Profile, ProfileVisibility, SignInMethod } from '../../shared/types';
import { useAuth, useSettings } from '../hooks/useLive';
import { PageHeader } from './pages';

const api = () => window.shotcaller;

const METHOD_STYLE: Record<SignInMethod, { label: string; bg: string; fg: string; mark: string }> = {
  steam: { label: 'Steam', bg: '#171A21', fg: '#FFFFFF', mark: 'S' },
  discord: { label: 'Discord', bg: '#5865F2', fg: '#FFFFFF', mark: 'D' },
  google: { label: 'Google', bg: '#FFFFFF', fg: '#1F1F1F', mark: 'G' },
};

const PROVIDER_LABEL: Record<AccountProvider, string> = { steam: 'Steam', discord: 'Discord', google: 'Google', email: 'Email' };

// ---------------------------------------------------------------- small pieces

export function Avatar({ profile, size = 40 }: { profile: Profile | null; size?: number }) {
  const url = profile?.avatarUrl ?? profile?.steamAvatarUrl ?? null;
  const [broken, setBroken] = useState(false);
  const initial = (profile?.displayName ?? '?').trim().charAt(0).toUpperCase() || '?';
  const style: CSSProperties = { width: size, height: size, borderRadius: '50%', flex: 'none', objectFit: 'cover' };
  if (url && !broken) return <img src={url} alt="" style={style} onError={() => setBroken(true)} />;
  return (
    <div style={{ ...style, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 800, fontSize: size * 0.42 }}>
      {initial}
    </div>
  );
}

function MethodButton({ method, onClick, disabled, children }: { method: SignInMethod; onClick: () => void; disabled?: boolean; children?: ReactNode }) {
  const m = METHOD_STYLE[method];
  return (
    <button
      className="btn"
      onClick={onClick}
      disabled={disabled}
      style={{ background: m.bg, color: m.fg, border: '1px solid rgba(255,255,255,0.1)', justifyContent: 'center', gap: 10, padding: '11px 14px', fontWeight: 700 }}
    >
      <span style={{ width: 20, height: 20, borderRadius: 5, display: 'inline-grid', placeItems: 'center', fontSize: 12, fontWeight: 900, background: 'rgba(127,127,127,0.18)' }}>
        {m.mark}
      </span>
      {children ?? `Continue with ${m.label}`}
    </button>
  );
}

function Message({ auth }: { auth: AuthState }) {
  if (!auth.message) return null;
  return (
    <div
      className="fade"
      role={auth.message.kind === 'error' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 10,
        fontSize: 13,
        background: auth.message.kind === 'error' ? 'rgba(255,107,122,0.12)' : 'rgba(61,220,151,0.12)',
        color: auth.message.kind === 'error' ? 'var(--red)' : 'var(--green)',
      }}
    >
      <span style={{ flex: 1 }}>{auth.message.text}</span>
      <button className="muted" onClick={() => void api().dismissAuthMessage()} aria-label="Dismiss">
        ✕
      </button>
    </div>
  );
}

/** Shown while a browser step or an email link is outstanding. */
function FlowBanner({ auth }: { auth: AuthState }) {
  const f = auth.flow;
  if (!f || f.kind === 'recovery') return null;
  const text =
    f.kind === 'browser'
      ? `Finish ${f.linking ? 'linking' : 'signing in with'} ${METHOD_STYLE[f.method].label} in your browser…`
      : f.kind === 'email-confirm'
        ? `We sent a confirmation link to ${f.email}. Open it on this PC to sign in straight away, or confirm anywhere and then sign in with your password.`
        : `We sent a password-reset link to ${f.email}. Open it on this PC to choose a new password.`;
  return (
    <div className="card fade" style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--accent-soft)' }}>
      <span className="spinner" />
      <div style={{ flex: 1, fontSize: 13 }}>{text}</div>
      <button className="btn" onClick={() => void api().cancelAuthFlow()}>
        Cancel
      </button>
    </div>
  );
}

const input: CSSProperties = { width: '100%' };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span className="section-label">{label}</span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------- sign in

type EmailMode = 'sign-in' | 'sign-up' | 'reset';

function EmailForm({ busy }: { busy: boolean }) {
  const [mode, setMode] = useState<EmailMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setWorking(true);
    const res =
      mode === 'sign-in'
        ? await api().signInWithEmail(email, password)
        : mode === 'sign-up'
          ? await api().signUpWithEmail(email, password, name)
          : await api().sendPasswordReset(email);
    setWorking(false);
    if (!res.ok) setError(res.error);
  };

  const tab = (id: EmailMode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(id);
        setError(null);
      }}
      aria-pressed={mode === id}
      style={{ padding: '6px 2px', fontWeight: 700, color: mode === id ? 'var(--text)' : 'var(--muted)', borderBottom: `2px solid ${mode === id ? 'var(--accent)' : 'transparent'}` }}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 18 }}>
        {tab('sign-in', 'Sign in')}
        {tab('sign-up', 'Create account')}
      </div>
      {mode === 'sign-up' && (
        <Field label="Display name">
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="What friends see" />
        </Field>
      )}
      <Field label="Email">
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </Field>
      {mode !== 'reset' && (
        <Field label="Password">
          <input
            style={input}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            minLength={mode === 'sign-up' ? 8 : undefined}
            required
          />
        </Field>
      )}
      {error && (
        <div role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn primary" type="submit" disabled={busy || working}>
          {working ? 'Working…' : mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : 'Send reset link'}
        </button>
        {mode === 'sign-in' && (
          <button type="button" className="muted" style={{ fontSize: 13 }} onClick={() => setMode('reset')}>
            Forgot password?
          </button>
        )}
        {mode === 'reset' && (
          <button type="button" className="muted" style={{ fontSize: 13 }} onClick={() => setMode('sign-in')}>
            Back to sign in
          </button>
        )}
      </div>
    </form>
  );
}

export function SignInPanel({ auth }: { auth: AuthState }) {
  const busy = auth.flow?.kind === 'browser';
  if (!auth.configured) {
    return (
      <div className="card enter" style={{ display: 'grid', gap: 8, maxWidth: 760 }}>
        <div style={{ fontWeight: 700 }}>Accounts aren’t available in this build</div>
        <div className="muted" style={{ fontSize: 13 }}>
          This copy of ShotCaller isn’t connected to a ShotCaller server. Everything else works offline.
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
      <FlowBanner auth={auth} />
      <Message auth={auth} />
      <div className="card enter" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Sign in to ShotCaller</div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
            Your profile syncs to every PC you sign in on. Opens in your browser.
          </div>
          {(['steam', 'discord', 'google'] as SignInMethod[]).map((m) => (
            <MethodButton key={m} method={m} disabled={busy} onClick={() => void api().signIn(m)} />
          ))}
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Steam sign-in also lets ShotCaller read your Steam achievements (Phase 5). We never see your Steam password.
          </div>
        </div>
        <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: 28 }}>
          <EmailForm busy={busy} />
        </div>
      </div>
    </div>
  );
}

function NewPasswordCard() {
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card enter"
      style={{ display: 'grid', gap: 12, maxWidth: 760 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await api().setNewPassword(pw);
        if (!res.ok) setError(res.error);
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16 }}>Choose a new password</div>
      <Field label="New password">
        <input style={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} autoComplete="new-password" required />
      </Field>
      {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      <div>
        <button className="btn primary" type="submit">
          Save password
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- profile

function ProfileEditor({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  // Follow edits that arrive from another PC, unless the user is mid-edit here.
  const [base, setBase] = useState(profile);
  if (profile.updatedAt !== base.updatedAt) {
    if (displayName === base.displayName) setDisplayName(profile.displayName);
    if (username === base.username) setUsername(profile.username);
    if (bio === base.bio) setBio(profile.bio);
    setBase(profile);
  }

  const dirty = displayName !== profile.displayName || username !== profile.username || bio !== profile.bio;

  return (
    <form
      className="card enter"
      style={{ display: 'grid', gap: 14, animationDelay: '60ms' }}
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await api().updateProfile({ displayName, username, bio });
        setStatus(res.ok ? { ok: true, text: 'Saved. It’s live on your other PCs too.' } : { ok: false, text: res.error });
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 16 }}>Edit profile</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Display name">
          <input style={input} value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={32} />
        </Field>
        <Field label="Username">
          <input style={input} value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} maxLength={20} />
        </Field>
      </div>
      <Field label={`Bio · ${bio.length}/160`}>
        <textarea style={{ ...input, minHeight: 64, resize: 'vertical' }} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} />
      </Field>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn primary" type="submit" disabled={!dirty}>
          Save
        </button>
        {status && (
          <span className="fade" style={{ fontSize: 13, color: status.ok ? 'var(--green)' : 'var(--red)' }}>
            {status.text}
          </span>
        )}
      </div>
    </form>
  );
}

export function ProfilePage() {
  const auth = useAuth();
  if (!auth || auth.status === 'loading') {
    return <PageHeader title="Profile" subtitle="Loading your account…" />;
  }
  if (auth.status !== 'signed-in' || !auth.user) {
    return (
      <>
        <PageHeader title="Profile" subtitle="Sign in to get a profile that follows you to every PC." />
        <SignInPanel auth={auth} />
      </>
    );
  }
  const p = auth.profile;
  return (
    <>
      <PageHeader title="Profile" subtitle="Synced to your ShotCaller account." badge="Level, banner and showcase: Phase 6" />
      <div style={{ display: 'grid', gap: 14, maxWidth: 760 }}>
        <Message auth={auth} />
        {auth.flow?.kind === 'recovery' && <NewPasswordCard />}
        <div className="card enter" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <Avatar profile={p} size={72} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{p?.displayName ?? '…'}</div>
            <div className="muted">@{p?.username}</div>
            {p?.bio && <div style={{ marginTop: 8, fontSize: 14 }}>{p.bio}</div>}
          </div>
          <div style={{ display: 'grid', gap: 6, justifyItems: 'end' }}>
            <span className="pill">{(p?.xp ?? 0).toLocaleString()} XP</span>
            {p?.steamName && <span className="pill muted">Steam · {p.steamName}</span>}
          </div>
        </div>
        {p && <ProfileEditor profile={p} />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- settings sections

function SettingsCard({ title, subtitle, children, delay }: { title: string; subtitle: string; children: ReactNode; delay: number }) {
  return (
    <section className="card enter" style={{ display: 'grid', gap: 16, maxWidth: 760, marginBottom: 14, animationDelay: `${delay}ms` }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {subtitle}
        </div>
      </div>
      {children}
    </section>
  );
}

export function AccountSection({ delay = 0 }: { delay?: number }) {
  const auth = useAuth();
  const [linkError, setLinkError] = useState<string | null>(null);
  if (!auth) return null;
  if (auth.status !== 'signed-in' || !auth.user) {
    return (
      <SettingsCard title="Account" subtitle="Sign in to sync your profile across PCs." delay={delay}>
        <SignInPanel auth={auth} />
      </SettingsCard>
    );
  }
  const user = auth.user;
  const busy = auth.flow?.kind === 'browser';
  const has = (p: AccountProvider) => user.providers.includes(p);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setLinkError(null);
    const res = await fn();
    if (!res.ok && res.error && res.error !== 'cancelled') setLinkError(res.error);
  };

  return (
    <SettingsCard title="Account" subtitle="Your ShotCaller account and the ways you can sign in to it." delay={delay}>
      <FlowBanner auth={auth} />
      <div className="row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Avatar profile={auth.profile} size={40} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{auth.profile?.displayName}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {user.email ?? 'Signed in with Steam'}
            </div>
          </div>
        </div>
        <button className="btn" onClick={() => void api().signOut()}>
          Sign out on this PC
        </button>
      </div>

      <div className="section-label">Sign-in methods</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {(['steam', 'discord', 'google'] as SignInMethod[]).map((m) => (
          <div key={m} className="row">
            <div>
              <div style={{ fontWeight: 600 }}>{PROVIDER_LABEL[m]}</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {has(m) ? (m === 'steam' && auth.profile?.steamName ? `Linked as ${auth.profile.steamName}` : 'Linked') : 'Not linked'}
              </div>
            </div>
            {has(m) ? (
              m === 'steam' ? (
                <span className="pill green">Linked</span>
              ) : (
                <button className="btn" disabled={busy || user.providers.length < 2} onClick={() => void run(() => api().unlinkAccount(m))}>
                  Unlink
                </button>
              )
            ) : (
              <MethodButton method={m} disabled={busy} onClick={() => void run(() => api().linkAccount(m))}>
                Link {PROVIDER_LABEL[m]}
              </MethodButton>
            )}
          </div>
        ))}
        {has('email') && (
          <div className="row">
            <div>
              <div style={{ fontWeight: 600 }}>Email and password</div>
              <div className="muted" style={{ fontSize: 12 }}>
                {user.email}
              </div>
            </div>
            <span className="pill green">Linked</span>
          </div>
        )}
      </div>
      {linkError && <div style={{ color: 'var(--red)', fontSize: 13 }}>{linkError}</div>}
    </SettingsCard>
  );
}

const VISIBILITY: { id: ProfileVisibility; title: string; description: string }[] = [
  { id: 'public', title: 'Public', description: 'Anyone signed in to ShotCaller can see your profile and unlocks.' },
  { id: 'friends', title: 'Friends', description: 'Only accepted friends can see them.' },
  { id: 'private', title: 'Private', description: 'Only you.' },
];

export function PrivacySection({ delay = 0 }: { delay?: number }) {
  const auth = useAuth();
  const settings = useSettings();
  const [error, setError] = useState<string | null>(null);
  const visibility = auth?.profile?.visibility;

  return (
    <SettingsCard title="Privacy" subtitle="ShotCaller only syncs your profile data. There are no usage analytics." delay={delay}>
      {auth?.status === 'signed-in' && (
        <>
          <div className="section-label">Who can see your profile</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {VISIBILITY.map((v) => {
              const selected = visibility === v.id;
              return (
                <button
                  key={v.id}
                  aria-pressed={selected}
                  onClick={async () => {
                    const res = await api().updateProfile({ visibility: v.id });
                    setError(res.ok ? null : res.error);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    borderRadius: 10,
                    background: selected ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{v.title}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {v.description}
                  </div>
                </button>
              );
            })}
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
        </>
      )}
      <div className="row">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>Send crash reports</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Anonymous: the error, the ShotCaller version and your OS. No account, games or files.
          </div>
        </div>
        <button
          role="switch"
          aria-checked={!!settings?.privacy.crashReports}
          aria-label="Send crash reports"
          className="toggle"
          onClick={() => void api().updateSettings({ privacy: { crashReports: !settings?.privacy.crashReports } })}
        />
      </div>
      <div className="muted" style={{ fontSize: 12 }}>
        Synced: your display name, username, bio, avatar, linked Steam ID and (from Phase 5) your achievements. Your settings, game library and
        hotkeys stay on this PC.
      </div>
    </SettingsCard>
  );
}
