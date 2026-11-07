import { useEffect, useState, type ReactNode } from 'react';
import type { GameModule } from '../../games/types';
import type { AppInfo, Channel, Settings, UpdateState } from '../../shared/types';
import { useUpdateState } from '../hooks/useUpdateState';

function PageHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge?: string }) {
  return (
    <header className="enter" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
        {badge && <span className="pill muted">{badge}</span>}
      </div>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        {subtitle}
      </p>
    </header>
  );
}

/** Empty section placeholder. Real content lands in the phase named in the badge. */
function ComingSoon({ title, subtitle, phase, children }: { title: string; subtitle: string; phase: string; children?: ReactNode }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} badge={phase} />
      <div className="card enter" style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Nothing here yet</div>
        <div className="muted">This section fills in during {phase}.</div>
        {children}
      </div>
    </>
  );
}

export function HomePage() {
  return (
    <>
      <PageHeader title="Home" subtitle="Playing now, closest unlocks and your recent wins." badge="Phase 6" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {['Playing now', 'Closest to unlock', 'Recent unlocks', 'Your stats', 'Weekly challenge'].map((label, i) => (
          <div key={label} className="card enter" style={{ animationDelay: `${i * 60}ms`, minHeight: 130 }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {label}
            </div>
            <div className="muted" style={{ marginTop: 22, fontSize: 13 }}>
              Widget data arrives in Phase 6.
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function LibraryPage() {
  return <ComingSoon title="Library" subtitle="Your games, achievements and completion at a glance." phase="Phase 5" />;
}

export function ProfilePage() {
  return <ComingSoon title="Profile" subtitle="Your banner, level and five-achievement showcase." phase="Phase 6" />;
}

export function FriendsPage() {
  return <ComingSoon title="Friends" subtitle="Friends list, activity feed and shared hunts." phase="Phase 10" />;
}

export function GamePage({ game }: { game: GameModule }) {
  return (
    <>
      <PageHeader
        title={game.name}
        subtitle={game.steamAppId ? `Steam app ${game.steamAppId}` : 'Game module'}
        badge="Phase 3"
      />
      <div className="card enter">
        <div className="muted">Overlay, detection and game-specific tools arrive with the game module system (Phase 3) and Skillshot City (Phase 8).</div>
      </div>
    </>
  );
}

const CHANNELS: { id: Channel; title: string; description: string }[] = [
  {
    id: 'stable',
    title: 'Stable',
    description: 'Tested releases only. Recommended for most people.',
  },
  {
    id: 'beta',
    title: 'Beta',
    description: 'Get new features early (GitHub pre-releases). Expect rough edges.',
  },
];

function UpdateStatus({ state, info }: { state: UpdateState; info: AppInfo | null }) {
  const text = (() => {
    switch (state.status) {
      case 'checking':
        return 'Checking for updates…';
      case 'up-to-date':
        return `You're on the latest version (v${state.version}).`;
      case 'available':
        return `Version ${state.version} is available. Open the launcher to update.`;
      case 'downloading':
        return `Downloading ${state.version}… ${state.percent}%`;
      case 'downloaded':
        return `Version ${state.version} is ready. Restart ShotCaller to apply it.`;
      case 'dev':
        return 'Development build: updates are disabled.';
      case 'error':
        return `Couldn't check for updates: ${state.message}`;
      default:
        return info?.packaged === false ? 'Development build.' : '';
    }
  })();
  return <div className="muted" style={{ fontSize: 13 }}>{text}</div>;
}

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const update = useUpdateState();

  useEffect(() => {
    void window.shotcaller.getAppInfo().then(setInfo);
    void window.shotcaller.getSettings().then(setSettings);
  }, []);

  const pickChannel = async (channel: Channel) => {
    const next = await window.shotcaller.setChannel(channel);
    setSettings(next);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Updates, channels and app details." />

      <section className="card enter" style={{ display: 'grid', gap: 14, maxWidth: 680 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Update channel</div>
          <div className="muted" style={{ fontSize: 13 }}>
            Which releases ShotCaller offers you.
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {CHANNELS.map((c) => {
            const selected = settings?.channel === c.id;
            return (
              <button
                key={c.id}
                onClick={() => void pickChannel(c.id)}
                aria-pressed={selected}
                style={{
                  textAlign: 'left',
                  padding: 14,
                  borderRadius: 10,
                  background: selected ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <div style={{ fontWeight: 700 }}>{c.title}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {c.description}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <UpdateStatus state={update} info={info} />
          <button className="btn" onClick={() => void window.shotcaller.checkForUpdates()} disabled={update.status === 'checking'}>
            Check for updates
          </button>
        </div>
      </section>

      <section className="card enter" style={{ display: 'grid', gap: 6, maxWidth: 680, marginTop: 14 }}>
        <div style={{ fontWeight: 700 }}>About</div>
        <div className="muted" style={{ fontSize: 13 }}>
          ShotCaller {info ? `v${info.version}` : ''} · MIT licensed · github.com/Battlebornplayz/ShotCaller
        </div>
      </section>
    </>
  );
}
