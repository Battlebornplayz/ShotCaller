import { useEffect, useState } from 'react';
import type { EmulatorId, EpicFreeGame, Library, MoreSource } from '../../../shared/types';
import { StoreBadge, toast } from './common';

/**
 * The Games tab's More section (Phase L2): Anker Games, the smaller stores, the emulators
 * (pick the program and your game folders once) and games added by hand, plus Epic's free games.
 */

const KIND_TITLE: Record<MoreSource['kind'], string> = {
  launcher: 'Launchers',
  store: 'Other stores',
  emulator: 'Emulators',
  other: 'Your own',
};

/** Epic's free games, loaded once per window. */
let freeCache: Promise<EpicFreeGame[]> | null = null;
export function useEpicFree(): EpicFreeGame[] | null {
  const [games, setGames] = useState<EpicFreeGame[] | null>(null);
  useEffect(() => {
    let alive = true;
    freeCache ??= window.shotcaller.getEpicFreeGames().catch(() => []);
    void freeCache.then((g) => alive && setGames(g));
    return () => {
      alive = false;
    };
  }, []);
  return games;
}

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function openFree(g: EpicFreeGame, epicFound: boolean): void {
  void window.shotcaller.openExternal(epicFound ? g.launcherUrl : g.url);
}

/** Row of this week's (and next week's) free Epic games. */
export function EpicFreeRow({ library }: { library: Library }) {
  const games = useEpicFree();
  const epicFound = !!library.stores.find((s) => s.id === 'epic')?.found;
  if (!games) return <div className="muted">Checking Epic’s free games…</div>;
  if (!games.length) return <div className="muted">Couldn’t get Epic’s free games right now.</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
      {games.map((g) => (
        <button key={g.title} className="card hover-lift" style={{ padding: 0, overflow: 'hidden', textAlign: 'left' }} onClick={() => openFree(g, epicFound)}>
          <div style={{ aspectRatio: '16 / 9', background: '#121330' }}>
            {g.image && <img src={g.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: g.upcoming ? 0.6 : 1 }} />}
          </div>
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontWeight: 800 }}>{g.title}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {g.upcoming ? `Free from ${day(g.start)}` : `Free until ${day(g.end)}`}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Small Home card: the free games right now. */
export function EpicFreeCard() {
  const games = useEpicFree();
  const [epicFound, setEpicFound] = useState(false);
  useEffect(() => {
    void window.shotcaller.getLibrary().then((l) => setEpicFound(!!l.stores.find((s) => s.id === 'epic')?.found));
  }, []);
  const now = games?.filter((g) => !g.upcoming) ?? [];
  const next = games?.find((g) => g.upcoming);
  return (
    <div className="card enter" style={{ minHeight: 130 }}>
      <div className="section-label" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <StoreBadge source="epic" size={16} /> Free on Epic this week
      </div>
      {!games ? (
        <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Checking…
        </div>
      ) : !now.length ? (
        <div className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Nothing free right now.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {now.map((g) => (
            <button key={g.title} onClick={() => openFree(g, epicFound)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 0, textAlign: 'left' }}>
              {g.image && <img src={g.image} alt="" style={{ width: 64, height: 36, objectFit: 'cover', borderRadius: 6, flex: 'none' }} />}
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.title}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  until {day(g.end)}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {next && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Next: {next.title}
        </div>
      )}
    </div>
  );
}

/** One More source: found or not, where, and its setup (emulators: program and game folders). */
export function SourceSetup({ src, compact }: { src: MoreSource; compact?: boolean }) {
  const emu = src.kind === 'emulator' ? (src.id as EmulatorId) : null;
  const run = async (op: Parameters<typeof window.shotcaller.emulator>[0]) => {
    const lib = await window.shotcaller.emulator(op);
    const now = lib.more.find((m) => m.id === src.id);
    if (now && op.op === 'addFolder') toast(`${now.count} ${now.count === 1 ? 'game' : 'games'} in ${now.name}`);
  };
  return (
    <div className="tile" style={{ padding: '10px 12px', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <StoreBadge source={src.id} size={26} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700 }}>{src.name}</span>
            {src.kind === 'other' ? (
              <span className="pill muted">{src.count} added</span>
            ) : src.found ? (
              <span className="pill green">Found · {src.count}</span>
            ) : src.count ? (
              <span className="pill gold">{src.count} games · program not found</span>
            ) : (
              <span className="pill muted">Not found</span>
            )}
          </div>
          {src.path && (
            <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={src.path}>
              {src.path}
            </div>
          )}
          {src.note && !compact && (
            <div className="muted" style={{ fontSize: 12 }}>
              {src.note}
            </div>
          )}
        </div>
        {emu && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn small" onClick={() => void run({ emu, op: 'pickExe' })}>
              {src.found ? 'Change program' : 'Pick program'}
            </button>
            <button className="btn small primary" onClick={() => void run({ emu, op: 'addFolder' })}>
              + Game folder
            </button>
          </div>
        )}
        {src.kind === 'other' && (
          <button className="btn small primary" onClick={() => void window.shotcaller.addGameManually()}>
            + Add a game
          </button>
        )}
      </div>
      {emu && (src.folders?.length ?? 0) > 0 && (
        <div style={{ display: 'grid', gap: 4, paddingLeft: 38 }}>
          {src.folders!.map((f) => (
            <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <span className="muted" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f}>
                📁 {f}
              </span>
              <button className="btn small" onClick={() => void run({ emu, op: 'removeFolder', folder: f })} title="Stop looking in this folder">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {emu && !src.folders?.length && !compact && (
        <div className="muted" style={{ fontSize: 12, paddingLeft: 38 }}>
          Add the folder where you keep your games, or drop a game file on this page.
        </div>
      )}
    </div>
  );
}

/** The "Set up more" page: every More source, Epic's free games and the drop zone. */
export function MorePanel({ library }: { library: Library }) {
  const groups = (['launcher', 'store', 'emulator', 'other'] as const).map((k) => ({ kind: k, items: library.more.filter((m) => m.kind === k) }));
  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div className="card" style={{ borderStyle: 'dashed', textAlign: 'center', padding: 18 }}>
        <div style={{ fontWeight: 800 }}>Drop a game here</div>
        <div className="muted" style={{ fontSize: 13 }}>
          An .exe, a shortcut (.lnk or .url), or a game file for RPCS3, Ryujinx or mGBA. You can drop it anywhere on the Games tab.
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.kind}>
          <div className="section-label" style={{ marginBottom: 8 }}>
            {KIND_TITLE[g.kind]}
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {g.items.map((m) => (
              <SourceSetup key={m.id} src={m} />
            ))}
          </div>
        </section>
      ))}
      <section>
        <div className="section-label" style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <StoreBadge source="epic" size={16} /> Free on Epic
        </div>
        <EpicFreeRow library={library} />
      </section>
      <div className="muted" style={{ fontSize: 12 }}>
        ShotCaller reads these stores’ own files on this PC and never changes them. Play goes through each store’s app when it has one.
      </div>
    </div>
  );
}
