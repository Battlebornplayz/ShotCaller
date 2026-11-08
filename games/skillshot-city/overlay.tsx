import { useEffect, useMemo, useRef, useState } from 'react';
import type { MatchRecord, SkillshotData, SkillshotLiveState, SkillshotSkill } from '../../shared/skillshot';
import { SKILL_TREES } from '../../shared/skillshot';
import type { SkillAdvice } from '../../shared/skillshotAdvisor';
import { reviewMatch, suggestSessionGoals } from '../../shared/skillshotStats';
import type { Settings } from '../../shared/types';
import { useOverlayState, useSettings, useSkillshot, useSkillshotData } from '../../src/hooks/useLive';
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
  return (
    <button
      className={`ss-card clickable${best && !reroll ? ' best' : ''}${synergy ? ' synergy' : ''}`}
      onClick={onPick}
      title={skill?.description || skill?.short}
    >
      {best && !reroll && (
        <span className="pill" style={{ position: 'absolute', top: -9, right: 8, fontSize: 10, padding: '1px 7px', background: 'var(--accent)', color: '#fff' }}>
          Take this
        </span>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <SkillIcon skill={skill} rarity={rarity} size={wide ? 46 : 34} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.15 }}>{skill?.name ?? a.skillId}</span>
            <TierBadge tier={skill?.tier} size={15} />
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            Lv {a.nextLevel}
            {keyLabel && (
              <>
                {' · '}
                <Keycap accel={keyLabel} />
              </>
            )}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.35, minHeight: 31 }}>{a.reasons[0] ?? skill?.short ?? ''}</div>
      {wide && a.reasons.slice(1).map((r) => (
        <div key={r} className="muted" style={{ fontSize: 11, marginTop: 3 }}>
          · {r}
        </div>
      ))}
      {synergy && (
        <div style={{ fontSize: 10.5, color: 'var(--green)', marginTop: 5, fontWeight: 600 }}>
          ⚡ {a.synergies.map((i) => synergyLabel(data, i)).slice(0, wide ? 3 : 1).join(' · ')}
        </div>
      )}
    </button>
  );
}

function AdvicePanel({ s, data, hotkeys, wide, onManual }: { s: SkillshotLiveState; data: SkillshotData; hotkeys: Settings['hotkeys'] | null; wide: boolean; onManual: () => void }) {
  const adv = s.advice;
  if (!s.offer || !adv) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.03)' }}>
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
      <div style={{ display: 'flex', gap: 8, marginTop: adv.reroll ? 0 : 8 }}>
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

function SynergyMeter({ s }: { s: SkillshotLiveState }) {
  const pct = Math.round(s.goalProgress * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
          <span className="muted">Goal build</span>
          <b>{s.goal.ids.length ? `${pct}%` : '—'}</b>
        </div>
        <div className="progress" style={{ height: 5 }}>
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div style={{ textAlign: 'center', minWidth: 56 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: s.activeSynergies.length ? 'var(--green)' : undefined }}>{s.activeSynergies.length}</div>
        <div className="muted" style={{ fontSize: 10 }}>
          synergies
        </div>
      </div>
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
          const max = 7;
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

function GoalRow({ s, data }: { s: SkillshotLiveState; data: SkillshotData }) {
  if (!s.goal.ids.length) {
    return (
      <div className="muted" style={{ fontSize: 11.5 }}>
        Goal build is suggested after your first 2 picks.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="section-label" style={{ margin: 0 }}>
        Goal
      </span>
      {s.goal.ids.map((id) => (
        <SkillIcon key={id} skill={skillById(data, id)} size={22} dim={!s.build[id]} rarity={s.build[id] ? (s.pool[id] ?? 0) : undefined} />
      ))}
      <button
        className="muted"
        style={{ fontSize: 11, marginLeft: 'auto', color: s.goal.locked ? 'var(--gold)' : undefined }}
        onClick={() => void window.shotcaller.setSkillshotGoal(s.goal.ids, !s.goal.locked)}
        title={s.goal.locked ? 'Unlock: let ShotCaller adjust the goal as you pick' : 'Lock this goal build'}
      >
        {s.goal.locked ? '🔒 Locked' : 'Lock'}
      </button>
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
    <div className="toast" style={{ padding: 10, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
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

function LobbyView({ s, data, wide }: { s: SkillshotLiveState; data: SkillshotData; wide: boolean }) {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const lastId = `${s.lastMatch?.id ?? ''}:${s.lastMatch?.endedAt ?? ''}`;
  useEffect(() => {
    void window.shotcaller.getSkillshotMatches().then(setMatches);
  }, [lastId]);
  const m = s.lastMatch;
  const review = useMemo(() => (m ? reviewMatch(data, m) : null), [data, m]);
  const goals = useMemo(() => suggestSessionGoals(matches), [matches]);
  const nm = (id: string | null) => (id && skillById(data, id)?.name) || id || '';
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}>
      <div>
        <div className="section-label">Last match</div>
        {m ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: m.won ? 'var(--gold)' : undefined, minWidth: 44 }}>{m.place ? `#${m.place}` : '—'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12 }}>
                  <b>{m.kills}</b>
                  <span className="muted"> kills · </span>
                  <b>{m.deaths}</b>
                  <span className="muted"> deaths · lv </span>
                  <b>{m.level}</b>
                  {!m.place && <span className="muted"> · {m.complete ? '' : 'unfinished'}</span>}
                </div>
                <div style={{ display: 'flex', gap: 3, marginTop: 4, flexWrap: 'wrap' }}>
                  {Object.entries(m.build).map(([id]) => (
                    <SkillIcon key={id} skill={skillById(data, id)} size={wide ? 26 : 20} />
                  ))}
                </div>
              </div>
            </div>
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
            No matches tracked yet.
          </div>
        )}
      </div>
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
      {s.classId && (
        <div className="muted" style={{ fontSize: 11 }}>
          Class: <b style={{ color: 'var(--text)' }}>{classLabel(data, s.classId)}</b> {s.classSource === 'auto' ? '(from your last match)' : '(picked)'}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Panel

export function SkillshotPanel({ hotkeys, wide }: SkillshotPanelProps) {
  const s = useSkillshot();
  const data = useSkillshotData();
  const overlay = useOverlayState();
  const settings = useSettings();
  const [manual, setManual] = useState(false);
  /** Bumped on a new offer / level-up: keeps the full panel open for EXPAND_MS. */
  const [burst, setBurst] = useState(0);
  /** The last burst whose time ran out. */
  const [expired, setExpired] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  // Cues: new offer → sound + expand; level-up → expand; new synergy → toast + sound.
  const seen = useRef<{ offerAt: number | null; level: number; synergies: number[] } | null>(null);
  useEffect(() => {
    if (!s) return;
    const prev = seen.current;
    seen.current = { offerAt: s.offer?.at ?? null, level: s.level, synergies: s.activeSynergies };
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
  const expanded = wide || manual || !!s.offer || interactive || burst > expired;
  const toastEl = toast && (
    <div className="toast pill green" style={{ fontSize: 12 }}>
      ⚡ {toast}
    </div>
  );

  if (!s.inMatch && !s.offer && !manual) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        {toastEl}
        <LobbyView s={s} data={data} wide={wide} />
      </div>
    );
  }

  if (!expanded) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
        {toastEl}
        <RoundStrip s={s} data={data} compact />
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
        {toastEl}
        <RoundStrip s={s} data={data} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignContent: 'start' }}>
            <div className="section-label" style={{ margin: 0 }}>
              Skill advice
            </div>
            {advice}
            <RecentPicks s={s} data={data} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12, alignContent: 'start' }}>
            <SynergyMeter s={s} />
            <GoalRow s={s} data={data} />
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
      {toastEl}
      <RoundStrip s={s} data={data} />
      {advice}
      <RecentPicks s={s} data={data} />
      <SynergyMeter s={s} />
      <BuildPanel s={s} data={data} />
      <GoalRow s={s} data={data} />
      {interactive && <Hints hotkeys={hotkeys} />}
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
