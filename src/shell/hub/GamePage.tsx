import { useMemo, useState, type ReactNode } from 'react';
import { rarityTier, type Achievement, type GameAchievements, type LibraryGame, type RunningGame, type SteamAppMatch } from '../../../shared/types';
import { AchIcon, formatDate, formatMinutes, RarityPill, Ring, TIER_COLOR } from '../../components/achievements';
import { useDetection, useHubQuery, useOverlayState } from '../../hooks/useLive';
import { GameTile, since } from '../pages';
import { Art, bannerSources } from './art';
import { SOURCE_LABEL } from './LibraryPage';

type Filter = 'all' | 'unlocked' | 'locked';
type Sort = 'easiest' | 'rarest' | 'recent' | 'name';

const open = (url: string) => void window.shotcaller.openExternal(url);
const search = (q: string) => open(`https://www.google.com/search?q=${encodeURIComponent(q)}`);

const VIA_LABEL: Record<RunningGame['via'], string> = {
  steam: 'Steam reports it running',
  process: 'Game process found',
  folder: 'Process running from its install folder',
};

const TRACKING_NOTE: Record<GameAchievements['tracking'], string> = {
  steam: 'Unlocks come straight from Steam on this PC and pop up within seconds.',
  emulator: 'Unlocks are read from the game’s local achievement file and pop up within seconds. You can also tick them by hand.',
  manual: 'Tick achievements off as you earn them.',
};

export function GamePage({ game }: { game: LibraryGame }) {
  const detection = useDetection();
  const overlay = useOverlayState();
  const running = detection?.running.find((r) => r.key === game.key);
  const { value: data, loading } = useHubQuery(() => window.shotcaller.getGameAchievements(game.key), [game.key, game.achievementAppId]);
  const appId = game.steamAppId ?? game.achievementAppId;
  const pct = data?.total ? data.unlocked / data.total : null;

  return (
    <>
      <div className="card enter" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, display: 'flex', alignItems: 'stretch', minHeight: 150 }}>
        <div style={{ width: 320, flex: 'none', background: '#121330' }}>
          <Art
            sources={bannerSources(game)}
            style={{ width: 320, height: '100%', minHeight: 150 }}
            fallback={
              <div style={{ width: 320, height: '100%', display: 'grid', placeItems: 'center' }}>
                <GameTile game={game} size={72} />
              </div>
            }
          />
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{game.name}</h1>
            {running ? <span className="pill green">● Running · {since(running.since)}</span> : <span className="pill muted">Not running</span>}
            <span className="pill muted">{SOURCE_LABEL[game.source]}</span>
            {game.moduleId && <span className="pill">ShotCaller module</span>}
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <Stat label="Achievements" value={data?.total ? `${data.unlocked} / ${data.total}` : '—'} />
            <Stat label="Playtime" value={formatMinutes(data?.playtimeMinutes ?? null)} />
            <Stat label="Last played" value={data?.lastPlayed ? formatDate(data.lastPlayed) : '—'} />
            <Stat label="Sessions" value={data ? String(data.sessions.length) : '—'} />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {appId && (
              <button className="btn" onClick={() => open(`https://steamcommunity.com/app/${appId}/guides/`)}>
                Steam guides ↗
              </button>
            )}
            <button className="btn" onClick={() => void window.shotcaller.setOverlayPreview(!overlay?.preview)}>
              {overlay?.preview ? 'Close overlay preview' : 'Preview overlay'}
            </button>
            {!game.moduleId && (
              <button className="btn" onClick={() => void window.shotcaller.setGamePinned(game.key, !game.pinned)}>
                {game.pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
              </button>
            )}
            {game.source === 'manual' && (
              <button className="btn" onClick={() => void window.shotcaller.removeGame(game.key)}>
                Remove game
              </button>
            )}
          </div>
        </div>
        {pct !== null && (
          <div style={{ display: 'grid', placeItems: 'center', padding: '0 26px' }}>
            <Ring value={pct} size={92} stroke={7} />
          </div>
        )}
      </div>

      {data?.tracking !== 'steam' && data && <ListSourceCard game={game} data={data} />}

      {loading && !data ? (
        <div className="card enter muted" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="spinner" /> Loading achievements…
        </div>
      ) : data ? (
        <AchievementList game={game} data={data} />
      ) : null}

      {data && data.sessions.length > 0 && <SessionsCard data={data} />}

      <section className="card enter" style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        <Fact label="Detected by" value={running ? VIA_LABEL[running.via] : game.exeNames.length ? game.exeNames.join(', ') : game.steamAppId ? 'Steam app id / install folder' : '—'} />
        {appId && <Fact label="Steam app" value={appId} />}
        {game.installDir && <Fact label="Install folder" value={game.installDir} />}
        {game.exePath && <Fact label="Executable" value={game.exePath} />}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div style={{ fontWeight: 800, fontSize: 18, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div style={{ marginTop: 4, fontWeight: 600, wordBreak: 'break-all' }}>{value}</div>
    </div>
  );
}

// ---------- Where the list comes from (non-Steam games) ----------

function ListSourceCard({ game, data }: { game: LibraryGame; data: GameAchievements }) {
  const [searching, setSearching] = useState(data.listSource === 'none' || data.listSource === 'custom');
  const [term, setTerm] = useState(game.name);
  const [results, setResults] = useState<SteamAppMatch[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canLink = game.source === 'manual' || game.source === 'anker';

  const runSearch = async () => {
    setBusy(true);
    try {
      setResults(await window.shotcaller.searchSteamApps(term));
    } finally {
      setBusy(false);
    }
  };

  const link = async (appId: number | null) => {
    const r = await window.shotcaller.linkSteamApp(game.key, appId);
    if (!r.ok) setError(r.error);
    else {
      setSearching(false);
      setResults(null);
    }
  };

  const add = async () => {
    const r = await window.shotcaller.addCustomAchievement(game.key, name, desc);
    if (!r.ok) setError(r.error);
    else {
      setName('');
      setDesc('');
    }
  };

  return (
    <section className="card enter" style={{ marginBottom: 14, display: 'grid', gap: 12 }}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 700 }}>Achievement list</div>
          <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
            {data.listSource === 'steam-public'
              ? `Using Steam’s list for app ${data.appId}. ${TRACKING_NOTE[data.tracking]}`
              : data.listSource === 'custom'
                ? `Your own achievements. ${TRACKING_NOTE[data.tracking]}`
                : 'No list yet. Find the game on Steam to use its achievements, or make your own.'}
          </div>
          {data.error && (
            <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 4 }}>
              {data.error}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
          {canLink && (
            <button className="btn" onClick={() => setSearching((s) => !s)}>
              {data.listSource === 'steam-public' ? 'Change Steam game' : 'Find on Steam'}
            </button>
          )}
          <button className="btn" onClick={() => setAdding((a) => !a)}>
            + Add your own
          </button>
        </div>
      </div>

      {searching && canLink && (
        <div style={{ display: 'grid', gap: 10 }}>
          <form
            style={{ display: 'flex', gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch();
            }}
          >
            <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Game name or Steam app id" style={{ flex: 1 }} />
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? <span className="spinner" /> : null} Search Steam
            </button>
            {game.achievementAppId && (
              <button className="btn" type="button" onClick={() => void link(null)}>
                Unlink
              </button>
            )}
          </form>
          {results && results.length === 0 && <div className="muted">No Steam games found.</div>}
          {results?.map((r) => (
            <div key={r.appId} className="row" style={{ padding: '6px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {r.image ? <img src={r.image} alt="" width={92} height={34} style={{ borderRadius: 6, objectFit: 'cover' }} /> : null}
                <div>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    App {r.appId}
                  </div>
                </div>
              </div>
              <button className="btn" onClick={() => void link(r.appId)} disabled={r.appId === data.appId}>
                {r.appId === data.appId ? 'In use' : 'Use this list'}
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Achievement name" maxLength={80} style={{ width: 240 }} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="How to earn it (optional)" maxLength={300} style={{ flex: 1 }} />
          <button className="btn primary" type="submit" disabled={!name.trim()}>
            Add
          </button>
        </form>
      )}
      {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
    </section>
  );
}

// ---------- The list ----------

function AchievementList({ game, data }: { game: LibraryGame; data: GameAchievements }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('easiest');
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out = data.achievements.filter((a) => {
      if (filter === 'unlocked' && !a.unlocked) return false;
      if (filter === 'locked' && a.unlocked) return false;
      return !q || a.name.toLowerCase().includes(q) || (!(a.hidden && !a.unlocked) && a.description.toLowerCase().includes(q));
    });
    const r = (a: Achievement) => a.rarity ?? -1;
    if (sort === 'easiest') out.sort((a, b) => r(b) - r(a) || a.name.localeCompare(b.name));
    else if (sort === 'rarest') out.sort((a, b) => (a.rarity ?? 101) - (b.rarity ?? 101) || a.name.localeCompare(b.name));
    else if (sort === 'recent') out.sort((a, b) => (b.unlockedAt ?? (b.unlocked ? 1 : 0)) - (a.unlockedAt ?? (a.unlocked ? 1 : 0)) || a.name.localeCompare(b.name));
    else out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [data, filter, sort, query]);

  if (!data.achievements.length) {
    return (
      <div className="card enter muted">
        {data.tracking === 'steam'
          ? data.listSource === 'none' && !data.error
            ? 'This game has no Steam achievements, or Steam hasn’t loaded them yet. Launch it once through Steam.'
            : (data.error ?? 'No achievements.')
          : 'No achievements yet.'}
      </div>
    );
  }

  const canTick = (a: Achievement) => data.tracking !== 'steam' || !!a.custom;
  const pct = data.total ? data.unlocked / data.total : 0;

  return (
    <section className="card enter" style={{ padding: 0 }}>
      <div style={{ padding: '16px 18px 12px', display: 'grid', gap: 12, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Achievements</div>
          <div className="progress" style={{ flex: 1 }}>
            <span style={{ width: `${pct * 100}%`, background: pct >= 1 ? 'var(--gold)' : undefined }} />
          </div>
          <div style={{ fontWeight: 800 }}>{Math.round(pct * 100)}%</div>
        </div>
        {data.tracking === 'steam' && <div className="muted" style={{ fontSize: 12 }}>{TRACKING_NOTE.steam}</div>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="segmented">
            {(
              [
                ['all', `All ${data.total}`],
                ['unlocked', `Unlocked ${data.unlocked}`],
                ['locked', `Locked ${data.total - data.unlocked}`],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
                {label}
              </button>
            ))}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
            <option value="easiest">Easiest first</option>
            <option value="rarest">Rarest first</option>
            <option value="recent">Recently unlocked</option>
            <option value="name">Name</option>
          </select>
          <input type="search" placeholder="Search achievements" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginLeft: 'auto', width: 220 }} />
        </div>
      </div>

      <div>
        {list.map((a) => (
          <AchievementRow
            key={a.id}
            a={a}
            gameName={game.name}
            secret={a.hidden && !a.unlocked && !revealed.has(a.id)}
            onReveal={() => setRevealed((s) => new Set(s).add(a.id))}
            canTick={canTick(a)}
            onTick={(on) => void window.shotcaller.setManualUnlock(game.key, a.id, on)}
            onRemove={a.custom ? () => void window.shotcaller.removeCustomAchievement(game.key, a.id) : undefined}
          />
        ))}
        {list.length === 0 && (
          <div className="muted" style={{ padding: 18 }}>
            Nothing matches.
          </div>
        )}
      </div>
    </section>
  );
}

function AchievementRow({
  a,
  gameName,
  secret,
  onReveal,
  canTick,
  onTick,
  onRemove,
}: {
  a: Achievement;
  gameName: string;
  secret: boolean;
  onReveal: () => void;
  canTick: boolean;
  onTick: (on: boolean) => void;
  onRemove?: () => void;
}) {
  const tier = rarityTier(a.rarity);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: '1px solid var(--border)', opacity: a.unlocked ? 1 : 0.86 }}>
      <AchIcon src={a.unlocked ? a.icon : (a.iconGray ?? a.icon)} size={52} locked={!a.unlocked && !a.iconGray} tier={a.unlocked ? tier : undefined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={secret ? 'secret' : undefined} onClick={secret ? onReveal : undefined} title={secret ? 'Hidden achievement: click to reveal' : undefined} style={{ fontWeight: 700 }}>
            {a.name}
          </span>
          {a.hidden && <span className="pill muted">Hidden</span>}
          {a.custom && <span className="pill muted">Your own</span>}
          {a.unlocked && a.via === 'manual' && !a.custom && <span className="pill muted">Ticked</span>}
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>
          {secret ? (
            <span className="secret" onClick={onReveal} title="Click to reveal">
              {a.description || 'This achievement is hidden until you unlock it.'}
            </span>
          ) : (
            a.description || <i>No description.</i>
          )}
        </div>
        {a.progress && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, maxWidth: 360 }}>
            <div className="progress" style={{ flex: 1, height: 6 }}>
              <span style={{ width: `${(a.progress.current / a.progress.max) * 100}%` }} />
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              {a.progress.current.toLocaleString()} / {a.progress.max.toLocaleString()}
            </span>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', justifyItems: 'end', gap: 6, flex: 'none', width: 190 }}>
        {!a.custom && <RarityPill rarity={a.rarity} />}
        {a.rarity !== null && (
          <div className="progress" style={{ width: 120, height: 4 }} title={`${a.rarity}% of players`}>
            <span style={{ width: `${Math.max(2, a.rarity)}%`, background: TIER_COLOR[tier] }} />
          </div>
        )}
        <div className="muted" style={{ fontSize: 12 }}>
          {a.unlocked ? (a.unlockedAt ? `Unlocked ${formatDate(a.unlockedAt)}` : 'Unlocked') : 'Locked'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flex: 'none', alignItems: 'center' }}>
        {!a.custom && (
          <button className="pill muted" title="Search the web for a guide" onClick={() => search(`${gameName} ${a.name} achievement guide`)} style={{ cursor: 'pointer' }}>
            Guide ↗
          </button>
        )}
        {canTick && (
          <button
            role="checkbox"
            aria-checked={a.unlocked}
            title={a.unlocked ? 'Mark as not earned' : 'Mark as earned'}
            onClick={() => onTick(!a.unlocked)}
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              border: `2px solid ${a.unlocked ? 'var(--green)' : 'rgba(255,255,255,0.25)'}`,
              background: a.unlocked ? 'rgba(61,220,151,0.18)' : 'transparent',
              color: 'var(--green)',
              fontWeight: 900,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {a.unlocked ? '✓' : ''}
          </button>
        )}
        {onRemove && (
          <button className="pill muted" title="Delete this achievement" onClick={onRemove} style={{ cursor: 'pointer' }}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function SessionsCard({ data }: { data: GameAchievements }) {
  return (
    <section className="card enter" style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>Recent sessions</div>
      <div style={{ display: 'grid', gap: 4 }}>
        {data.sessions.slice(0, 10).map((s) => (
          <div key={s.start} className="row" style={{ padding: '4px 0' }}>
            <span>{formatDate(s.start, true)}</span>
            <span className="muted">{formatMinutes(Math.max(1, Math.round((s.end - s.start) / 60000)))}</span>
          </div>
        ))}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Sessions are recorded by ShotCaller while it’s running.
      </div>
    </section>
  );
}
