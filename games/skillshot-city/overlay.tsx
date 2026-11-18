import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchRecord, SkillshotData, SkillshotLiveState, SkillshotSkill } from '../../shared/skillshot';
import { MAX_LEVEL_BY_RARITY, SKILL_TREES } from '../../shared/skillshot';
import type { SkillAdvice } from '../../shared/skillshotAdvisor';
import { RARITY_NAMES } from '../../shared/skillshotCollection';
import { avgPlace, computeStats, reviewMatch, suggestSessionGoals, type SkillshotStats } from '../../shared/skillshotStats';
import type { Settings } from '../../shared/types';
import { useOverlayState, useScreenStatus, useSettings, useSkillshot, useSkillshotData } from '../../src/hooks/useLive';
import { ScreenStatusLine } from './ScreenCheckPage';
import { CompactLookup } from './SkillLookup';
import { SkillIcon, skillById, TierBadge, TREE_COLORS } from './ui';

/**
 * Skillshot City overlay panel. Everything is pushed from the main process (tracker): this only draws.
 * Corner overlay: a thin round strip during fights, the full panel on a new offer / level-up / while
 * Alt is held, a lobby view between matches. Second monitor (`wide`): the full panel, two columns.
 */

export interface SkillshotPanelProps {
  hotkeys: Settings['hotkeys'] | null;
  wide: boolean;
}

/** How long the full panel stays open after a level-up or a pick. */
const EXPAND_MS = 9000;

// ---------------------------------------------------------------------------------------------
// Sound

/** Soft two-note cue for a new offer (or three notes for a new synergy). Synthesized, no files. */
function playCue(volume: number, kind: 'offer' | 'synergy'): void {
  if (volume <= 0) return;
  try {
    const ctx = new AudioContext();
    const out = ctx.createGain();
    out.gain.value = Math.min(1, volume) * 0.22;
    out.connect(ctx.destination);
    const notes = kind === 'offer' ? [659.25, 987.77] : [523.25, 659.25, 1046.5];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + 0.03 + i * 0.09;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.6, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.55);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch {
    /* audio unavailable */
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers

function partName(data: SkillshotData, part: string): string {
  if (part.startsWith('class:')) return data.classes.find((c) => `class:${c.id}` === part)?.name ?? part.slice(6);
  return data.skills.find((s) => s.id === part)?.name ?? part;
}

function synergyLabel(data: SkillshotData, index: number): string {
  const s = data.synergies.find((x) => x.index === index);
  return s ? `${partName(data, s.parts[0])} + ${partName(data, s.parts[1])}` : `Synergy ${index}`;
}

const classLabel = (data: SkillshotData | null, id: string | null) =>
  (id && data?.classes.find((c) => c.id === id)?.name) || (id ? id.charAt(0) + id.slice(1).toLowerCase() : null);

function Keycap({ accel }: { accel: string | undefined }) {
  if (!accel) return null;
  return (
    <span style={{ fontWeight: 700, fontSize: 10.5, padding: '1px 5px', borderRadius: 5, background: 'rgba(255,255,255,0.08)', color: 'var(--text)' }}>
      {accel}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
      <b style={{ fontSize: 13, color }}>{value}</b>
      <span className="muted" style={{ fontSize: 10.5 }}>
        {label}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Pieces

/** Round, level, K/D and friends on one line. */
function RoundStrip({ s, data, compact }: { s: SkillshotLiveState; data: SkillshotData | null; compact?: boolean }) {
  const build = Object.entries(s.build);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3 }}>
        <b style={{ fontSize: 15 }}>{s.final ? 'Final' : `R${s.round}`}</b>
        {!s.final && <span className="muted" style={{ fontSize: 11 }}>/3</span>}
      </span>
      <span style={{ display: 'flex', gap: 3 }}>
        {[1, 2, 3].map((r) => {
          const res = s.roundResults[r - 1];
          return (
            <span
              key={r}
              style={{
                width: 16,
                height: 5,
                borderRadius: 4,
                background: res === true ? 'var(--green)' : res === false ? 'var(--red)' : r <= s.round ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
              }}
            />
          );
        })}
      </span>
      <Stat label="lv" value={s.level || '–'} />
      <Stat label="K/D" value={`${s.kills}/${s.deaths}`} />
      {s.syringes > 0 && <Stat label="syr" value={s.syringes} color="var(--green)" />}
      {s.wanted > 0 && <Stat label="wanted" value={'★'.repeat(Math.min(5, s.wanted))} color="var(--gold)" />}
      {compact && build.length > 0 && (
        <span style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
          {build.slice(0, 6).map(([id, lvl]) => (
            <SkillIcon key={id} skill={skillById(data, id)} rarity={s.pool[id]} size={20} label={String(lvl)} />
          ))}
        </span>
      )}
    </div>
  );
}

function AdviceCard({
  a,
  skill,
  best,
  reroll,
  rarity,
  keyLabel,
  data,
  onPick,
  wide,
}: {
  a: SkillAdvice;
  skill: SkillshotSkill | null;
  best: boolean;
  reroll: boolean;
  rarity: number | undefined;
  keyLabel: string | undefined;
  data: SkillshotData;
  onPick: () => void;
  wide: boolean;
}) {
  const synergy = a.synergies.length > 0;
  const recommended = best && !reroll;
  return (
    <button
      className={`ss-card clickable${recommended ? ' best' : ''}${synergy ? ' synergy' : ''}${wide ? ' wide' : ''}`}
      onClick={onPick}
      title={skill?.how || skill?.description || skill?.short}
    >
      {recommended && <span className="shine" />}
      <span className="ss-icon">
        <SkillIcon skill={skill} rarity={rarity} size={wide ? 60 : 52} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ flex: 1 }}>{recommended ? 'Take this' : reroll ? 'Weak for this build' : 'Other option'}</span>
          <Keycap accel={keyLabel} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 16, lineHeight: 1.2, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill?.name ?? a.skillId}</span>
          <TierBadge tier={skill?.tier} size={16} />
          <span className="muted" style={{ fontSize: 11.5, flex: 'none' }}>
            Lv {a.nextLevel}
          </span>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 3, lineHeight: 1.35 }}>
          {a.reasons[0] ?? skill?.short ?? ''}
        </div>
        {wide && skill?.how && <div style={{ fontSize: 12, marginTop: 5, lineHeight: 1.35 }}>{skill.how}</div>}
        {wide &&
          a.reasons.slice(1).map((r) => (
            <div key={r} className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
              · {r}
            </div>
          ))}
        {synergy && (
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4, fontWeight: 700 }}>
            ⚡ {a.synergies.map((i) => synergyLabel(data, i)).slice(0, wide ? 3 : 1).join(' · ')}
          </div>
        )}
      </div>
    </button>
  );
}

function AdvicePanel({ s, data, hotkeys, wide, onManual }: { s: SkillshotLiveState; data: SkillshotData; hotkeys: Settings['hotkeys'] | null; wide: boolean; onManual: () => void }) {
  const adv = s.advice;
  if (!s.offer || !adv) {
    return (
      <div className="tile" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
        <span className="muted" style={{ fontSize: 12, flex: 1 }}>
          Waiting for your next skill offer.
        </span>
        <button className="btn" style={{ fontSize: 11.5, padding: '4px 9px' }} onClick={onManual}>
          Set offers
        </button>
      </div>
    );
  }
  return (
    <div>
      {adv.reroll && (
        <div className="toast" style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 9, marginBottom: 8, color: 'var(--gold)', background: 'rgba(245,196,81,0.1)', border: '1px solid rgba(245,196,81,0.3)' }}>
          ↻ Both are weak for this build. Reroll if you can.
        </div>
      )}
      {/* One card per row, the shape of the unlock card: side by side cuts off the skill names. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {adv.offers.map((a, i) => (
          <AdviceCard
            key={a.skillId}
            a={a}
            skill={skillById(data, a.skillId)}
            best={i === adv.best}
            reroll={adv.reroll}
            rarity={s.pool[a.skillId]}
            keyLabel={i === 0 ? hotkeys?.pick1 : i === 1 ? hotkeys?.pick2 : undefined}
            data={data}
            wide={wide}
            onPick={() => void window.shotcaller.pickSkillshot(a.skillId)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span className="muted" style={{ fontSize: 10.5 }}>
          {s.offer.source === 'manual' ? 'Offers set by hand' : s.offer.source === 'screen' ? 'Read from screen' : 'Read from memory'}
        </span>
        <button className="muted" style={{ fontSize: 10.5 }} onClick={onManual}>
          Change
        </button>
      </div>
    </div>
  );
}

/** Advice from Claude, when the optional connection is on. Kept apart from ShotCaller's own advisor. */
function CoachNote({ coach, data }: { coach: NonNullable<SkillshotLiveState['coach']>; data: SkillshotData }) {
  const skill = skillById(data, coach.skillId);
  return (
    <div className="tier-row toast" style={{ ['--tier' as string]: '#c39bff', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px 9px 13px' }}>
      {skill && <SkillIcon skill={skill} size={36} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="eyebrow">Claude says</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.35, marginTop: 1 }}>{coach.text}</div>
      </div>
    </div>
  );
}

function RecentPicks({ s, data }: { s: SkillshotLiveState; data: SkillshotData | null }) {
  const picks = s.recentPicks.slice(-3);
  if (!picks.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="section-label" style={{ margin: 0 }}>
        Last picks
      </span>
      {picks.map((p, i) => (
        <span key={i} className="ss-chip" title={p.confirmed ? 'Confirmed by the game log' : 'Waiting for the game log to confirm'} style={{ opacity: p.confirmed ? 1 : 0.7 }}>
          <SkillIcon skill={skillById(data, p.skillId)} rarity={s.pool[p.skillId]} size={18} />
          {skillById(data, p.skillId)?.name ?? p.skillId} {p.level}
          {!p.confirmed && <span className="muted">…</span>}
        </span>
      ))}
    </div>
  );
}

function BuildPanel({ s, data, wide }: { s: SkillshotLiveState; data: SkillshotData; wide?: boolean }) {
  const entries = Object.entries(s.build);
  const linked = new Set<string>();
  for (const i of s.activeSynergies) {
    const syn = data.synergies.find((x) => x.index === i);
    syn?.parts.forEach((p) => !p.startsWith('class:') && linked.add(p));
  }
  if (!entries.length)
    return (
      <div className="muted" style={{ fontSize: 12 }}>
        No skills yet this match.
      </div>
    );
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {entries.map(([id, lvl]) => {
          const skill = skillById(data, id);
          const max = MAX_LEVEL_BY_RARITY[s.pool[id] ?? 3] ?? 7;
          return (
            <div key={id} style={{ width: wide ? 64 : 48, textAlign: 'center' }} title={skill?.short}>
              <SkillIcon
                skill={skill}
                rarity={s.pool[id] ?? 0}
                size={wide ? 46 : 38}
                style={{ margin: '0 auto', outline: linked.has(id) ? '2px solid rgba(61,220,151,0.7)' : undefined, outlineOffset: 2 }}
              />
              <div style={{ display: 'flex', gap: 2, justifyContent: 'center', marginTop: 4 }}>
                {Array.from({ length: max }, (_, i) => (
                  <span key={i} className={`ss-pip${i < lvl ? ' on' : ''}`} style={{ width: wide ? 6 : 4 }} />
                ))}
              </div>
              {wide && <div style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.2 }}>{skill?.name ?? id}</div>}
            </div>
          );
        })}
      </div>
      {s.activeSynergies.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
          {s.activeSynergies.map((i) => (
            <span key={i} className="pill green" style={{ fontSize: 10.5 }}>
              ⚡ {synergyLabel(data, i)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Why a missing goal skill is worth looking for, in a few words. */
function goalReason(s: SkillshotLiveState, data: SkillshotData, id: string): string {
  const has = (p: string) => (p.startsWith('class:') ? p === `class:${s.classId}` : !!s.build[p]);
  const partners: string[] = [];
  for (const syn of data.synergies) {
    const i = syn.parts.indexOf(id);
    if (i < 0) continue;
    const other = syn.parts[1 - i];
    if (has(other)) partners.push(partName(data, other));
  }
  if (partners.length) return `Pairs with ${partners.slice(0, 2).join(' and ')}`;
  const tier = skillById(data, id)?.tier;
  return tier ? `Strong pick (tier ${tier})` : 'Fills out the build';
}

/**
 * The goal build as a path: what you have, then what's still missing in order, each with why it
 * helps. A missing skill that's in the offer right now is called out.
 */
function GoalPath({ s, data, wide }: { s: SkillshotLiveState; data: SkillshotData; wide?: boolean }) {
  const pct = Math.round(s.goalProgress * 100);
  const lockBtn = s.goal.ids.length > 0 && (
    <button
      className="muted"
      style={{ fontSize: 11, color: s.goal.locked ? 'var(--gold)' : undefined }}
      onClick={() => void window.shotcaller.setSkillshotGoal(s.goal.ids, !s.goal.locked)}
      title={s.goal.locked ? 'Unlock: let ShotCaller adjust the goal as you pick' : 'Lock this goal build so it stops changing'}
    >
      {s.goal.locked ? '🔒 Locked' : 'Lock'}
    </button>
  );
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="section-label" style={{ margin: 0, flex: 1 }}>
        Goal build {s.goal.ids.length > 0 && <b style={{ color: 'var(--text)' }}>{pct}%</b>}
      </span>
      <span style={{ fontSize: 11, color: s.activeSynergies.length ? 'var(--green)' : undefined }} className={s.activeSynergies.length ? undefined : 'muted'}>
        ⚡ {s.activeSynergies.length} {s.activeSynergies.length === 1 ? 'synergy' : 'synergies'}
      </span>
      {lockBtn}
    </div>
  );
  if (!s.goal.ids.length) {
    return (
      <div style={{ display: 'grid', gap: 4 }}>
        {head}
        <div className="muted" style={{ fontSize: 11.5 }}>
          Your goal build is suggested after your first 2 picks.
        </div>
      </div>
    );
  }
  const owned = s.goal.ids.filter((id) => s.build[id]);
  const missing = s.goal.ids.filter((id) => !s.build[id]);
  const offered = new Set(s.offer?.ids ?? []);
  const shown = wide ? missing : missing.slice(0, 3);
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {head}
      <div className="progress" style={{ height: 4 }}>
        <span style={{ width: `${pct}%` }} />
      </div>
      {owned.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 10.5, marginRight: 2 }}>
            Have
          </span>
          {owned.map((id) => (
            <SkillIcon key={id} skill={skillById(data, id)} rarity={s.pool[id] ?? 0} size={20} label={String(s.build[id])} />
          ))}
        </div>
      )}
      {missing.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>✓ Goal build done. Level these up.</div>
      ) : (
        <div style={{ display: 'grid', gap: 4 }}>
          {shown.map((id, i) => {
            const skill = skillById(data, id);
            const now = offered.has(id);
            return (
              <div
                key={id}
                className={now ? 'toast' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 6px',
                  borderRadius: 8,
                  background: now ? 'rgba(61,220,151,0.12)' : i === 0 ? 'rgba(255,255,255,0.04)' : undefined,
                  border: now ? '1px solid rgba(61,220,151,0.4)' : '1px solid transparent',
                }}
                title={skill?.short}
              >
                <span className="muted" style={{ fontSize: 10.5, width: 12, textAlign: 'right' }}>
                  {owned.length + i + 1}
                </span>
                <SkillIcon skill={skill} size={22} dim={!now} rarity={s.pool[id]} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{skill?.name ?? id}</div>
                  <div className="muted" style={{ fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {goalReason(s, data, id)}
                  </div>
                </div>
                {now ? (
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--green)' }}>OFFERED</span>
                ) : (
                  i === 0 && <span className="muted" style={{ fontSize: 10.5 }}>next</span>
                )}
              </div>
            );
          })}
          {shown.length < missing.length && (
            <span className="muted" style={{ fontSize: 10.5 }}>
              +{missing.length - shown.length} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Icon grid to set the 2 offered skills by hand (fallback until screen reading lands). */
function ManualPick({ s, data, onClose }: { s: SkillshotLiveState; data: SkillshotData; onClose: () => void }) {
  const [sel, setSel] = useState<string[]>(s.offer?.ids ?? []);
  const [q, setQ] = useState('');
  const [tree, setTree] = useState<string | null>(null);
  const skills = useMemo(() => {
    const pool = new Set(Object.keys(s.pool));
    return data.skills
      .filter((x) => !tree || x.tree === tree)
      .filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()) || x.nameEn.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => Number(pool.has(b.id)) - Number(pool.has(a.id)) || a.name.localeCompare(b.name));
  }, [data.skills, s.pool, q, tree]);
  const toggle = (id: string) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)));
  const apply = () => {
    void window.shotcaller.setSkillshotOffer(sel);
    onClose();
  };
  return (
    <div className="toast tile" style={{ padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <b style={{ fontSize: 12, flex: 1 }}>Which 2 skills are offered?</b>
        <button className="muted" style={{ fontSize: 11 }} onClick={onClose}>
          Cancel
        </button>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search skills"
        style={{ width: '100%', fontSize: 12, padding: '5px 8px', borderRadius: 8, marginBottom: 6 }}
      />
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
        {SKILL_TREES.map((t) => (
          <button
            key={t}
            className="ss-chip"
            aria-pressed={tree === t}
            onClick={() => setTree(tree === t ? null : t)}
            style={{ padding: '2px 8px', color: tree === t ? '#0f1023' : TREE_COLORS[t], background: tree === t ? TREE_COLORS[t] : undefined }}
          >
            {t}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 2, maxHeight: 190, overflowY: 'auto' }}>
        {skills.map((x) => (
          <button key={x.id} className="ss-grid-btn" aria-pressed={sel.includes(x.id)} onClick={() => toggle(x.id)} title={x.name}>
            <SkillIcon skill={x} size={34} rarity={s.pool[x.id]} dim={Object.keys(s.pool).length > 0 && s.pool[x.id] === undefined} />
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sel.length ? sel.map((id) => skillById(data, id)?.name ?? id).join(' + ') : 'Pick 2 (skills in your build are listed first)'}
        </span>
        <button className="btn primary" style={{ fontSize: 11.5, padding: '4px 10px' }} disabled={!sel.length} onClick={apply}>
          Get advice
        </button>
      </div>
    </div>
  );
}

/** A few plain-word tips for the next match, from the last match and your history. */
function tryNext(data: SkillshotData, m: MatchRecord | null, review: ReturnType<typeof reviewMatch> | null, stats: SkillshotStats | null): string[] {
  const tips: string[] = [];
  const nm = (id: string | null) => (id && skillById(data, id)?.name) || id || '';
  if (review?.worst?.advised && review.worst.picked) {
    tips.push(`If ${nm(review.worst.picked)} and ${nm(review.worst.advised)} show up together again, take ${nm(review.worst.advised)}.`);
  }
  if (m && review && review.synergies.length === 0 && Object.keys(m.build).length >= 3) {
    tips.push('No synergies last match. Aim for two skills that pair up: the goal build shows which.');
  }
  const best = stats?.byBuild.filter((b) => b.placed >= 2).sort((x, y) => (avgPlace(x) ?? 99) - (avgPlace(y) ?? 99))[0];
  if (best) {
    const names = best.key.split('+').map(nm).join(' + ');
    tips.push(`Your best build so far: ${names} (average #${(avgPlace(best) ?? 0).toFixed(1)} over ${best.placed}).`);
  }
  if (m && m.deaths > m.kills + 2) tips.push('You went down a lot: play safer early and use syringes to heal.');
  if (stats && stats.adviceFollowRate !== null && stats.adviceFollowRate < 0.5 && stats.summary.matches >= 3) {
    tips.push(`You follow the advice ${Math.round(stats.adviceFollowRate * 100)}% of the time. Try trusting "Take this" for a match.`);
  }
  return tips;
}

function RoundDots({ results }: { results: (boolean | null)[] }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }} title="Rounds: green won, red lost">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ width: 14, height: 5, borderRadius: 4, background: results[i] === true ? 'var(--green)' : results[i] === false ? 'var(--red)' : 'rgba(255,255,255,0.12)' }}
        />
      ))}
    </span>
  );
}

function LobbyView({ s, data, wide }: { s: SkillshotLiveState; data: SkillshotData; wide: boolean }) {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const lastId = `${s.lastMatch?.id ?? ''}:${s.lastMatch?.endedAt ?? ''}`;
  useEffect(() => {
    void window.shotcaller.getSkillshotMatches().then(setMatches);
  }, [lastId]);
  const m = s.lastMatch;
  const review = useMemo(() => (m ? reviewMatch(data, m) : null), [data, m]);
  const stats = useMemo(() => (matches.length ? computeStats(data, matches) : null), [data, matches]);
  const goals = useMemo(() => suggestSessionGoals(matches), [matches]);
  const tips = useMemo(() => tryNext(data, m, review, stats), [data, m, review, stats]);
  const nm = (id: string | null) => (id && skillById(data, id)?.name) || id || '';
  const trend = stats?.trend;
  const better = trend && trend.recent !== null && trend.previous !== null ? trend.previous - trend.recent : null;

  const recap = (
    <div>
      <div className="section-label">Last match</div>
      {m ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: m.won ? 'var(--gold)' : undefined, minWidth: 44 }}>{m.place ? `#${m.place}` : '—'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  <b>{m.kills}</b>
                  <span className="muted"> kills · </span>
                  <b>{m.deaths}</b>
                  <span className="muted"> deaths · lv </span>
                  <b>{m.level}</b>
                </span>
                <RoundDots results={m.roundResults} />
                {!m.place && !m.complete && <span className="muted">unfinished</span>}
              </div>
              <div style={{ display: 'flex', gap: 3, marginTop: 5, flexWrap: 'wrap' }}>
                {Object.entries(m.build)
                  .sort((x, y) => y[1] - x[1])
                  .map(([id, lvl]) => (
                    <SkillIcon key={id} skill={skillById(data, id)} size={wide ? 26 : 22} label={String(lvl)} />
                  ))}
              </div>
            </div>
          </div>
          {review && review.synergies.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {review.synergies.slice(0, wide ? 4 : 2).map((i) => (
                <span key={i} className="pill green" style={{ fontSize: 10.5 }}>
                  ⚡ {synergyLabel(data, i)}
                </span>
              ))}
            </div>
          )}
          {review && review.choices > 0 && (
            <div style={{ display: 'grid', gap: 3, marginTop: 8, fontSize: 11.5 }}>
              <span>
                <span className="muted">Advice followed </span>
                <b>
                  {review.followed}/{review.choices}
                </b>
              </span>
              {review.best && (
                <span>
                  <span className="muted">Best pick </span>
                  <b style={{ color: 'var(--green)' }}>{nm(review.best.picked)}</b>
                </span>
              )}
              {review.worst && (
                <span>
                  <span className="muted">Weakest </span>
                  <b style={{ color: 'var(--red)' }}>{nm(review.worst.picked)}</b>
                  <span className="muted"> → {nm(review.worst.advised)} was better</span>
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          No matches tracked yet. Play one and your recap shows here.
        </div>
      )}
    </div>
  );

  const next = tips.length > 0 && (
    <div>
      <div className="section-label">Try next match</div>
      <div style={{ display: 'grid', gap: 4, marginTop: 5 }}>
        {tips.slice(0, wide ? 4 : 2).map((t) => (
          <div key={t} style={{ display: 'flex', gap: 7, fontSize: 11.5, lineHeight: 1.35 }}>
            <span style={{ color: 'var(--accent)' }}>→</span>
            <span style={{ flex: 1 }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const form = stats && stats.summary.placed > 0 && (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11.5 }}>
      {trend?.recent != null && (
        <span title="Your average place over your last 10 finished matches">
          <span className="muted">Recent avg </span>
          <b>#{trend.recent.toFixed(1)}</b>
          {better !== null && Math.abs(better) >= 0.1 && (
            <span style={{ color: better > 0 ? 'var(--green)' : 'var(--red)', marginLeft: 4 }}>{better > 0 ? '▲ better' : '▼ worse'}</span>
          )}
        </span>
      )}
      {stats.summary.winRate !== null && (
        <span>
          <span className="muted">Wins </span>
          <b>{Math.round(stats.summary.winRate * 100)}%</b>
        </span>
      )}
      {stats.summary.kd !== null && (
        <span title="Kills per death">
          <span className="muted">K/D </span>
          <b>{stats.summary.kd.toFixed(1)}</b>
        </span>
      )}
    </div>
  );

  const today = (
    <div>
      <div className="section-label">Today's goals</div>
      <div style={{ display: 'grid', gap: 3, marginTop: 5 }}>
        {goals.slice(0, wide ? 4 : 3).map((g) => (
          <div key={g.id} style={{ display: 'flex', gap: 7, fontSize: 11.5 }}>
            <span style={{ color: g.done ? 'var(--green)' : 'var(--muted)' }}>{g.done ? '✓' : '○'}</span>
            <span style={{ flex: 1, opacity: g.done ? 0.65 : 1 }}>{g.text}</span>
            <span className="muted">{g.progress}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const cls = s.classId && (
    <div className="muted" style={{ fontSize: 11 }}>
      Class: <b style={{ color: 'var(--text)' }}>{classLabel(data, s.classId)}</b> {s.classSource === 'auto' ? '(from your last match)' : '(picked)'}
    </div>
  );

  if (wide) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 14 }}>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {recap}
          {next}
        </div>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          {form}
          {today}
          {cls}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      {recap}
      {next}
      {form}
      {today}
      {cls}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Panel

export function SkillshotPanel({ hotkeys, wide }: SkillshotPanelProps) {
  const s = useSkillshot();
  const data = useSkillshotData();
  const screen = useScreenStatus();
  const overlay = useOverlayState();
  const settings = useSettings();
  const [manual, setManual] = useState(false);
  const [lookup, setLookup] = useState(false);
  /** Bumped on a new offer / level-up: keeps the full panel open for EXPAND_MS. */
  const [burst, setBurst] = useState(0);
  /** The last burst whose time ran out. */
  const [expired, setExpired] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Cues: new offer → sound + expand; level-up → expand; new synergy → toast + sound; rarity up → toast.
  const seen = useRef<{ offerAt: number | null; level: number; synergies: number[]; rarityUpAt: number | null } | null>(null);
  useEffect(() => {
    if (!s) return;
    const prev = seen.current;
    seen.current = { offerAt: s.offer?.at ?? null, level: s.level, synergies: s.activeSynergies, rarityUpAt: s.rarityUp?.at ?? null };
    if (!prev) return;
    const vol = settings?.popups.volume ?? 0.6;
    const sound = settings?.skillshot.offerSound ?? true;
    if (s.offer && s.offer.at !== prev.offerAt) {
      if (sound) playCue(vol, 'offer');
      setBurst((b) => b + 1);
    }
    if (s.level > prev.level) setBurst((b) => b + 1);
    const added = s.activeSynergies.filter((i) => !prev.synergies.includes(i));
    if (added.length && data) {
      setToast(`Synergy active: ${synergyLabel(data, added[0])}`);
      if (sound) playCue(vol, 'synergy');
    } else if (s.rarityUp && s.rarityUp.at !== prev.rarityUpAt && data) {
      setToast(`${skillById(data, s.rarityUp.skillId)?.name ?? s.rarityUp.skillId} is now ${RARITY_NAMES[s.rarityUp.rarity]}`);
    }
  }, [s, data, settings]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setExpired(burst), EXPAND_MS);
    return () => clearTimeout(t);
  }, [burst]);

  if (!s) return <div className="muted">Loading…</div>;
  if (!s.available) return <div className="muted" style={{ fontSize: 12 }}>{s.reason ?? 'Skillshot City data not available.'}</div>;
  if (!data) return <div className="muted">Loading skills…</div>;

  const interactive = overlay?.interactive ?? false;
  const expanded = wide || manual || lookup || !!s.offer || interactive || burst > expired;
  const toastEl = toast && (
    <div className="toast pill green" style={{ fontSize: 12 }}>
      ⚡ {toast}
    </div>
  );

  const statusEl = (
    <>
      <ScreenStatusLine status={screen} data={data} />
      {s.coach && <CoachNote coach={s.coach} data={data} />}
    </>
  );

  const lookupEl = lookup ? (
    <CompactLookup data={data} build={s.build} onClose={() => setLookup(false)} />
  ) : (
    <button className="muted" style={{ fontSize: 11, textAlign: 'left' }} onClick={() => setLookup(true)}>
      🔍 Look up a skill
    </button>
  );

  if (!s.inMatch && !s.offer && !manual) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        {statusEl}
        {toastEl}
        <LobbyView s={s} data={data} wide={wide} />
        {lookupEl}
        {interactive && !wide && <LookControls />}
      </div>
    );
  }

  if (!expanded) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
        {s.coach && <CoachNote coach={s.coach} data={data} />}
        {toastEl}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <ScreenStatusLine status={screen} data={data} compact />
          <div style={{ flex: 1, minWidth: 0 }}>
            <RoundStrip s={s} data={data} compact />
          </div>
        </div>
      </div>
    );
  }

  const advice = manual ? (
    <ManualPick s={s} data={data} onClose={() => setManual(false)} />
  ) : (
    <AdvicePanel s={s} data={data} hotkeys={hotkeys} wide={wide} onManual={() => setManual(true)} />
  );

  if (wide) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
        {statusEl}
        {toastEl}
        <RoundStrip s={s} data={data} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignContent: 'start' }}>
            <div className="section-label" style={{ margin: 0 }}>
              Skill advice
            </div>
            {advice}
            <RecentPicks s={s} data={data} />
            {lookupEl}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignContent: 'start' }}>
            <GoalPath s={s} data={data} wide />
            <div className="section-label" style={{ margin: 0 }}>
              Build
            </div>
            <BuildPanel s={s} data={data} wide />
          </div>
        </div>
        <Hints hotkeys={hotkeys} />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      {statusEl}
      {toastEl}
      <RoundStrip s={s} data={data} />
      {advice}
      {/* Your build already shows every pick: the list only matters while one waits for the log. */}
      {s.recentPicks.some((p) => !p.confirmed) && <RecentPicks s={s} data={data} />}
      <BuildPanel s={s} data={data} />
      <GoalPath s={s} data={data} />
      {(interactive || lookup) && lookupEl}
      {interactive && <Hints hotkeys={hotkeys} />}
      {interactive && <LookControls />}
    </div>
  );
}

function Hints({ hotkeys }: { hotkeys: Settings['hotkeys'] | null }) {
  return (
    <div className="muted" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10.5 }}>
      <span>
        <Keycap accel={hotkeys?.pick1} /> <Keycap accel={hotkeys?.pick2} /> pick
      </span>
      <span>
        <Keycap accel={hotkeys?.nextRound} /> next round
      </span>
      <span>
        <Keycap accel={hotkeys?.endMatch} /> end match
      </span>
    </div>
  );
}

/** Hold Alt: quick size and see-through buttons for the corner card (also in Settings → Overlay). */
function LookControls() {
  const settings = useSettings();
  const overlay = useOverlayState();
  if (!settings || !overlay) return null;
  const scale = settings.skillshot.cardScale;
  const see = settings.overlay.idleOpacity;
  const round = (v: number) => Math.round(v * 100) / 100;
  const setScale = (v: number) => void window.shotcaller.updateSettings({ skillshot: { cardScale: round(Math.min(1.5, Math.max(0.8, v))) } });
  const setSee = (v: number) => void window.shotcaller.updateSettings({ overlay: { idleOpacity: round(Math.min(1, Math.max(0.3, v))) } });
  const btn = { fontSize: 12, fontWeight: 800, width: 22, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.08)' } as const;
  return (
    <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, flexWrap: 'wrap' }}>
      <span>Size</span>
      <button style={btn} onClick={() => setScale(scale - 0.1)} title="Smaller">
        −
      </button>
      <b style={{ color: 'var(--text)', minWidth: 30, textAlign: 'center' }}>{Math.round(scale * 100)}%</b>
      <button style={btn} onClick={() => setScale(scale + 0.1)} title="Bigger">
        +
      </button>
      <span style={{ marginLeft: 8 }} title="How solid the card is when you're not holding Alt">
        Solid
      </span>
      <button style={btn} onClick={() => setSee(see - 0.1)} title="More see-through">
        −
      </button>
      <b style={{ color: 'var(--text)', minWidth: 30, textAlign: 'center' }}>{Math.round(see * 100)}%</b>
      <button style={btn} onClick={() => setSee(see + 0.1)} title="Less see-through">
        +
      </button>
    </div>
  );
}
