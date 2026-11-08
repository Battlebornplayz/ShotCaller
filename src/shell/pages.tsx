import { useMemo, useState, type ReactNode } from 'react';
import { moduleById } from '../../games';
import { steamHeaderArt } from '../../games/types';
import type { LibraryGame, RunningGame } from '../../shared/types';
import { useDetection, useLibrary, useOverlayState } from '../hooks/useLive';
import { gameColor, gameInitials } from './GameRail';

export { SettingsPage } from './SettingsPage';
export { ProfilePage } from './AccountPage';

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

function since(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

function GameTile({ game, size = 44 }: { game: LibraryGame; size?: number }) {
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

const SOURCE_LABEL: Record<LibraryGame['source'], string> = { module: 'Supported', steam: 'Steam', manual: 'Added by you' };

export function LibraryPage({ onOpenGame }: { onOpenGame: (key: string) => void }) {
  const library = useLibrary();
  const detection = useDetection();
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState(false);
  const runningKeys = new Set(detection?.running.map((r) => r.key));

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (library?.games ?? []).filter((g) => !q || g.name.toLowerCase().includes(q));
  }, [library, query]);

  const rescan = async () => {
    setScanning(true);
    try {
      await window.shotcaller.importSteam();
    } finally {
      setScanning(false);
    }
  };

  const steam = library?.steam;
  const steamLine = !steam
    ? 'Reading your library…'
    : steam.error
      ? `Steam import failed: ${steam.error}`
      : !steam.found
        ? 'Steam wasn’t found on this PC. You can still add games by hand.'
        : `${library?.games.filter((g) => g.source === 'steam').length ?? 0} Steam games from ${steam.libraryFolders.length} library folder${steam.libraryFolders.length === 1 ? '' : 's'}.`;

  return (
    <>
      <PageHeader
        title="Library"
        subtitle={steamLine}
        badge="Achievements in Phase 5"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => void rescan()} disabled={scanning}>
              {scanning ? <span className="spinner" /> : null} Rescan Steam
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                const g = await window.shotcaller.addGameManually();
                if (g) onOpenGame(g.key);
              }}
            >
              + Add a game
            </button>
          </div>
        }
      />

      <input
        type="search"
        placeholder="Search your games"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%', maxWidth: 360, marginBottom: 14 }}
      />

      <div className="card enter" style={{ padding: 6 }}>
        {games.length === 0 && (
          <div className="muted" style={{ padding: 14 }}>
            {query ? 'No games match that search.' : 'No games yet.'}
          </div>
        )}
        {games.map((g) => (
          <div
            key={g.key}
            className="row"
            style={{ padding: '8px 10px', borderRadius: 10, cursor: 'pointer' }}
            onClick={() => onOpenGame(g.key)}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <GameTile game={g} size={36} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {SOURCE_LABEL[g.source]}
                  {g.steamAppId ? ` · app ${g.steamAppId}` : ''}
                  {!g.installed && g.source !== 'module' ? ' · not installed' : ''}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              {runningKeys.has(g.key) && <span className="pill green">Running</span>}
              {g.moduleId && <span className="pill">Overlay</span>}
              <button
                className="pill muted"
                title={g.pinned ? 'Remove from the sidebar' : 'Show in the sidebar'}
                onClick={(e) => {
                  e.stopPropagation();
                  void window.shotcaller.setGamePinned(g.key, !g.pinned);
                }}
                style={{ cursor: 'pointer', visibility: g.moduleId ? 'hidden' : 'visible' }}
              >
                {g.pinned ? 'Pinned' : 'Pin'}
              </button>
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

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div style={{ marginTop: 4, fontWeight: 600, wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

const VIA_LABEL: Record<RunningGame['via'], string> = {
  steam: 'Steam reports it running',
  process: 'Game process found',
  folder: 'Process running from its install folder',
};

export function GamePage({ game }: { game: LibraryGame }) {
  const detection = useDetection();
  const overlay = useOverlayState();
  const running = detection?.running.find((r) => r.key === game.key);
  const mod = moduleById(game.moduleId);
  const art = mod.headerArt ?? (game.steamAppId ? steamHeaderArt(game.steamAppId) : null);
  const [artOk, setArtOk] = useState(true);

  return (
    <>
      <div
        className="card enter"
        style={{ padding: 0, overflow: 'hidden', marginBottom: 18, display: 'flex', alignItems: 'stretch', minHeight: 140 }}
      >
        {art && artOk ? (
          <img src={art} alt="" onError={() => setArtOk(false)} style={{ width: 300, objectFit: 'cover', flex: 'none' }} />
        ) : (
          <div style={{ width: 160, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.03)', flex: 'none' }}>
            <GameTile game={game} size={72} />
          </div>
        )}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{game.name}</h1>
            {running ? <span className="pill green">● Running · {since(running.since)}</span> : <span className="pill muted">Not running</span>}
            {game.moduleId && <span className="pill">ShotCaller module</span>}
          </div>
          <div className="muted">
            {game.moduleId
              ? 'The overlay opens automatically when this game launches.'
              : 'Achievement hub support. Turn on “Show the overlay for every game” in Settings to get the overlay here too.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button className="btn" onClick={() => void window.shotcaller.setOverlayPreview(!overlay?.preview)}>
              {overlay?.preview ? 'Close overlay preview' : 'Preview overlay'}
            </button>
            {game.source === 'manual' && (
              <button className="btn" onClick={() => void window.shotcaller.removeGame(game.key)}>
                Remove game
              </button>
            )}
            {game.source === 'steam' && !game.moduleId && (
              <button className="btn" onClick={() => void window.shotcaller.setGamePinned(game.key, !game.pinned)}>
                {game.pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="card enter" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        <Fact label="Source" value={SOURCE_LABEL[game.source]} />
        {game.steamAppId && <Fact label="Steam app" value={game.steamAppId} />}
        <Fact label="Detected by" value={running ? VIA_LABEL[running.via] : game.exeNames.length ? game.exeNames.join(', ') : game.steamAppId ? 'Steam app id / install folder' : '—'} />
        {game.installDir && <Fact label="Install folder" value={game.installDir} />}
        {game.exePath && <Fact label="Executable" value={game.exePath} />}
      </section>

      <div className="card enter" style={{ marginTop: 14 }}>
        <div className="muted">
          Achievements, playtime and sessions arrive with the achievement hub (Phase 5).
          {game.moduleId === 'skillshot-city' && ' Skill advisor and round tracker: Phases 7–8.'}
        </div>
      </div>
    </>
  );
}
