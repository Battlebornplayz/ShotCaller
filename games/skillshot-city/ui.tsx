import type { CSSProperties } from 'react';
import type { SkillshotData, SkillshotSkill, SkillTree } from '../../shared/skillshot';
import { RARITY_COLORS, RARITY_NAMES } from '../../shared/skillshotCollection';

/**
 * Shared Skillshot City UI bits (renderer only): skill icon with a rarity border, rarity pill,
 * tier badge. Icons are monograms tinted by skill tree until the real icons are cropped from the
 * game's texture sheets.
 */

export const TREE_COLORS: Record<SkillTree, string> = {
  Healing: '#3ddc97',
  Defense: '#4fc3ff',
  Weaponry: '#f5c451',
  Damage: '#ff7a59',
  DOT: '#a6e05a',
  Utility: '#c39bff',
};

export const TIER_COLORS: Record<string, string> = { S: '#ff6b7a', A: '#f5c451', B: '#4f8cff', C: '#8f93c9' };

export function skillById(data: SkillshotData | null, id: string | null): SkillshotSkill | null {
  return (id && data?.skills.find((s) => s.id === id)) || null;
}

function monogram(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 À-ɏЀ-ӿ一-鿿-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? '?').slice(0, 2).toUpperCase();
}

/** Square skill icon. `rarity` (0-3) draws the colored border + glow; omit it for a plain icon. */
export function SkillIcon({
  skill,
  rarity,
  size = 44,
  label,
  dim,
  style,
}: {
  skill: SkillshotSkill | null;
  rarity?: number;
  size?: number;
  /** Fallback text when the skill isn't known (e.g. "#43"). */
  label?: string;
  dim?: boolean;
  style?: CSSProperties;
}) {
  const tree = skill?.tree ? TREE_COLORS[skill.tree] : '#8f93c9';
  const ring = rarity !== undefined ? RARITY_COLORS[rarity] ?? RARITY_COLORS[0] : 'rgba(255,255,255,0.12)';
  const glow = rarity !== undefined && rarity >= 2 ? `0 0 ${rarity === 3 ? 14 : 9}px ${ring}66` : 'none';
  return (
    <div
      title={skill ? `${skill.name}${rarity !== undefined ? ` · ${RARITY_NAMES[rarity] ?? ''}` : ''}` : label}
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: size * 0.24,
        border: `2px solid ${ring}`,
        boxShadow: glow,
        background: `radial-gradient(circle at 30% 25%, ${tree}55, ${tree}14 70%), #14163a`,
        display: 'grid',
        placeItems: 'center',
        fontWeight: 800,
        fontSize: size * 0.34,
        letterSpacing: 0.5,
        color: skill ? '#fff' : 'var(--muted)',
        opacity: dim ? 0.45 : 1,
        ...style,
      }}
    >
      {skill ? monogram(skill.nameEn || skill.name) : (label ?? '?')}
    </div>
  );
}

export function RarityPill({ rarity }: { rarity: number }) {
  const c = RARITY_COLORS[rarity] ?? RARITY_COLORS[0];
  return (
    <span className="pill" style={{ fontSize: 11, color: c, background: `${c}1f`, border: `1px solid ${c}55` }}>
      {RARITY_NAMES[rarity] ?? 'Common'}
    </span>
  );
}

export function TierBadge({ tier, size = 18 }: { tier?: string; size?: number }) {
  if (!tier) return null;
  const c = TIER_COLORS[tier] ?? TIER_COLORS.C;
  return (
    <span
      title={`${tier} tier`}
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: 5,
        fontSize: size * 0.62,
        fontWeight: 800,
        color: '#0f1023',
        background: c,
        flex: 'none',
      }}
    >
      {tier}
    </span>
  );
}
