import { useState } from 'react';
import type { GameAchievements, GameSource, LibraryGame, RunningGame } from '../../../shared/types';
import { Ring } from '../../components/achievements';
import { useOverlayState } from '../../hooks/useLive';
import { since } from '../pages';
import { Art, heroSources } from '../hub/art';
import { Confirm, formatPlaytime, formatSize, play, PopMenu, SOURCE_LABEL, StoreBadge, TextPrompt, toast, type MenuItem } from './common';

const api = () => window.shotcaller;
const report = (r: { ok: boolean; error?: string }, okText?: string) => {
  if (!r.ok) toast(r.error ?? 'That didn’t work.', 'error');
  else if (okText) toast(okText);
};

/** Top of a game page: wide art, Play (with a store picker), facts and the "..." menu. */
export function GameHero({
  game,
  data,
  running,
  showAchievements,
}: {
  game: LibraryGame;
  data: GameAchievements | null;
  running?: RunningGame;
  showAchievements: boolean;
}) {
  const overlay = useOverlayState();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [ask, setAsk] = useState<'launch' | 'genres' | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);
  const pct = data?.total ? data.unlocked / data.total : null;
  const appId = game.steamAppId ?? game.achievementAppId;
  const copies = (game.copies ?? []).filter((c) => c.source !== 'module');
  const installedCopies = copies.filter((c) => c.installed);
  const canInstall = !game.installed && copies.some((c) => c.source === 'steam');
  const playMinutes = game.playMinutes ?? data?.playtimeMinutes ?? undefined;

  const storePicker = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: r.left,
      y: r.bottom + 6,
      items: [
        { heading: true, label: 'Play from' },
        ...installedCopies.map((c) => ({ label: SOURCE_LABEL[c.source], onClick: () => void play(game, c.source as GameSource) })),
      ],
    });
  };

  const moreMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: MenuItem[] = [
      { label: game.pinned ? 'Remove from favourites' : 'Add to favourites', onClick: () => void api().setGamePinned(game.key, !game.pinned) },
      { label: 'Launch options…', onClick: () => setAsk('launch'), disabled: !copies.some((c) => ['steam', 'anker', 'manual'].includes(c.source)) && game.source !== 'manual' },
      { label: 'Edit genres…', onClick: () => setAsk('genres') },
      { label: 'Desktop shortcut', disabled: !game.installed, onClick: () => void api().createGameShortcut(game.key).then((x) => report(x, 'Shortcut added to your desktop')) },
      { label: 'Open install folder', disabled: !game.installDir, onClick: () => void api().openGameFolder(game.key).then((x) => report(x)) },
      { label: 'Open in its store', disabled: !copies.some((c) => ['steam', 'epic', 'xbox'].includes(c.source)), onClick: () => void api().openGameInStore(game.key).then((x) => report(x)) },
      ...(appId ? [{ label: 'Steam guides', onClick: () => void api().openExternal(`https://steamcommunity.com/app/${appId}/guides/`) }] : []),
      { label: overlay?.preview ? 'Close overlay preview' : 'Preview overlay', onClick: () => void api().setOverlayPreview(!overlay?.preview) },
      { separator: true, label: '' },
      { label: game.isTool ? 'Move to games' : 'Move to Tools', onClick: () => void api().setGameTool(game.key, !game.isTool) },
      { label: game.hidden ? 'Show again' : 'Hide', onClick: () => void api().setGameHidden(game.key, !game.hidden) },
      ...(game.source === 'manual' ? [{ label: 'Remove game', danger: true, onClick: () => void api().removeGame(game.key) }] : []),
      ...(game.installed && game.source !== 'manual' ? [{ label: 'Uninstall…', danger: true, onClick: () => setConfirmUninstall(true) }] : []),
    ];
    setMenu({ x: r.left, y: r.bottom + 6, items });
  };

  return (
    <div className="game-hero-wide enter">
      <div className="hero-art">
        <Art sources={heroSources(game)} style={{ width: '100%', height: '100%' }} fallback={<div style={{ width: '100%', height: '100%', background: 'linear-gradient(160deg, #22244a, #0f1023)' }} />} />
      </div>
      <div className="hero-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>{game.name}</h1>
          {running && <span className="pill green">● Running · {since(running.since)}</span>}
          {game.moduleId && <span className="pill">ShotCaller overlay</span>}
          {game.updateAvailable && <span className="pill gold">Update waiting</span>}
          {game.isTool && <span className="pill muted">Tool</span>}
          {game.hidden && <span className="pill muted">Hidden</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {game.installed ? (
            <span className="play-split">
              <button className="btn primary big" style={{ padding: '12px 30px', fontSize: 16 }} onClick={() => void play(game)} disabled={!!running}>
                {running ? 'Playing' : '▶ Play'}
              </button>
              {installedCopies.length > 1 && (
                <button className="btn primary" onClick={storePicker} title="Pick the store">
                  ▾
                </button>
              )}
            </span>
          ) : canInstall ? (
            <button className="btn primary big" style={{ padding: '12px 30px', fontSize: 16 }} onClick={() => void api().installGame(game.key).then((x) => report(x))}>
              ⬇ Install
            </button>
          ) : (
            <span className="pill muted">Not installed</span>
          )}
          <button className="btn" onClick={moreMenu} title="More">
            •••
          </button>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 6 }}>
            {copies.map((c) => (
              <span key={c.key} className="pill muted" style={{ gap: 6, opacity: c.installed ? 1 : 0.6 }}>
                <StoreBadge source={c.source} size={16} />
                {SOURCE_LABEL[c.source]}
                {!c.installed ? ' · owned' : ''}
              </span>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {showAchievements && pct !== null && <Ring value={pct} size={64} stroke={6} />}
        </div>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', paddingBottom: 6 }}>
          {showAchievements && <Stat label="Achievements" value={data?.total ? `${data.unlocked} / ${data.total}` : '—'} />}
          <Stat label="Playtime" value={formatPlaytime(playMinutes) ?? '—'} />
          <Stat label="Last played" value={game.lastPlayed ? new Date(game.lastPlayed).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'} />
          <Stat label="Size" value={formatSize(game.sizeBytes) ?? '—'} />
          {game.genres?.length ? <Stat label="Genres" value={game.genres.slice(0, 3).join(', ')} /> : null}
        </div>
      </div>

      {menu && <PopMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {ask === 'launch' && (
        <TextPrompt
          title={`Launch options for ${game.name}`}
          initial={game.launchOptions ?? ''}
          placeholder="e.g. -fullscreen -novid"
          onDone={(v) => {
            setAsk(null);
            if (v !== null) void api().setLaunchOptions(game.key, v);
          }}
        />
      )}
      {ask === 'genres' && (
        <TextPrompt
          title={`Genres for ${game.name}`}
          initial={(game.genres ?? []).join(', ')}
          placeholder="Action, Co-op, Racing (leave empty to use Steam’s)"
          onDone={(v) => {
            setAsk(null);
            if (v === null) return;
            const list = v.split(',').map((x) => x.trim()).filter(Boolean);
            void api().setGameGenres(game.key, list.length ? list : null);
          }}
        />
      )}
      {confirmUninstall && (
        <Confirm
          title={`Uninstall ${game.name}?`}
          body={`ShotCaller hands this to ${SOURCE_LABEL[installedCopies[0]?.source ?? game.source]}, which asks you once more before removing anything.`}
          okLabel="Uninstall"
          danger
          onDone={(ok) => {
            setConfirmUninstall(false);
            if (ok) void api().uninstallGame(game.key).then((x) => report(x));
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div style={{ fontWeight: 800, fontSize: 17, marginTop: 2 }}>{value}</div>
    </div>
  );
}
