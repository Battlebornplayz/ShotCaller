import type { ReactNode } from 'react';
import { moduleById } from '../../games';
import type { LibraryGame } from '../../shared/types';
import { Logo } from '../components/Logo';
import { useDetection, useLibrary } from '../hooks/useLive';

interface GameRailProps {
  activeGameKey: string | null;
  onSelectHome: () => void;
  onSelectGame: (key: string) => void;
}

const TILE_COLORS = ['#5b6cff', '#3ddc97', '#f5c451', '#ff6b7a', '#b46bff', '#38bdf8', '#f97316'];

export function gameInitials(game: LibraryGame): string {
  if (game.moduleId) return moduleById(game.moduleId).initials;
  const words = game.name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? '?').slice(0, 2).toUpperCase();
}

export function gameColor(game: LibraryGame): string {
  if (game.moduleId) return moduleById(game.moduleId).color;
  let h = 0;
  for (const c of game.key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/** Discord-style vertical rail: Home, supported and pinned games (green dot = running), add a game. */
export function GameRail({ activeGameKey, onSelectHome, onSelectGame }: GameRailProps) {
  const library = useLibrary();
  const detection = useDetection();
  const runningKeys = new Set(detection?.running.map((r) => r.key));
  const railGames = (library?.games ?? []).filter((g) => g.moduleId || g.pinned || runningKeys.has(g.key));

  const addGame = async () => {
    const game = await window.shotcaller.addGameManually();
    if (game) onSelectGame(game.key);
  };

  return (
    <nav
      aria-label="Games"
      style={{
        width: 72,
        flex: 'none',
        background: 'var(--sidebar)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
      }}
    >
      <RailButton label="Home" active={activeGameKey === null} onClick={onSelectHome} color="#1a1c3a">
        <Logo size={40} tile={false} />
      </RailButton>

      <div style={{ width: 32, height: 1, background: 'var(--border)', flex: 'none' }} />

      {railGames.map((game) => (
        <RailButton
          key={game.key}
          label={runningKeys.has(game.key) ? `${game.name} — running` : game.name}
          active={activeGameKey === game.key}
          onClick={() => onSelectGame(game.key)}
          color={gameColor(game)}
          running={runningKeys.has(game.key)}
        >
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '0.04em' }}>{gameInitials(game)}</span>
        </RailButton>
      ))}

      <RailButton label="Add a game" active={false} onClick={() => void addGame()} color="transparent" dashed>
        <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
      </RailButton>
    </nav>
  );
}

function RailButton({
  label,
  active,
  onClick,
  color,
  dashed,
  running,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
  dashed?: boolean;
  running?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 'none' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: -14,
          width: 4,
          height: active ? 30 : running ? 8 : 0,
          borderRadius: 4,
          background: '#fff',
          transition: 'height 0.2s cubic-bezier(0.2,0.8,0.2,1)',
        }}
      />
      <button
        title={label}
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        style={{
          width: 48,
          height: 48,
          borderRadius: active ? 14 : 24,
          display: 'grid',
          placeItems: 'center',
          background: color,
          border: dashed ? '1px dashed rgba(143,147,201,0.6)' : 'none',
          color: dashed ? 'var(--muted)' : '#fff',
          transition: 'border-radius 0.2s cubic-bezier(0.2,0.8,0.2,1), transform 0.12s',
          boxShadow: active ? `0 0 0 2px var(--sidebar), 0 0 0 4px ${color}` : 'none',
        }}
      >
        {children}
      </button>
      {running && (
        <span
          aria-hidden="true"
          className="dot-live"
          style={{ position: 'absolute', right: -2, bottom: -2, border: '2px solid var(--sidebar)', width: 14, height: 14 }}
        />
      )}
    </div>
  );
}
