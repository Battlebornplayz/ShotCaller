import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MatchRecord, SkillshotData, SkillshotLiveState, SkillshotSkill } from '../../shared/skillshot';
import { BUILD_SIZE, planBuilds, type Playstyle, type Sliders } from '../../shared/skillshotBuilder';
import { buildMap, coachBuild, layoutMap, partnerOf, synergiesOf, type BuildCheck, type BuildCoaching, type MapLayout, type SynergyMap } from '../../shared/skillshotCoach';
import { RARITY_NAMES, type SkillCollection } from '../../shared/skillshotCollection';
import { computeStats } from '../../shared/skillshotStats';
import styleFile from './playstyles.json';
import { SkillIcon, skillById, TierBadge, TREE_COLORS } from './ui';

/**
 * The skill builder. You choose the skills on a map of how they connect, and a coach explains what the build
 * does well and what it lacks. The chosen build becomes the goal the live advisor follows. The playstyle
 * planner lives on as an optional starting point that loads a build you can then change.
 */

const STYLES = styleFile.styles as Playstyle[];
const BALANCED: Sliders = { aggression: 50, range: 50, survival: 60, spice: 15 };
const DRAFT_KEY = 'shotcaller.skillshot.builderDraft';
const SMALLEST_MAP = 420;

const SLIDERS: { key: keyof Sliders; label: string; low: string; high: string }[] = [
  { key: 'aggression', label: 'Aggression', low: 'Hang back', high: 'Pick fights' },
  { key: 'range', label: 'Range', low: 'Up close', high: 'From afar' },
  { key: 'survival', label: 'Survival', low: 'Glass cannon', high: 'Hard to kill' },
  { key: 'spice', label: 'Spice', low: 'Proven', high: 'Wild' },
];

function readDraft(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, BUILD_SIZE) : [];
  } catch {
    return [];
  }
}

function saveDraft(picks: string[]): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(picks));
  } catch {
    // Only a convenience: the draft just won't come back next time.
  }
}

export function BuilderPage({
  data,
  matches,
  collection,
  live,
}: {
  data: SkillshotData;
  matches: MatchRecord[];
  collection: SkillCollection | null;
  live: SkillshotLiveState | null;
}) {
  const owned = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const o of collection?.owned ?? []) if (o.skillId) out.set(o.skillId, o.rarities.length ? o.rarity : null);
    return out;
  }, [collection]);
  const stats = useMemo(() => (matches.length ? computeStats(data, matches) : null), [data, matches]);

  const [classChoice, setClassChoice] = useState<string | null | undefined>(undefined);
  const classId = classChoice === undefined ? (live?.classId ?? collection?.detectedClass ?? null) : classChoice;

  const goal = live?.goal.locked ? live.goal.ids : null;
  const [picks, setPicksRaw] = useState<string[]>(() => (goal?.length ? goal.slice(0, BUILD_SIZE) : readDraft()));
  const setPicks = (next: string[]) => {
    setPicksRaw(next);
    saveDraft(next);
  };
  // A saved draft can hold skills from before a collection changed. Only drop them once the collection is in.
  const mine = useMemo(() => (owned.size ? picks.filter((id) => owned.has(id)) : picks), [picks, owned]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);
  const [swapIn, setSwapIn] = useState<string | null>(null);
  const focus = hovered ?? clicked;

  const coaching = useMemo(() => coachBuild({ data, picks: mine, classId, owned, stats }), [data, mine, classId, owned, stats]);
  const map = useMemo(() => buildMap(data, owned, classId), [data, owned, classId]);
  const suggested = useMemo(() => new Set(coaching.nextPicks.map((p) => p.id)), [coaching]);

  const toggle = (id: string) => {
    setClicked(id);
    if (!owned.has(id)) return;
    if (mine.includes(id)) {
      setSwapIn(null);
      setPicks(mine.filter((x) => x !== id));
    } else if (mine.length >= BUILD_SIZE) {
      setSwapIn(id);
    } else {
      setSwapIn(null);
      setPicks([...mine, id]);
    }
  };
  const swapOut = (id: string) => {
    if (swapIn) {
      setPicks(mine.map((x) => (x === id ? swapIn : x)));
      setClicked(swapIn);
      setSwapIn(null);
    } else {
      setPicks(mine.filter((x) => x !== id));
    }
  };

  const goalKey = goal ? [...goal].sort().join('+') : null;
  const isGoal = goalKey !== null && goalKey === [...mine].sort().join('+');

  if (!owned.size) {
    return <section className="card enter muted">No skills detected yet. Play one match and your unlocked skills are read automatically.</section>;
  }

  return (
    <div className="bm-page">
      <section className="card enter bm-build">
        <div className="bm-build-head">
          <div>
            <div className="eyebrow">Your build</div>
            <div className="bm-count">
              {mine.length} of {BUILD_SIZE} skills
            </div>
          </div>
          <div className="bm-slots">
            {Array.from({ length: BUILD_SIZE }, (_, i) => {
              const id = mine[i];
              const s = skillById(data, id ?? null);
              return id ? (
                <button key={id} className={`bm-slot${swapIn ? ' swap' : ''}`} title={swapIn ? `Swap out ${s?.name}` : `Remove ${s?.name}`} onClick={() => swapOut(id)} onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)}>
                  <SkillIcon skill={s} size={44} rarity={owned.get(id) ?? undefined} />
                  <span>{s?.name ?? id}</span>
                </button>
              ) : (
                <div key={i} className="bm-slot empty" aria-hidden="true">
                  <div />
                  <span>Empty</span>
                </div>
              );
            })}
          </div>
          <div className="bm-actions">
            {isGoal ? (
              <button className="btn" onClick={() => void window.shotcaller.setSkillshotGoal([], false)}>
                ✓ Your goal. Clear it
              </button>
            ) : (
              <button className="btn primary" disabled={mine.length < 3} title={mine.length < 3 ? 'Choose at least 3 skills' : undefined} onClick={() => void window.shotcaller.setSkillshotGoal(mine, true)}>
                Make this my goal
              </button>
            )}
            <button className="bm-link" disabled={!mine.length} onClick={() => setPicks([])}>
              Clear build
            </button>
          </div>
        </div>
        {swapIn ? (
          <p className="bm-note swap">
            Your build is full. Click a skill above to swap it for <b>{skillById(data, swapIn)?.name}</b>, or{' '}
            <button className="bm-link" onClick={() => setSwapIn(null)}>
              cancel
            </button>
            .
          </p>
        ) : (
          <p className="bm-note">You get {BUILD_SIZE} skills a match, and most offers are random, so treat this as a preference. If 3 of them show up, the build works.</p>
        )}
      </section>

      <div className="bm-columns">
        <section className="card enter bm-map-card">
          <div className="bm-map-head">
            <div className="eyebrow">Synergy map</div>
            <label className="bm-class">
              Class
              <select
                value={classId ?? ''}
                onChange={(e) => {
                  setClassChoice(e.target.value || null);
                }}
              >
                <option value="">Any class</option>
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <MapView data={data} map={map} owned={owned} picks={mine} suggested={suggested} focus={hovered} classId={classId} onToggle={toggle} onHover={setHovered} />
          <div className="bm-legend">
            <span>
              <i className="bm-key on" /> In your build
            </span>
            <span>
              <i className="bm-key next" /> Coach suggests
            </span>
            <span>
              <i className="bm-key line" /> Official synergy
            </span>
            <span>
              <i className="bm-key locked" /> Not unlocked
            </span>
          </div>
          {map.loose.length > 0 && (
            <div className="bm-tray">
              <div className="section-label">No official pairs{classId ? ' for this class' : ''}</div>
              <p className="muted">They can still be great. They just don't have a listed synergy with what you own.</p>
              <div className="bm-tray-list">
                {map.loose.map((id) => {
                  const s = skillById(data, id);
                  const on = mine.includes(id);
                  return (
                    <button key={id} className={`bm-chip${on ? ' on' : ''}${suggested.has(id) ? ' next' : ''}`} aria-pressed={on} onClick={() => toggle(id)} onMouseEnter={() => setHovered(id)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(id)} onBlur={() => setHovered(null)}>
                      <SkillIcon skill={s} size={24} rarity={owned.get(id) ?? undefined} />
                      {s?.name ?? id}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <Coach data={data} coaching={coaching} owned={owned} picks={mine} focus={focus} classId={classId} swapping={swapIn === focus} onToggle={toggle} onHover={setHovered} />
      </div>

      <StartingPoint data={data} owned={owned} classId={classId} stats={stats} onUse={(ids) => setPicks(ids.slice(0, BUILD_SIZE))} />

      <p className="muted bm-credit">Built from the game's official synergies, community ranked stats (skillshotcity.gg, provisional), your rarities and your own results. Damage and cooldown numbers aren't included: no readable game file has them.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The map

function MapView({
  data,
  map,
  owned,
  picks,
  suggested,
  focus,
  classId,
  onToggle,
  onHover,
}: {
  data: SkillshotData;
  map: SynergyMap;
  owned: Map<string, number | null>;
  picks: string[];
  suggested: Set<string>;
  focus: string | null;
  classId: string | null;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, []);
  const layout: MapLayout | null = useMemo(() => (width ? layoutMap(map, Math.max(SMALLEST_MAP, width)) : null), [map, width]);

  const hub = classId ? `class:${classId}` : null;
  const on = (id: string) => picks.includes(id) || id === hub;
  const near = useMemo(() => {
    if (!focus) return null;
    const out = new Set([focus]);
    for (const e of map.edges) {
      if (e.a === focus) out.add(e.b);
      if (e.b === focus) out.add(e.a);
    }
    return out;
  }, [focus, map]);
  const hubName = data.classes.find((c) => c.id === classId)?.name;

  return (
    <div className="bm-map" ref={box} style={{ height: layout?.height ?? 360 }}>
      {layout && (
        <>
          <svg width={layout.width} height={layout.height} aria-hidden="true">
            {map.edges.map((e) => {
              const a = layout.at[e.a];
              const b = layout.at[e.b];
              if (!a || !b) return null;
              const active = on(e.a) && on(e.b);
              const possible = !active && (picks.includes(e.a) || picks.includes(e.b) || (e.a === hub && suggested.has(e.b)) || (e.b === hub && suggested.has(e.a)));
              const touching = focus === e.a || focus === e.b;
              const dim = near && !touching;
              // A slight bend, so lines meeting at the same node stay apart.
              const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.08;
              const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.08;
              return <path key={e.index} d={`M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}`} className={`bm-edge${active ? ' active' : ''}${possible ? ' possible' : ''}${touching ? ' touching' : ''}${dim ? ' dim' : ''}`} />;
            })}
          </svg>
          {map.nodes.map((node) => {
            const at = layout.at[node.id];
            if (!at) return null;
            if (node.kind === 'class') {
              return (
                <div key={node.id} className="bm-hub" style={{ left: at.x, top: at.y }}>
                  <span>Your class</span>
                  <b>{hubName}</b>
                </div>
              );
            }
            const s = skillById(data, node.id);
            const picked = picks.includes(node.id);
            const locked = node.kind === 'locked';
            const cls = ['bm-node', picked && 'on', !picked && suggested.has(node.id) && 'next', locked && 'locked', near && !near.has(node.id) && 'dim', focus === node.id && 'focus'].filter(Boolean).join(' ');
            return (
              <button
                key={node.id}
                className={cls}
                style={{ left: at.x, top: at.y }}
                aria-pressed={locked ? undefined : picked}
                aria-label={`${s?.name ?? node.id}${locked ? ', not unlocked' : ''}`}
                onClick={() => onToggle(node.id)}
                onMouseEnter={() => onHover(node.id)}
                onMouseLeave={() => onHover(null)}
                onFocus={() => onHover(node.id)}
                onBlur={() => onHover(null)}
              >
                <span className="bm-node-icon">
                  <SkillIcon skill={s} size={46} rarity={locked ? undefined : (owned.get(node.id) ?? undefined)} dim={locked} />
                  {!locked && (
                    <span className="bm-node-tier">
                      <TierBadge tier={s?.tier} size={16} />
                    </span>
                  )}
                </span>
                <span className="bm-node-name">{s?.name ?? node.id}</span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The coach

const CHECK_MARK: Record<BuildCheck['status'], string> = { good: '✓', warn: '!', todo: '·' };

function partName(data: SkillshotData, part: string): string {
  return part.startsWith('class:') ? (data.classes.find((c) => `class:${c.id}` === part)?.name ?? part.slice(6)) : (skillById(data, part)?.name ?? part);
}

function Coach({
  data,
  coaching,
  owned,
  picks,
  focus,
  classId,
  swapping,
  onToggle,
  onHover,
}: {
  data: SkillshotData;
  coaching: BuildCoaching;
  owned: Map<string, number | null>;
  picks: string[];
  focus: string | null;
  classId: string | null;
  swapping: boolean;
  onToggle: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const focused = skillById(data, focus);
  return (
    <aside className="bm-coach">
      {focused ? (
        <SkillCard data={data} skill={focused} owned={owned} picks={picks} classId={classId} swapping={swapping} onToggle={onToggle} />
      ) : (
        <section className="card enter bm-hello">
          <div className="eyebrow">Coach</div>
          <b>{picks.length ? 'Point at any skill to see what it does.' : 'Start with a skill you like the sound of.'}</b>
          <p className="muted">Click a skill to add it to your build. The coach reacts as you go.</p>
        </section>
      )}

      {coaching.nextPicks.length > 0 && (
        <section className="card enter">
          <div className="eyebrow">{picks.length ? 'Good next picks' : 'Good first picks'}</div>
          <div className="bm-rows">
            {coaching.nextPicks.map((p) => {
              const s = skillById(data, p.id);
              return (
                <button key={p.id} className="bm-row" onClick={() => onToggle(p.id)} onMouseEnter={() => onHover(p.id)} onMouseLeave={() => onHover(null)}>
                  <SkillIcon skill={s} size={32} rarity={owned.get(p.id) ?? undefined} />
                  <span>
                    <b>{s?.name ?? p.id}</b>
                    <small>{p.why}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {picks.length > 0 && (
        <section className="card enter">
          <div className="eyebrow">Build check</div>
          <div className="bm-checks">
            {coaching.checks.map((c) => (
              <div key={c.id} className={`bm-check ${c.status}`}>
                <i aria-hidden="true">{CHECK_MARK[c.status]}</i>
                <span>
                  <b>{c.title}</b>
                  <small>{c.detail}</small>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {coaching.synergies.length > 0 && (
        <section className="card enter" style={{ ['--tier' as string]: 'var(--green)' }}>
          <div className="eyebrow">Your synergies</div>
          <div className="bm-tips">
            {coaching.synergies.map((s) => (
              <div key={s.index}>
                <b>
                  {partName(data, s.parts[0])} + {partName(data, s.parts[1])}
                </b>
                <small>{s.tip}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {picks.length >= 3 && (
        <section className="card enter">
          <div className="eyebrow">In the match</div>
          <div className="bm-plan">
            <div>
              <div className="bm-plan-label">Level first</div>
              {coaching.levelFirst.map((l) => (
                <p key={l.id}>
                  <b>{skillById(data, l.id)?.name ?? l.id}.</b> <span className="muted">{l.why}</span>
                </p>
              ))}
            </div>
            <div>
              <div className="bm-plan-label">Not offered? Take these instead</div>
              <div className="bm-plan-chips">
                {coaching.backups.map((id) => (
                  <span key={id} className="ss-chip">
                    <SkillIcon skill={skillById(data, id)} size={18} rarity={owned.get(id) ?? undefined} />
                    {skillById(data, id)?.name ?? id}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="bm-plan-label">Equip in the game</div>
              <p>
                <span className="muted">Top slots: </span>
                {coaching.equip.top.length ? coaching.equip.top.map((id) => skillById(data, id)?.name ?? id).join(', ') : <span className="muted">no known Legendary, leave empty (that offer becomes random)</span>}
              </p>
              <p>
                <span className="muted">Bottom slots: </span>
                {coaching.equip.bottom.map((id) => skillById(data, id)?.name ?? id).join(', ')}
              </p>
            </div>
          </div>
        </section>
      )}

      {coaching.hints.length > 0 && (
        <section className="card enter" style={{ ['--tier' as string]: 'var(--gold)' }}>
          <div className="eyebrow">Worth watching for</div>
          <p className="muted bm-hint-intro">You don't own these yet. If a flask gives you one, it would connect to what you have.</p>
          <div className="bm-rows">
            {coaching.hints.map((h) => {
              const s = skillById(data, h.id);
              return (
                <div key={h.id} className="bm-row still" title={h.tip}>
                  <SkillIcon skill={s} size={32} dim />
                  <span>
                    <b>{s?.name ?? h.id}</b>
                    <small>Pairs with {h.pairsWith.map((p) => partName(data, p)).join(', ')}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </aside>
  );
}

function SkillCard({
  data,
  skill,
  owned,
  picks,
  classId,
  swapping,
  onToggle,
}: {
  data: SkillshotData;
  skill: SkillshotSkill;
  owned: Map<string, number | null>;
  picks: string[];
  classId: string | null;
  swapping: boolean;
  onToggle: (id: string) => void;
}) {
  const isOwned = owned.has(skill.id);
  const rarity = owned.get(skill.id);
  const picked = picks.includes(skill.id);
  const pairs = synergiesOf(data, skill.id, classId);
  const tree = skill.tree ? TREE_COLORS[skill.tree] : undefined;
  return (
    <section className="card bm-skill" style={tree ? { ['--tier' as string]: tree } : undefined}>
      <div className="bm-skill-head">
        <SkillIcon skill={skill} size={52} rarity={rarity ?? undefined} dim={!isOwned} />
        <div>
          <div className="eyebrow">{skill.tree ?? 'Skill'}</div>
          <b>{skill.name}</b>
          <small className="muted">{!isOwned ? 'Not unlocked yet' : rarity === null || rarity === undefined ? 'Rarity not seen yet' : RARITY_NAMES[rarity]}</small>
        </div>
        <TierBadge tier={skill.tier} size={22} />
      </div>
      <p>{skill.how ?? skill.short}</p>
      {skill.note && <p className="muted">{skill.note}</p>}
      {pairs.length > 0 && (
        <div className="bm-pairs">
          <div className="bm-plan-label">Pairs with</div>
          {pairs.map((syn) => {
            const other = partnerOf(syn, skill.id);
            const yours = other.startsWith('class:') || owned.has(other);
            return (
              <div key={syn.index} className={yours ? '' : 'muted'}>
                <b>{partName(data, other)}</b>
                {!yours && ' (not unlocked)'}
                <small>{syn.tip}</small>
              </div>
            );
          })}
        </div>
      )}
      {isOwned && (
        <button className={`btn${picked ? '' : ' primary'}`} onClick={() => onToggle(skill.id)}>
          {picked ? 'Remove from build' : swapping ? 'Choose a skill to swap out' : 'Add to build'}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Starting point: the playstyle planner, now optional

function StartingPoint({
  data,
  owned,
  classId,
  stats,
  onUse,
}: {
  data: SkillshotData;
  owned: Map<string, number | null>;
  classId: string | null;
  stats: ReturnType<typeof computeStats> | null;
  onUse: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [styleId, setStyleId] = useState<string | null>(null);
  const [sliders, setSliders] = useState<Sliders>(BALANCED);
  const [simple, setSimple] = useState(true);
  const [seed, setSeed] = useState(0);
  const style = STYLES.find((x) => x.id === styleId) ?? null;
  // The search takes a moment, so it only runs while this section is open.
  const plans = useMemo(() => (open ? planBuilds({ data, sliders, style, classId, owned, simple, stats, seed }) : []), [open, data, sliders, style, classId, owned, simple, stats, seed]);

  const surprise = () => {
    const s = STYLES[Math.floor(Math.random() * STYLES.length)];
    setStyleId(s.id);
    setSliders({ ...s.sliders, spice: Math.max(s.sliders.spice, 50) });
    setSeed(Math.floor(Math.random() * 1e9) + 1);
  };

  return (
    <section className="card enter bm-start">
      <button className="bm-start-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>
          <div className="eyebrow">Need a starting point?</div>
          <small className="muted">Pick a playstyle and load a suggested build, then change anything you like.</small>
        </span>
        <span className="bm-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="bm-start-body">
          <div className="bm-styles">
            {STYLES.map((s) => (
              <button
                key={s.id}
                title={s.pitch}
                aria-pressed={styleId === s.id}
                onClick={() => {
                  setStyleId(s.id);
                  setSliders(s.sliders);
                  setSeed(0);
                }}
              >
                {s.name}
              </button>
            ))}
            <button className="surprise" onClick={surprise}>
              🎲 Surprise me
            </button>
          </div>
          {style && <p className="muted bm-pitch">{style.pitch}</p>}
          <div className="bm-sliders">
            {SLIDERS.map((sl) => (
              <label key={sl.key}>
                <b>{sl.label}</b>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sliders[sl.key]}
                  onChange={(e) => {
                    setSliders({ ...sliders, [sl.key]: Number(e.target.value) });
                    setSeed(0);
                  }}
                />
                <span className="muted">
                  <span>{sl.low}</span>
                  <span>{sl.high}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="bm-simple">
            <input type="checkbox" checked={simple} onChange={(e) => setSimple(e.target.checked)} />
            Keep it simple (mostly automatic skills)
          </label>
          <div className="bm-rows">
            {plans.map((p) => (
              <div key={p.skills.join('+')} className="bm-plan-row">
                <div className="bm-plan-icons">
                  {p.skills.map((id) => (
                    <SkillIcon key={id} skill={skillById(data, id)} size={32} rarity={owned.get(id) ?? undefined} />
                  ))}
                </div>
                <small className="muted">
                  {p.fit}% match{p.pros[0] ? `. ${p.pros[0]}` : ''}
                </small>
                <button className="btn" onClick={() => onUse(p.skills)}>
                  Use this
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
