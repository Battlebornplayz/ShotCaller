import { useMemo, useState } from 'react';
import type { MatchRecord, SkillshotData, SkillshotSkill, SkillTree } from '../../shared/skillshot';
import { SKILL_TREES } from '../../shared/skillshot';
import { RARITY_NAMES, type SkillCollection } from '../../shared/skillshotCollection';
import { avgPlace, skillHistory, winRate } from '../../shared/skillshotStats';
import tierData from './tiers.json';
import { RarityPill, SkillIcon, skillById, TIER_COLORS, TierBadge, TREE_COLORS } from './ui';

/**
 * Skill lookup. `SkillLookup` is the full page in the app: list + filters on the left, everything
 * about one skill on the right (how to use it, ranked stats, synergy map, your own history).
 * `CompactLookup` is the small version for the overlay.
 */

const BASE = tierData.baseline as { all: number; top: number };
const TIER_ORDER: Record<string, number> = { S: 0, A: 1, B: 2, C: 3 };

export const TIER_MEANING: Record<string, string> = {
  S: 'Well above average in ranked stats',
  A: 'Above average in ranked stats',
  B: 'About average in ranked stats',
  C: 'Below average in ranked stats',
};

const isPassive = (s: SkillshotSkill) => s.tags?.includes('passive') ?? false;

function partLabel(data: SkillshotData, part: string): string {
  if (part.startsWith('class:')) return data.classes.find((c) => `class:${c.id}` === part)?.name ?? part.slice(6);
  return skillById(data, part)?.name ?? part;
}

function synergiesOf(data: SkillshotData, id: string) {
  return data.synergies
    .filter((s) => s.parts.includes(id))
    .map((s) => ({ syn: s, partner: s.parts[0] === id ? s.parts[1] : s.parts[0] }));
}

function matchesQuery(s: SkillshotSkill, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [s.name, s.nameEn, s.short, s.description, s.how].some((t) => t?.toLowerCase().includes(needle));
}

function Chip({ on, color, onClick, children }: { on: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="ss-chip"
      aria-pressed={on}
      onClick={onClick}
      style={{ padding: '3px 9px', color: on ? '#0f1023' : color, background: on ? (color ?? 'var(--accent)') : undefined, fontWeight: on ? 700 : undefined }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Full page

type Sort = 'tier' | 'name' | 'usage';

export function SkillLookup({
  data,
  matches,
  collection,
  openId,
}: {
  data: SkillshotData;
  matches: MatchRecord[];
  collection: SkillCollection | null;
  /** Skill to show first (from the Learn page). */
  openId?: string | null;
}) {
  const [q, setQ] = useState('');
  const [tree, setTree] = useState<SkillTree | null>(null);
  const [tier, setTier] = useState<string | null>(null);
  const [kind, setKind] = useState<'passive' | 'active' | null>(null);
  const [tag, setTag] = useState('');
  const [mine, setMine] = useState(false);
  const [sort, setSort] = useState<Sort>('tier');
  const [selected, setSelected] = useState<string | null>(openId ?? null);

  /** Rarity only where the game has shown it; a skill you own but never equipped has none yet. */
  const rarity = useMemo(() => {
    const out: Record<string, number> = {};
    for (const o of collection?.owned ?? []) if (o.skillId && o.rarities.length) out[o.skillId] = o.rarity;
    return out;
  }, [collection]);
  const ownedIds = useMemo(() => new Set((collection?.owned ?? []).map((o) => o.skillId)), [collection]);

  const tags = useMemo(() => {
    const all = new Set<string>();
    for (const s of data.skills) for (const t of s.tags ?? []) if (t !== 'active' && t !== 'passive') all.add(t);
    return [...all].sort();
  }, [data.skills]);

  const list = useMemo(() => {
    const rows = data.skills
      .filter((s) => matchesQuery(s, q))
      .filter((s) => !tree || s.tree === tree)
      .filter((s) => !tier || s.tier === tier)
      .filter((s) => !kind || (kind === 'passive') === isPassive(s))
      .filter((s) => !tag || s.tags?.includes(tag))
      .filter((s) => !mine || ownedIds.has(s.id));
    const byName = (a: SkillshotSkill, b: SkillshotSkill) => a.name.localeCompare(b.name);
    if (sort === 'name') return rows.sort(byName);
    if (sort === 'usage') return rows.sort((a, b) => (b.stats?.all[0] ?? 0) - (a.stats?.all[0] ?? 0) || byName(a, b));
    const score = (s: SkillshotSkill) => (s.stats ? s.stats.all[1] - BASE.all + (s.stats.top[1] - BASE.top) : -99);
    return rows.sort((a, b) => (TIER_ORDER[a.tier ?? 'C'] ?? 3) - (TIER_ORDER[b.tier ?? 'C'] ?? 3) || score(b) - score(a));
  }, [data.skills, q, tree, tier, kind, tag, mine, ownedIds, sort]);

  const skill = skillById(data, selected) ?? list[0] ?? null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
      <section className="card enter" style={{ padding: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search names and effects"
          aria-label="Search skills"
          style={{ width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, marginBottom: 8 }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {SKILL_TREES.map((t) => (
            <Chip key={t} on={tree === t} color={TREE_COLORS[t]} onClick={() => setTree(tree === t ? null : t)}>
              {t}
            </Chip>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {['S', 'A', 'B', 'C'].map((t) => (
            <Chip key={t} on={tier === t} color={TIER_COLORS[t]} onClick={() => setTier(tier === t ? null : t)}>
              {t}
            </Chip>
          ))}
          <Chip on={kind === 'passive'} onClick={() => setKind(kind === 'passive' ? null : 'passive')}>
            Automatic
          </Chip>
          <Chip on={kind === 'active'} onClick={() => setKind(kind === 'active' ? null : 'active')}>
            You press it
          </Chip>
          <Chip on={mine} onClick={() => setMine(!mine)}>
            Yours
          </Chip>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter by theme" style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '4px 6px', borderRadius: 7 }}>
            <option value="">Any theme</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort skills" style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '4px 6px', borderRadius: 7 }}>
            <option value="tier">Best first</option>
            <option value="usage">Most used</option>
            <option value="name">A to Z</option>
          </select>
        </div>
        <div style={{ display: 'grid', gap: 2, maxHeight: 560, overflowY: 'auto' }}>
          {list.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '5px 7px',
                borderRadius: 9,
                textAlign: 'left',
                background: skill?.id === s.id ? 'rgba(79,140,255,0.16)' : undefined,
              }}
            >
              <SkillIcon skill={s} size={32} rarity={rarity[s.id]} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                <span className="muted" style={{ display: 'block', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.short}
                </span>
              </span>
              <TierBadge tier={s.tier} />
            </button>
          ))}
          {!list.length && (
            <div className="muted" style={{ fontSize: 12, padding: 8 }}>
              No skills match these filters.
            </div>
          )}
        </div>
      </section>
      {skill && <SkillDetail key={skill.id} skill={skill} data={data} matches={matches} rarity={rarity} onOpen={setSelected} />}
    </div>
  );
}

function SkillDetail({
  skill,
  data,
  matches,
  rarity,
  onOpen,
}: {
  skill: SkillshotSkill;
  data: SkillshotData;
  matches: MatchRecord[];
  rarity: Record<string, number>;
  onOpen: (id: string) => void;
}) {
  const syns = useMemo(() => synergiesOf(data, skill.id), [data, skill.id]);
  const own = rarity[skill.id];
  return (
    <section className="card enter" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <SkillIcon skill={skill} size={64} rarity={own} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 21, fontWeight: 800 }}>{skill.name}</h2>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5, alignItems: 'center' }}>
            {skill.tree && (
              <span className="pill" style={{ fontSize: 11, color: TREE_COLORS[skill.tree], background: `${TREE_COLORS[skill.tree]}1f` }}>
                {skill.tree}
              </span>
            )}
            <span className="pill muted" style={{ fontSize: 11 }}>
              {isPassive(skill) ? 'Automatic' : 'You press it'}
            </span>
            {own !== undefined && <RarityPill rarity={own} />}
          </div>
        </div>
        {skill.tier && (
          <div style={{ textAlign: 'center', maxWidth: 130 }}>
            <TierBadge tier={skill.tier} size={34} />
            <div className="muted" style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.25 }}>
              {TIER_MEANING[skill.tier]}
            </div>
          </div>
        )}
      </div>

      {skill.how && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(79,140,255,0.1)', fontSize: 13.5, lineHeight: 1.45 }}>
          <div className="section-label" style={{ marginBottom: 3 }}>
            How to use it
          </div>
          {skill.how}
          {skill.note && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {skill.note}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, fontSize: 13, lineHeight: 1.45 }}>
        {skill.description && (
          <div>
            <div className="section-label">What the game says</div>
            {skill.description}
          </div>
        )}
        {skill.mutation && (
          <div>
            <div className="section-label">With a syringe (mutation)</div>
            {skill.mutation}
          </div>
        )}
      </div>

      {skill.stats && <RankedStats stats={skill.stats} />}

      <div>
        <div className="section-label">Official synergies ({syns.length})</div>
        {syns.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 300px) minmax(220px, 1fr)', gap: 14, alignItems: 'center', marginTop: 6 }}>
            <SynergyMap skill={skill} data={data} onOpen={onOpen} />
            <div style={{ display: 'grid', gap: 8, fontSize: 12.5, lineHeight: 1.4 }}>
              {syns.map(({ syn, partner }) => (
                <div key={syn.index}>
                  <b style={{ color: 'var(--green)' }}>{partLabel(data, partner)}</b>
                  {syn.tip && <span className="muted"> {syn.tip}</span>}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
            The game lists no official partner for this skill. That doesn’t make it bad: the list is teaching material, not a full map of what works.
          </p>
        )}
      </div>

      <YourHistory skillId={skill.id} data={data} matches={matches} own={own} onOpen={onOpen} />
    </section>
  );
}

function RankedStats({ stats }: { stats: NonNullable<SkillshotSkill['stats']> }) {
  const row = (label: string, s: [number, number, number], base: number) => {
    const delta = s[1] - base;
    return (
      <div key={label} style={{ display: 'grid', gridTemplateColumns: '84px minmax(0, 1fr) 150px', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
        <span className="muted">{label}</span>
        <div className="progress" style={{ height: 6 }} role="img" aria-label={`Win rate ${s[1]} percent`}>
          <span style={{ width: `${Math.min(100, s[1])}%`, background: delta >= 3 ? 'var(--green)' : delta <= -3 ? 'var(--red)' : undefined }} />
        </div>
        <span>
          <b>{s[1]}%</b>{' '}
          <span style={{ color: delta >= 3 ? 'var(--green)' : delta <= -3 ? 'var(--red)' : 'var(--muted)' }}>
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}
          </span>
          <span className="muted"> · used {s[0]}%</span>
        </span>
      </div>
    );
  };
  return (
    <div>
      <div className="section-label">Ranked results</div>
      <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
        {row('All ranks', stats.all, BASE.all)}
        {row('Top 100', stats.top, BASE.top)}
      </div>
      <p className="muted" style={{ fontSize: 11, margin: '6px 0 0', lineHeight: 1.4 }}>
        Compared with the average skill. Gaps under about 3 points are noise, and good players choose differently, so this shows a tendency and not a guarantee. Community stats from skillshotcity.gg, read {tierData.read}.
      </p>
    </div>
  );
}

/** The skill in the middle, its official partners around it. Skills can be clicked; classes can't. */
function SynergyMap({ skill, data, onOpen }: { skill: SkillshotSkill; data: SkillshotData; onOpen: (id: string) => void }) {
  const syns = synergiesOf(data, skill.id);
  const size = 300;
  const c = size / 2;
  const r = size / 2 - 46;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: size }} role="img" aria-label={`Official synergies of ${skill.name}`}>
      {syns.map(({ syn }, i) => {
        const a = (i / syns.length) * Math.PI * 2 - Math.PI / 2;
        return <line key={syn.index} x1={c} y1={c} x2={c + Math.cos(a) * r} y2={c + Math.sin(a) * r} stroke="rgba(61,220,151,0.5)" strokeWidth={2} />;
      })}
      <foreignObject x={c - 26} y={c - 26} width={52} height={52}>
        <SkillIcon skill={skill} size={52} />
      </foreignObject>
      {syns.map(({ syn, partner }, i) => {
        const a = (i / syns.length) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        const isClass = partner.startsWith('class:');
        const other = isClass ? null : skillById(data, partner);
        return (
          <foreignObject key={syn.index} x={x - 42} y={y - 21} width={84} height={64}>
            <div style={{ textAlign: 'center' }}>
              {isClass ? (
                <div style={{ fontSize: 11, fontWeight: 700, padding: '10px 4px', borderRadius: 9, background: '#1a1c3a', border: '1px solid var(--border)', lineHeight: 1.1 }}>
                  {partLabel(data, partner)}
                </div>
              ) : (
                <button onClick={() => other && onOpen(other.id)} title={other?.short} style={{ display: 'block', margin: '0 auto' }} aria-label={`Open ${other?.name ?? partner}`}>
                  <SkillIcon skill={other} size={38} style={{ margin: '0 auto' }} />
                  <div style={{ fontSize: 10, lineHeight: 1.1, marginTop: 2 }}>{other?.name ?? partner}</div>
                </button>
              )}
            </div>
          </foreignObject>
        );
      })}
    </svg>
  );
}

function YourHistory({
  skillId,
  data,
  matches,
  own,
  onOpen,
}: {
  skillId: string;
  data: SkillshotData;
  matches: MatchRecord[];
  own: number | undefined;
  onOpen: (id: string) => void;
}) {
  const h = useMemo(() => skillHistory(matches, skillId), [matches, skillId]);
  const b = h.bucket;
  const wr = b ? winRate(b) : null;
  const place = b ? avgPlace(b) : null;
  return (
    <div>
      <div className="section-label">Your results</div>
      {!b && !h.offered ? (
        <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
          You haven’t been offered this in a tracked match yet.{own !== undefined ? ` You own it at ${RARITY_NAMES[own]}.` : ''}
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, marginTop: 4 }}>
            <span>
              <b>{b?.played ?? 0}</b> <span className="muted">matches with it</span>
            </span>
            <span>
              <b>{wr === null ? '—' : `${Math.round(wr * 100)}%`}</b> <span className="muted">won</span>
            </span>
            <span>
              <b>{place === null ? '—' : place.toFixed(1)}</b> <span className="muted">average place</span>
            </span>
            <span>
              <b>
                {h.picked}/{h.offered}
              </b>{' '}
              <span className="muted">times taken when offered</span>
            </span>
          </div>
          {h.partners.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: 12 }}>
              <span className="muted">Your best partners:</span>
              {h.partners.map((p) => (
                <button key={p.id} className="ss-chip" onClick={() => onOpen(p.id)} title={`Average place ${p.avgPlace.toFixed(1)} over ${p.played} matches`}>
                  <SkillIcon skill={skillById(data, p.id)} size={18} />
                  {skillById(data, p.id)?.name ?? p.id}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Overlay version

export function CompactLookup({ data, build, onClose }: { data: SkillshotData; build: Record<string, number>; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [tree, setTree] = useState<SkillTree | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const skills = useMemo(
    () =>
      data.skills
        .filter((s) => matchesQuery(s, q))
        .filter((s) => !tree || s.tree === tree)
        .sort((a, b) => (TIER_ORDER[a.tier ?? 'C'] ?? 3) - (TIER_ORDER[b.tier ?? 'C'] ?? 3) || a.name.localeCompare(b.name)),
    [data.skills, q, tree],
  );
  const skill = skillById(data, selected);
  const syns = skill ? synergiesOf(data, skill.id) : [];
  const yours = syns.filter(({ partner }) => !partner.startsWith('class:') && build[partner]);
  return (
    <div className="toast tile" style={{ padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <b style={{ fontSize: 12, flex: 1 }}>Look up a skill</b>
        <button className="muted" style={{ fontSize: 11 }} onClick={onClose}>
          Close
        </button>
      </div>
      {skill ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 7, fontSize: 12, lineHeight: 1.4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SkillIcon skill={skill} size={36} />
            <b style={{ fontSize: 13.5, flex: 1 }}>{skill.name}</b>
            <TierBadge tier={skill.tier} size={18} />
          </div>
          <div>{skill.how ?? skill.short}</div>
          {skill.mutation && (
            <div>
              <span className="muted">Syringe: </span>
              {skill.mutation}
            </div>
          )}
          {yours.length > 0 && (
            <div style={{ color: 'var(--green)', fontWeight: 600 }}>⚡ Works with your {yours.map(({ partner }) => partLabel(data, partner)).join(', ')}</div>
          )}
          {syns.length > 0 && (
            <div className="muted" style={{ fontSize: 11 }}>
              Official partners: {syns.map(({ partner }) => partLabel(data, partner)).join(', ')}
            </div>
          )}
          <button className="muted" style={{ fontSize: 11, textAlign: 'left' }} onClick={() => setSelected(null)}>
            ← Back to all skills
          </button>
        </div>
      ) : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills" aria-label="Search skills" style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 8, marginBottom: 6 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {SKILL_TREES.map((t) => (
              <Chip key={t} on={tree === t} color={TREE_COLORS[t]} onClick={() => setTree(tree === t ? null : t)}>
                {t}
              </Chip>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 2, maxHeight: 190, overflowY: 'auto' }}>
            {skills.map((s) => (
              <button key={s.id} className="ss-grid-btn" onClick={() => setSelected(s.id)} title={`${s.name}: ${s.short}`} aria-label={s.name}>
                <SkillIcon skill={s} size={34} style={build[s.id] ? { outline: '2px solid rgba(61,220,151,0.7)', outlineOffset: 1 } : undefined} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
