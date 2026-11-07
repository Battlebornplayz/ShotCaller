import type { ReactNode } from 'react';
import { games } from '../../games';

interface GameRailProps {
  activeGameId: string | null;
  onSelectHome: () => void;
  onSelectGame: (id: string) => void;
}

/** Discord-style vertical rail of game icons. Home sits on top, games below, a slot to add more. */
export function GameRail({ activeGameId, onSelectHome, onSelectGame }: GameRailProps) {
  const homeActive = activeGameId === null;

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
      }}
    >
      <RailButton label="Home" active={homeActive} onClick={onSelectHome} color="#4f8cff">
        <Logo />
      </RailButton>

      <div style={{ width: 32, height: 1, background: 'var(--border)' }} />

      {games.map((game) => (
        <RailButton
          key={game.id}
          label={game.name}
          active={activeGameId === game.id}
          onClick={() => onSelectGame(game.id)}
          color={game.color}
        >
          <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '0.04em' }}>{game.initials}</span>
        </RailButton>
      ))}

      <RailButton label="Add a game (coming in Phase 3)" active={false} onClick={() => undefined} color="#2a2d55" dashed>
        <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
      </RailButton>
    </nav>
  );
}

function Logo() {
  return (
    <svg width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 26h8l18-10v28l-18-10h-8z" fill="#fff" />
      <path d="M46 24c3 3 3 13 0 16" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function RailButton({
  label,
  active,
  onClick,
  color,
  dashed,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: -14,
          width: 4,
          height: active ? 30 : 0,
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
    </div>
  );
}
