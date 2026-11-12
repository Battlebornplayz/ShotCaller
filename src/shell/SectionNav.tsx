export type SectionId = 'home' | 'games' | 'timeline' | 'profile' | 'friends' | 'settings';

export interface Section {
  id: SectionId;
  label: string;
}

interface SectionNavProps {
  sections: Section[];
  active: SectionId;
  onSelect: (id: SectionId) => void;
  /** When a game is open, the nav is replaced by that game's own page list. */
  gameName?: string;
  onBack?: () => void;
  backLabel?: string;
}

export function SectionNav({ sections, active, onSelect, gameName, onBack, backLabel }: SectionNavProps) {
  return (
    <aside
      style={{
        width: 210,
        flex: 'none',
        background: 'var(--bg)',
        borderRight: '1px solid var(--border)',
        padding: '18px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      {gameName ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 700, padding: '4px 10px 12px' }}>{gameName}</div>
          {onBack && (
            <button onClick={onBack} className="muted" style={{ textAlign: 'left', padding: '9px 12px', borderRadius: 9 }}>
              ← Back to {backLabel}
            </button>
          )}
        </>
      ) : (
        sections.map((s) => {
          const isActive = s.id === active;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              aria-current={isActive ? 'page' : undefined}
              style={{
                textAlign: 'left',
                padding: '9px 12px',
                borderRadius: 9,
                fontWeight: isActive ? 700 : 500,
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                color: isActive ? 'var(--text)' : 'var(--muted)',
              }}
            >
              {s.label}
            </button>
          );
        })
      )}
    </aside>
  );
}
