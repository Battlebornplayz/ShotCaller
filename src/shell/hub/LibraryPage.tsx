import { useMemo, useState } from 'react';
import type { GameSource, GameSummary, LibraryGame, LibraryView } from '../../../shared/types';
import { Ring } from '../../components/achievements';
import { useDetection, useHub, useLibrary, useSettings } from '../../hooks/useLive';
import { GameTile, PageHeader } from '../pages';
import { Art, bannerSources, coverSources } from './art';

export const SOURCE_LABEL: Record<GameSource, string> = {
  module: 'Supported',
  steam: 'Steam',
  manual: 'Added by you',
  anker: 'Anker Games',
  emulator: 'Found on this PC',
};

type Filter = 'all' | 'achievements' | 'installed';
type Sort = 'name' | 'completion' | 'recent';

export function LibraryPage({ onOpenGame }: { onOpenGame: (key: string) => void }) {
  const library = useLibrary();
  const detection = useDetection();
  const hub = useHub();
  const settings = useSettings();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('achievements');
  const [sort, setSort] = useState<Sort>('recent');
  const [scanning, setScanning] = useState(false);
  const view: LibraryView = settings?.libraryView ?? 'grid';
  const runningKeys = new Set(detection?.running.map((r) => r.key));
  const summaries = useMemo(() => hub?.summaries ?? {}, [hub]);

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (library?.games ?? []).filter((g) => {
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (filter === 'achievements') return !!summaries[g.key]?.total;
      if (filter === 'installed') return g.installed;
      return true;
    });
    const pct = (g: LibraryGame) => {
      const s = summaries[g.key];
      return s?.total ? s.unlocked / s.total : -1;
    };
    if (sort === 'completion') list.sort((a, b) => pct(b) - pct(a) || a.name.localeCompare(b.name));
    else if (sort === 'recent') list.sort((a, b) => (summaries[b.key]?.lastUnlockAt ?? 0) - (summaries[a.key]?.lastUnlockAt ?? 0) || a.name.localeCompare(b.name));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [library, query, filter, sort, summaries]);

  const rescan = async () => {
    setScanning(true);
    try {
      await window.shotcaller.importSteam();
    } finally {
      setScanning(false);
    }
  };

  const all = library?.games ?? [];
  const tracked = all.filter((g) => summaries[g.key]?.total).length;
  const steam = library?.steam;
  const subtitle = !library
    ? 'Reading your library…'
    : steam?.error
      ? `Steam import failed: ${steam.error}`
      : `${all.length} games · ${tracked} with achievements${hub?.steamUser ? ` · Steam: ${hub.steamUser.persona}` : steam?.found ? '' : ' · Steam not found'}`;

  return (
    <>
      <PageHeader
        title="Library"
        subtitle={subtitle}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => void rescan()} disabled={scanning}>
              {scanning ? <span className="spinner" /> : null} Rescan
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

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input type="search" placeholder="Search your games" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 260 }} />
        <div className="segmented">
          {(
            [
              ['achievements', 'With achievements'],
              ['installed', 'Installed'],
              ['all', 'All'],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label}
            </button>
          ))}
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="recent">Recently unlocked</option>
          <option value="completion">Completion</option>
          <option value="name">Name</option>
        </select>
        <div className="segmented" style={{ marginLeft: 'auto' }}>
          {(['grid', 'list'] as LibraryView[]).map((v) => (
            <button key={v} aria-pressed={view === v} onClick={() => void window.shotcaller.updateSettings({ libraryView: v })}>
              {v === 'grid' ? 'Covers' : 'List'}
            </button>
          ))}
        </div>
      </div>

      {games.length === 0 && (
        <div className="card muted">
          {query ? 'No games match that search.' : filter === 'achievements' ? 'No games with achievements yet. Play a Steam game once, or link a game to its Steam list from its page.' : 'No games yet.'}
        </div>
      )}

      {view === 'grid' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
          {games.map((g) => (
            <CoverCard key={g.key} game={g} summary={summaries[g.key]} running={runningKeys.has(g.key)} onOpen={() => onOpenGame(g.key)} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {games.map((g) => (
            <BannerRow key={g.key} game={g} summary={summaries[g.key]} running={runningKeys.has(g.key)} onOpen={() => onOpenGame(g.key)} />
          ))}
        </div>
      )}
    </>
  );
}

function CoverFallback({ game }: { game: LibraryGame }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg, #22244a, #121330)' }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: 12, textAlign: 'center' }}>
        <GameTile game={game} size={56} />
        <div style={{ fontWeight: 700, fontSize: 13 }}>{game.name}</div>
      </div>
    </div>
  );
}

function CoverCard({ game, summary, running, onOpen }: { game: LibraryGame; summary?: GameSummary; running: boolean; onOpen: () => void }) {
  const pct = summary?.total ? summary.unlocked / summary.total : null;
  return (
    <button onClick={onOpen} className="hover-lift" style={{ textAlign: 'left', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card)', overflow: 'hidden', padding: 0 }}>
      <div style={{ position: 'relative', aspectRatio: '2 / 3', background: '#121330' }}>
        <Art sources={coverSources(game)} style={{ width: '100%', height: '100%' }} fallback={<CoverFallback game={game} />} />
        {pct !== null && (
          <div style={{ position: 'absolute', right: 8, bottom: 8 }}>
            <Ring value={pct} size={46} />
          </div>
        )}
        {running && (
          <span className="pill green" style={{ position: 'absolute', left: 8, top: 8, background: 'rgba(9,10,24,0.85)' }}>
            ● Playing
          </span>
        )}
      </div>
      <div style={{ padding: '9px 11px 11px' }}>
        <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.name}</div>
        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
          {summary?.total ? `${summary.unlocked} / ${summary.total}` : SOURCE_LABEL[game.source]}
          {summary?.total ? ` · ${SOURCE_LABEL[game.source]}` : ''}
        </div>
      </div>
    </button>
  );
}

function BannerRow({ game, summary, running, onOpen }: { game: LibraryGame; summary?: GameSummary; running: boolean; onOpen: () => void }) {
  const pct = summary?.total ? summary.unlocked / summary.total : null;
  return (
    <button
      onClick={onOpen}
      className="card hover-lift"
      style={{ padding: 0, display: 'flex', alignItems: 'center', gap: 16, textAlign: 'left', overflow: 'hidden', minHeight: 72 }}
    >
      <div style={{ width: 184, height: 72, flex: 'none', background: '#121330' }}>
        <Art
          sources={bannerSources(game)}
          style={{ width: 184, height: 72 }}
          fallback={
            <div style={{ width: 184, height: 72, display: 'grid', placeItems: 'center' }}>
              <GameTile game={game} size={40} />
            </div>
          }
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{game.name}</span>
          {running && <span className="pill green">Playing</span>}
          {game.moduleId && <span className="pill">Overlay</span>}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {SOURCE_LABEL[game.source]}
          {!game.installed && game.source !== 'module' ? ' · not installed' : ''}
        </div>
      </div>
      <div style={{ width: 240, flex: 'none', paddingRight: 18 }}>
        {pct !== null ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span className="muted">
                {summary!.unlocked} / {summary!.total}
              </span>
              <span style={{ fontWeight: 700, color: pct >= 1 ? 'var(--gold)' : undefined }}>{Math.round(pct * 100)}%</span>
            </div>
            <div className="progress">
              <span style={{ width: `${pct * 100}%`, background: pct >= 1 ? 'var(--gold)' : undefined }} />
            </div>
          </>
        ) : (
          <span className="muted" style={{ fontSize: 12 }}>
            No achievement list
          </span>
        )}
      </div>
    </button>
  );
}
