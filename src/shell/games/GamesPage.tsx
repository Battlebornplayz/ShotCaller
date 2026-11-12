import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameSource, GameSummary, Library, LibraryGame, StoreId } from '../../../shared/types';
import { Ring } from '../../components/achievements';
import { useDetection, useHub, useLibrary } from '../../hooks/useLive';
import { GameTile } from '../pages';
import { Art, coverSources } from '../hub/art';
import { formatPlaytime, formatSize, mainSource, play, SOURCE_LABEL, StoreBadge, TextPrompt, toast, Confirm, Modal } from './common';
import { useGameMenu } from './gameMenu';

/**
 * The Games tab (Phase L1): a GOG Galaxy-style list on the left (All games, Installed, each store,
 * More, collections, Tools, Hidden) and a cover grid on the right.
 */

type Sort = 'recent' | 'name' | 'playtime' | 'completion' | 'added' | 'size';
const SORT_LABEL: Record<Sort, string> = {
  recent: 'Recently played',
  name: 'Name',
  playtime: 'Playtime',
  completion: 'Achievements done',
  added: 'Recently added',
  size: 'Install size',
};

interface Filters {
  installed: boolean;
  achievements: boolean;
  overlay: boolean;
  genre: string;
}
const NO_FILTERS: Filters = { installed: false, achievements: false, overlay: false, genre: '' };

const RECENT_DAYS = 14;

// Small per-window preferences.
function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(`sc.games.${key}`);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(`sc.games.${key}`, JSON.stringify(next));
    } catch {
      // storage off
    }
  };
  return [v, set];
}

const STORES: { id: StoreId; source: GameSource }[] = [
  { id: 'steam', source: 'steam' },
  { id: 'epic', source: 'epic' },
  { id: 'xbox', source: 'xbox' },
];
const MORE: GameSource[] = ['anker', 'manual', 'emulator'];

const inSource = (g: LibraryGame, s: GameSource) => (g.copies ?? [{ source: g.source }]).some((c) => c.source === s);

/** Which games a left-list entry shows. */
function matchesView(g: LibraryGame, view: string, lib: Library): boolean {
  if (view === 'hidden') return !!g.hidden;
  if (g.hidden) return false;
  if (view === 'tools') return !!g.isTool;
  if (g.isTool) return false;
  if (view === 'all') return true;
  if (view === 'installed') return g.installed;
  if (view === 'favourites') return !!g.pinned;
  if (view.startsWith('src:')) return inSource(g, view.slice(4) as GameSource);
  if (view.startsWith('col:')) return !!lib.collections.find((c) => c.id === view.slice(4))?.keys.includes(g.key);
  return true;
}

export function GamesPage({ onOpenGame }: { onOpenGame: (key: string) => void }) {
  const library = useLibrary();
  const detection = useDetection();
  const hub = useHub();
  const [view, setView] = usePref('view', 'all');
  const [sort, setSort] = usePref<Sort>('sort', 'recent');
  const [size, setSize] = usePref('coverSize', 160);
  const [folded, setFolded] = usePref('folded', false);
  const [summarySeen, setSummarySeen] = usePref('summarySeen', false);
  const [query, setQuery] = useState('');
  const [openedAt] = useState(() => Date.now());
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [newCollection, setNewCollection] = useState(false);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const menu = useGameMenu(library?.collections ?? []);
  const summaries = useMemo(() => hub?.summaries ?? {}, [hub]);
  const runningKeys = useMemo(() => new Set(detection?.running.map((r) => r.key)), [detection]);

  const all = useMemo(() => library?.games ?? [], [library]);
  const genres = useMemo(() => [...new Set(all.flatMap((g) => g.genres ?? []))].sort(), [all]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!library) return c;
    const views = ['all', 'installed', 'favourites', 'tools', 'hidden', ...STORES.map((s) => `src:${s.source}`), ...MORE.map((m) => `src:${m}`), ...library.collections.map((x) => `col:${x.id}`)];
    for (const v of views) c[v] = all.filter((g) => matchesView(g, v, library)).length;
    return c;
  }, [all, library]);

  const filtering = !!query.trim() || JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);

  const list = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    const out = all.filter((g) => {
      if (!matchesView(g, view, library)) return false;
      if (q && !g.name.toLowerCase().includes(q)) return false;
      if (filters.installed && !g.installed) return false;
      if (filters.achievements && !summaries[g.key]?.total) return false;
      if (filters.overlay && !g.moduleId) return false;
      if (filters.genre && !g.genres?.includes(filters.genre)) return false;
      return true;
    });
    const pct = (g: LibraryGame) => {
      const s = summaries[g.key];
      return s?.total ? s.unlocked / s.total : -1;
    };
    const by: Record<Sort, (a: LibraryGame, b: LibraryGame) => number> = {
      recent: (a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || Number(b.installed) - Number(a.installed),
      name: () => 0,
      playtime: (a, b) => (b.playMinutes ?? 0) - (a.playMinutes ?? 0),
      completion: (a, b) => pct(b) - pct(a),
      added: (a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0),
      size: (a, b) => (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0),
    };
    return out.sort((a, b) => by[sort](a, b) || a.name.localeCompare(b.name));
  }, [all, library, view, query, filters, sort, summaries]);

  const rows = useMemo(() => {
    if (view !== 'all' || filtering) return [];
    const visible = all.filter((g) => !g.hidden && !g.isTool);
    const cutoff = openedAt - RECENT_DAYS * 86400000;
    return [
      {
        title: 'Continue playing',
        games: visible
          .filter((g) => g.installed && g.lastPlayed)
          .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
          .slice(0, 12),
      },
      { title: 'Favourites', games: visible.filter((g) => g.pinned) },
      {
        title: 'Recently added',
        games: visible.filter((g) => (g.addedAt ?? 0) > cutoff).sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0)),
      },
    ].filter((r) => r.games.length);
  }, [all, view, filtering, openedAt]);

  const rescan = async () => {
    setScanning(true);
    try {
      const lib = await window.shotcaller.importSteam();
      toast(`Found ${lib.games.filter((g) => g.installed && !g.isTool).length} installed games`);
    } finally {
      setScanning(false);
    }
  };

  const card = (g: LibraryGame, w: number) => (
    <GameCard
      key={g.key}
      game={g}
      width={w}
      summary={summaries[g.key]}
      running={runningKeys.has(g.key)}
      onOpen={() => onOpenGame(g.key)}
      onMenu={(e) => menu.open(e, g)}
    />
  );

  const viewTitle = (() => {
    if (view === 'all') return 'All games';
    if (view === 'installed') return 'Installed';
    if (view === 'favourites') return 'Favourites';
    if (view === 'tools') return 'Tools';
    if (view === 'hidden') return 'Hidden';
    if (view.startsWith('src:')) return SOURCE_LABEL[view.slice(4) as GameSource];
    return library?.collections.find((c) => `col:${c.id}` === view)?.name ?? 'Games';
  })();

  return (
    <div className="games-page">
      <aside className={`games-list${folded ? ' folded' : ''}`}>
        <button className="games-fold" onClick={() => setFolded(!folded)} title={folded ? 'Show names' : 'Fold to icons'}>
          {folded ? '»' : '«'}
        </button>
        <ListEntry id="all" icon={<Glyph>▦</Glyph>} label="All games" count={counts.all} view={view} folded={folded} onPick={setView} />
        <ListEntry id="installed" icon={<Glyph>⬇</Glyph>} label="Installed" count={counts.installed} view={view} folded={folded} onPick={setView} />
        <ListEntry id="favourites" icon={<Glyph>★</Glyph>} label="Favourites" count={counts.favourites} view={view} folded={folded} onPick={setView} />
        <ListHeading folded={folded}>Stores</ListHeading>
        {STORES.map((s) => (
          <ListEntry
            key={s.id}
            id={`src:${s.source}`}
            icon={<StoreBadge source={s.source} size={18} />}
            label={SOURCE_LABEL[s.source]}
            count={counts[`src:${s.source}`]}
            dim={!library?.stores.find((x) => x.id === s.id)?.found}
            view={view}
            folded={folded}
            onPick={setView}
          />
        ))}
        <ListHeading folded={folded}>More</ListHeading>
        {MORE.filter((m) => counts[`src:${m}`] || m === 'manual').map((m) => (
          <ListEntry key={m} id={`src:${m}`} icon={<StoreBadge source={m} size={18} />} label={SOURCE_LABEL[m]} count={counts[`src:${m}`]} view={view} folded={folded} onPick={setView} />
        ))}
        <ListHeading folded={folded}>Collections</ListHeading>
        {library?.collections.map((c) => (
          <ListEntry
            key={c.id}
            id={`col:${c.id}`}
            icon={<Glyph>{c.name.slice(0, 1).toUpperCase()}</Glyph>}
            label={c.name}
            count={counts[`col:${c.id}`]}
            view={view}
            folded={folded}
            onPick={setView}
            onContext={() => setRenaming({ id: c.id, name: c.name })}
            onDelete={() => setDeleting({ id: c.id, name: c.name })}
          />
        ))}
        <button className="games-entry add" onClick={() => setNewCollection(true)} title="New collection">
          <Glyph>+</Glyph>
          {!folded && <span>New collection</span>}
        </button>
        <div style={{ flex: 1 }} />
        <ListEntry id="tools" icon={<Glyph>⚙</Glyph>} label="Tools" count={counts.tools} view={view} folded={folded} onPick={setView} />
        <ListEntry id="hidden" icon={<Glyph>◌</Glyph>} label="Hidden" count={counts.hidden} view={view} folded={folded} onPick={setView} />
      </aside>

      <div className="games-main">
        <div className="games-top">
          <div style={{ fontSize: 20, fontWeight: 800, marginRight: 6, whiteSpace: 'nowrap' }}>{viewTitle}</div>
          <input type="search" placeholder="Search your games" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 220 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
          <div style={{ position: 'relative' }}>
            <button className={`btn small${filtering && !query ? ' on' : ''}`} onClick={() => setShowFilters(!showFilters)}>
              Filters{JSON.stringify(filters) !== JSON.stringify(NO_FILTERS) ? ' •' : ''}
            </button>
            {showFilters && <FilterPanel filters={filters} genres={genres} onChange={setFilters} onClose={() => setShowFilters(false)} />}
          </div>
          <div style={{ flex: 1 }} />
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }} title="Card size">
            ▫
            <input type="range" min={110} max={240} value={size} onChange={(e) => setSize(Number(e.target.value))} style={{ width: 90 }} />▢
          </label>
          <button className="btn small" onClick={() => void rescan()} disabled={scanning} title="Look for new and removed games">
            {scanning ? <span className="spinner" /> : '⟳'} Refresh
          </button>
          <button
            className="btn small primary"
            onClick={async () => {
              const g = await window.shotcaller.addGameManually();
              if (g) onOpenGame(g.key);
            }}
          >
            + Add a game
          </button>
        </div>

        <div className="games-scroll">
          {rows.map((r) => (
            <section key={r.title} style={{ marginBottom: 22 }}>
              <div className="section-label" style={{ marginBottom: 10 }}>
                {r.title}
              </div>
              <div className="games-row">{r.games.map((g) => card(g, Math.max(110, size - 30)))}</div>
            </section>
          ))}
          {rows.length > 0 && (
            <div className="section-label" style={{ marginBottom: 10 }}>
              All games
            </div>
          )}
          {!library ? (
            <div className="muted">Reading your games…</div>
          ) : list.length === 0 ? (
            <div className="card muted">{emptyText(view, filtering)}</div>
          ) : (
            <div className="games-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))` }}>
              {list.map((g) => card(g, size))}
            </div>
          )}
        </div>
      </div>

      {menu.node}
      {library && !summarySeen && library.scannedAt && <ScanSummary library={library} onClose={() => setSummarySeen(true)} />}
      {newCollection && (
        <TextPrompt
          title="New collection"
          placeholder="e.g. Play with friends"
          okLabel="Create"
          onDone={(name) => {
            setNewCollection(false);
            if (name?.trim()) void window.shotcaller.collection({ op: 'create', name });
          }}
        />
      )}
      {renaming && (
        <TextPrompt
          title="Rename collection"
          initial={renaming.name}
          onDone={(name) => {
            const id = renaming.id;
            setRenaming(null);
            if (name?.trim()) void window.shotcaller.collection({ op: 'rename', id, name });
          }}
        />
      )}
      {deleting && (
        <Confirm
          title={`Delete “${deleting.name}”?`}
          body="The games stay in your library; only the collection goes."
          okLabel="Delete"
          danger
          onDone={(ok) => {
            const id = deleting.id;
            setDeleting(null);
            if (ok) {
              if (view === `col:${id}`) setView('all');
              void window.shotcaller.collection({ op: 'delete', id });
            }
          }}
        />
      )}
    </div>
  );
}

function emptyText(view: string, filtering: boolean): string {
  if (filtering) return 'No games match. Try clearing the search or filters.';
  if (view === 'hidden') return 'Nothing hidden. Right-click a game and pick Hide to tuck it away here.';
  if (view === 'tools') return 'No tools. Software like Wallpaper Engine lands here on its own.';
  if (view === 'favourites') return 'No favourites yet. Right-click a game and pick Add to favourites.';
  if (view.startsWith('col:')) return 'This collection is empty. Right-click any game and add it here.';
  if (view === 'src:manual') return 'Use “+ Add a game” to add any game by its .exe.';
  return 'No games here.';
}

function Glyph({ children }: { children: ReactNode }) {
  return <span className="games-glyph">{children}</span>;
}

function ListHeading({ children, folded }: { children: ReactNode; folded: boolean }) {
  return folded ? <div className="games-sep" /> : <div className="games-heading">{children}</div>;
}

function ListEntry({
  id,
  icon,
  label,
  count,
  view,
  folded,
  dim,
  onPick,
  onContext,
  onDelete,
}: {
  id: string;
  icon: ReactNode;
  label: string;
  count?: number;
  view: string;
  folded: boolean;
  dim?: boolean;
  onPick: (id: string) => void;
  onContext?: () => void;
  onDelete?: () => void;
}) {
  return (
    <button
      className="games-entry"
      aria-current={view === id ? 'page' : undefined}
      onClick={() => onPick(id)}
      onContextMenu={(e) => {
        if (!onContext) return;
        e.preventDefault();
        onContext();
      }}
      title={folded ? `${label} (${count ?? 0})` : onContext ? 'Right-click to rename' : undefined}
      style={dim ? { opacity: 0.5 } : undefined}
    >
      {icon}
      {!folded && (
        <>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          {onDelete && (
            <span
              className="games-entry-x"
              title="Delete collection"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
            >
              ×
            </span>
          )}
          <span className="games-count">{count ?? 0}</span>
        </>
      )}
    </button>
  );
}

function FilterPanel({ filters, genres, onChange, onClose }: { filters: Filters; genres: string[]; onChange: (f: Filters) => void; onClose: () => void }) {
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.('.filter-panel, .btn')) onClose();
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);
  const box = (key: 'installed' | 'achievements' | 'overlay', label: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="checkbox" checked={filters[key]} onChange={(e) => onChange({ ...filters, [key]: e.target.checked })} />
      {label}
    </label>
  );
  return (
    <div className="filter-panel card">
      {box('installed', 'Installed only')}
      {box('achievements', 'Has achievements')}
      {box('overlay', 'Has a ShotCaller overlay')}
      <label style={{ display: 'grid', gap: 4 }}>
        <span className="section-label">Genre</span>
        <select value={filters.genre} onChange={(e) => onChange({ ...filters, genre: e.target.value })}>
          <option value="">Any genre</option>
          {genres.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <button className="btn small" onClick={() => onChange(NO_FILTERS)}>
        Clear filters
      </button>
    </div>
  );
}

// ---------- Cards ----------

export function TitleCard({ game }: { game: LibraryGame }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'linear-gradient(160deg, #22244a, #121330)' }}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 10, padding: 12, textAlign: 'center' }}>
        {game.icon ? <img src={game.icon} alt="" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'cover' }} /> : <GameTile game={game} size={56} />}
        <div style={{ fontWeight: 700, fontSize: 13 }}>{game.name}</div>
      </div>
    </div>
  );
}

export function GameCard({
  game,
  width,
  summary,
  running,
  onOpen,
  onMenu,
}: {
  game: LibraryGame;
  width: number;
  summary?: GameSummary;
  running: boolean;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  const pct = summary?.total ? summary.unlocked / summary.total : null;
  const meta = [formatPlaytime(game.playMinutes), formatSize(game.sizeBytes)].filter(Boolean).join(' · ');
  const style: CSSProperties = { width: '100%', minWidth: width, maxWidth: width * 1.6 };
  return (
    <div className={`game-card${game.installed ? '' : ' faded'}`} style={style} onContextMenu={onMenu}>
      <button className="game-card-art" onClick={onOpen} aria-label={game.name}>
        <Art sources={coverSources(game)} style={{ width: '100%', height: '100%' }} fallback={<TitleCard game={game} />} />
        <span style={{ position: 'absolute', left: 8, top: 8 }}>
          <StoreBadge source={mainSource(game)} />
        </span>
        {(game.copies?.filter((c) => c.source !== 'module').length ?? 0) > 1 && (
          <span className="pill muted card-chip" style={{ left: 32, top: 8 }} title={game.copies!.map((c) => SOURCE_LABEL[c.source]).join(', ')}>
            +{game.copies!.filter((c) => c.source !== 'module').length - 1}
          </span>
        )}
        {game.updateAvailable && (
          <span className="pill gold card-chip" style={{ right: 8, top: 8 }}>
            Update
          </span>
        )}
        {running && (
          <span className="pill green card-chip" style={{ right: 8, top: game.updateAvailable ? 34 : 8 }}>
            ● Playing
          </span>
        )}
        {pct !== null && (
          <span style={{ position: 'absolute', right: 8, bottom: 8 }}>
            <Ring value={pct} size={40} />
          </span>
        )}
      </button>
      {game.installed ? (
        <button
          className="game-card-play"
          onClick={(e) => {
            e.stopPropagation();
            void play(game);
          }}
        >
          ▶ Play
        </button>
      ) : game.copies?.some((c) => c.source === 'steam') ? (
        <button
          className="game-card-play install"
          onClick={(e) => {
            e.stopPropagation();
            void window.shotcaller.installGame(game.key);
          }}
        >
          ⬇ Install
        </button>
      ) : null}
      <button className="game-card-text" onClick={onOpen}>
        <div className="game-card-name">{game.name}</div>
        <div className="muted" style={{ fontSize: 11, minHeight: 15 }}>
          {meta || (game.installed ? SOURCE_LABEL[mainSource(game)] : game.owned ? 'Owned · not installed' : 'Not installed')}
        </div>
      </button>
    </div>
  );
}

// ---------- First open ----------

function ScanSummary({ library, onClose }: { library: Library; onClose: () => void }) {
  const games = library.games.filter((g) => g.installed && !g.isTool);
  const found = library.stores.filter((s) => s.found);
  return (
    <Modal onClose={onClose} wide>
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <div className="eyebrow">Games tab</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>
            Found {games.length} game{games.length === 1 ? '' : 's'} in {found.length} store{found.length === 1 ? '' : 's'}
          </div>
          <div className="muted">ShotCaller reads your stores’ own files on this PC. No sign-in, and it never changes anything in them.</div>
        </div>
        <StoreList library={library} />
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={onClose}>
            Show my games
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Found / Not found per store, with Pick folder. Also used in Settings. */
export function StoreList({ library }: { library: Library }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {library.stores.map((s) => {
        const src = STORES.find((x) => x.id === s.id)!.source;
        return (
          <div key={s.id} className="tile" style={{ padding: '10px 12px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <StoreBadge source={src} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 700 }}>{s.name}</span>
                {s.found ? <span className="pill green">Found · {s.count}</span> : <span className="pill muted">Not found</span>}
                {s.custom && <span className="pill muted">Your folder</span>}
              </div>
              {s.path && (
                <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.path}>
                  {s.path}
                </div>
              )}
              {s.note && (
                <div className="muted" style={{ fontSize: 12 }}>
                  {s.note}
                </div>
              )}
            </div>
            {s.canPick && (
              <div style={{ display: 'flex', gap: 6 }}>
                {s.custom && (
                  <button className="btn small" onClick={() => void window.shotcaller.setStorePath(s.id, true)}>
                    Reset
                  </button>
                )}
                <button className="btn small" onClick={() => void window.shotcaller.setStorePath(s.id, false)}>
                  Pick folder
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
