import type { ReactNode } from 'react';
import type { LibraryGame, RunningGame } from '../../shared/types';
import { useDetection } from '../hooks/useLive';
import { gameColor, gameInitials } from './GameRail';

export { SettingsPage } from './SettingsPage';
export { ProfilePage } from './AccountPage';
export { LibraryPage } from './hub/LibraryPage';
export { GamePage } from './hub/GamePage';
export { TimelinePage } from './hub/TimelinePage';

export function PageHeader({ title, subtitle, badge, actions }: { title: string; subtitle: string; badge?: string; actions?: ReactNode }) {
  return (
    <header className="enter" style={{ marginBottom: 22, display: 'flex', alignItems: 'flex-end', gap: 16 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{title}</h1>
          {badge && <span className="pill muted">{badge}</span>}
        </div>
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {subtitle}
        </p>
      </div>
      {actions}
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

export function since(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function GameTile({ game, size = 44 }: { game: LibraryGame; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        background: gameColor(game),
        fontWeight: 800,
        fontSize: size * 0.32,
        color: '#fff',
      }}
    >
      {gameInitials(game)}
    </div>
  );
}

function PlayingNow({ running, onOpenGame }: { running: RunningGame[]; onOpenGame: (key: string) => void }) {
  if (running.length === 0) {
    return (
      <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>
        No game running. Launch one and it shows up here.
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      {running.map((r) => (
        <button key={r.key} onClick={() => onOpenGame(r.key)} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="dot-live" />
          <span style={{ fontWeight: 700 }}>{r.name}</span>
          <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
            {since(r.since)}
          </span>
        </button>
      ))}
    </div>
  );
}

export function HomePage({ onOpenGame }: { onOpenGame: (key: string) => void }) {
  const detection = useDetection();
  const widgets = ['Closest to unlock', 'Recent unlocks', 'Your stats', 'Weekly challenge'];
  return (
    <>
      <PageHeader title="Home" subtitle="Playing now, closest unlocks and your recent wins." badge="Phase 6" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        <div className="card enter" style={{ minHeight: 130 }}>
          <div className="section-label">Playing now</div>
          <PlayingNow running={detection?.running ?? []} onOpenGame={onOpenGame} />
        </div>
        {widgets.map((label, i) => (
          <div key={label} className="card enter" style={{ animationDelay: `${(i + 1) * 60}ms`, minHeight: 130 }}>
            <div className="section-label">{label}</div>
            <div className="muted" style={{ marginTop: 22, fontSize: 13 }}>
              Widget data arrives in Phase 6.
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function FriendsPage() {
  return <ComingSoon title="Friends" subtitle="Friends list, activity feed and shared hunts." phase="Phase 10" />;
}
