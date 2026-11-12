import type { ReactNode } from 'react';
import type { LibraryGame, RunningGame } from '../../shared/types';
import { useDetection, useLibrary } from '../hooks/useLive';
import { gameColor, gameInitials } from './GameRail';
import { Art, coverSources } from './hub/art';
import { ago, formatPlaytime, play } from './games/common';
import { TitleCard } from './games/GamesPage';

export { SettingsPage } from './SettingsPage';
export { ProfilePage } from './AccountPage';
export { GamesPage } from './games/GamesPage';
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
      <ContinuePlaying onOpenGame={onOpenGame} />
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

/** Home's "Continue playing" strip: the last 4 games, each with Play (L-Q61). */
function ContinuePlaying({ onOpenGame }: { onOpenGame: (key: string) => void }) {
  const library = useLibrary();
  const recent = (library?.games ?? [])
    .filter((g) => g.installed && g.lastPlayed && !g.hidden && !g.isTool)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, 4);
  if (!recent.length) return null;
  return (
    <section style={{ marginBottom: 18 }}>
      <div className="section-label" style={{ marginBottom: 10 }}>
        Continue playing
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
        {recent.map((g) => (
          <div key={g.key} className="card hover-lift enter" style={{ padding: 0, display: 'flex', overflow: 'hidden', alignItems: 'stretch' }}>
            <button onClick={() => onOpenGame(g.key)} style={{ width: 72, flex: 'none', aspectRatio: '2 / 3', padding: 0, background: '#121330' }}>
              <Art sources={coverSources(g)} style={{ width: '100%', height: '100%' }} fallback={<TitleCard game={g} />} />
            </button>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0, flex: 1 }}>
              <button onClick={() => onOpenGame(g.key)} style={{ textAlign: 'left', padding: 0 }}>
                <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {formatPlaytime(g.playMinutes) ?? 'Played'} · {ago(g.lastPlayed!)}
                </div>
              </button>
              <button className="btn primary small" style={{ alignSelf: 'flex-start' }} onClick={() => void play(g)}>
                ▶ Play
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FriendsPage() {
  return <ComingSoon title="Friends" subtitle="Friends list, activity feed and shared hunts." phase="Phase 10" />;
}
