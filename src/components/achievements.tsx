import { useState } from 'react';
import { rarityTier, type RarityTier } from '../../shared/types';

export const TIER_COLOR: Record<RarityTier, string> = {
  common: '#8F93C9',
  uncommon: '#3DDC97',
  rare: '#4F8CFF',
  epic: '#B26BFF',
  legendary: '#F5C451',
};

export const TIER_LABEL: Record<RarityTier, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export function formatRarity(pct: number | null): string {
  if (pct === null) return '—';
  return pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct * 10) / 10}%`;
}

export function RarityPill({ rarity }: { rarity: number | null }) {
  if (rarity === null) return <span className="pill muted">Rarity unknown</span>;
  const tier = rarityTier(rarity);
  const color = TIER_COLOR[tier];
  return (
    <span className="pill" style={{ background: `${color}22`, color }} title={`${rarity}% of players have this`}>
      {TIER_LABEL[tier]} · {formatRarity(rarity)}
    </span>
  );
}

/** Completion ring (0-1). */
export function Ring({ value, size = 44, stroke = 4, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = value >= 1;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={label ?? `${Math.round(value * 100)}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="rgba(9,10,24,0.85)" stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={done ? 'var(--gold)' : 'var(--accent)'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * Math.min(1, Math.max(0, value))} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.4s var(--ease)' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.27} fontWeight={800} fill={done ? 'var(--gold)' : '#fff'}>
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

/** Achievement icon with a trophy fallback for custom/iconless achievements. */
export function AchIcon({ src, size = 48, locked = false, tier }: { src: string | null; size?: number; locked?: boolean; tier?: RarityTier }) {
  const [ok, setOk] = useState(true);
  const border = tier ? TIER_COLOR[tier] : 'rgba(255,255,255,0.1)';
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        flex: 'none',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(255,255,255,0.05)',
        border: `1px solid ${border}`,
        filter: locked ? 'grayscale(1) brightness(0.7)' : undefined,
      }}
    >
      {src && ok ? (
        <img src={src} alt="" width={size} height={size} onError={() => setOk(false)} style={{ display: 'block' }} />
      ) : (
        <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={tier ? border : 'var(--muted)'} strokeWidth="2">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

export function formatMinutes(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  const h = min / 60;
  return h < 10 ? `${h.toFixed(1)} h` : `${Math.round(h)} h`;
}

export function formatDate(ms: number | null, withTime = false): string {
  if (!ms) return 'Unknown date';
  const d = new Date(ms);
  return withTime
    ? d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
