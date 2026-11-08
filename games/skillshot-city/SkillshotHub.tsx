import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MatchRecord, SkillshotData } from '../../shared/skillshot';
import { avgPlace, computeStats, reviewMatch, suggestSessionGoals, winRate, type Bucket, type MatchReview } from '../../shared/skillshotStats';
import { useSkillshot, useSkillshotData } from '../../src/hooks/useLive';
import { SkillCollectionCard } from './SkillCollectionCard';
import { SkillIcon, skillById } from './ui';

/**
 * Skillshot City section of the game page: your skills, match history with pick review, and stats.
 * Matches reload whenever the tracker saves a new one (pushed lastMatch changes).
 */

type Tab = 'skills' | 'matches' | 'stats';

function useMatches(): MatchRecord[] | null {
  const live = useSkillshot();
  const [matches, setMatches] = useState<MatchRecord[] | null>(null);
  const sig = `${live?.lastMatch?.id ?? ''}:${live?.lastMatch?.endedAt ?? ''}`;
  useEffect(() => {
    let active = true;
    void window.shotcaller.getSkillshotMatches().then((m) => active && setMatches(m));
    return () => {
      active = false;
    };
  }, [sig]);
  return matches;
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const num = (v: number | null, d = 1) => (v === null ? '—' : v.toFixed(d));
const name = (data: SkillshotData | null, id: string | null) => (id && skillById(data, id)?.name) || id || '—';

function partName(data: SkillshotData, p: string) {
  return p.startsWith('class:') ? (data.classes.find((c) => `class:${c.id}` === p)?.name ?? p.slice(6)) : name(data, p);
}
const className = (data: SkillshotData | null, id: string | null) => (id && data?.classes.find((c) => c.id === id)?.name) || '—';

export function SkillshotHub() {
  const [tab, setTab] = useState<Tab>('skills');
  const data = useSkillshotData();
  const matches = useMatches();
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="segmented" style={{ marginBottom: 12 }}>
        {(
          [
            ['skills', 'Your skills'],
            ['matches', `Matches${matches ? ` (${matches.length})` : ''}`],
            ['stats', 'Stats'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'skills' && <SkillCollectionCard />}
      {tab === 'matches' && data && matches && <MatchHistory data={data} matches={matches} />}
      {tab === 'stats' && data && matches && <StatsView data={data} matches={matches} />}
      {tab !== 'skills' && (!data || !matches) && <div className="card muted">Loading…</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Match history

function MatchHistory({ data, matches }: { data: SkillshotData; matches: MatchRecord[] }) {
  const list = useMemo(() => [...matches].sort((a, b) => b.startedAt - a.startedAt), [matches]);
  const [open, setOpen] = useState<string | null>(list[0]?.id ?? null);
  if (!list.length) {
    return (
      <section className="card enter muted" style={{ fontSize: 13 }}>
        No matches yet. Every match you play is saved automatically from the game's log, with each skill offer and pick.
      </section>
    );
  }
  return (
    <section className="card enter" style={{ padding: 8 }}>
      {list.map((m) => (
        <MatchRow key={m.id} m={m} data={data} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
      ))}
    </section>
  );
}

function MatchRow({ m, data, open, onToggle }: { m: MatchRecord; data: SkillshotData; open: boolean; onToggle: () => void }) {
  const review = useMemo(() => reviewMatch(data, m), [data, m]);
  const d = new Date(m.startedAt);
  return (
    <div style={{ borderRadius: 10, background: open ? 'rgba(255,255,255,0.03)' : undefined }}>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '10px 12px', textAlign: 'left' }}>
        <div style={{ width: 44, fontSize: 20, fontWeight: 800, color: m.won ? 'var(--gold)' : m.place && m.place <= 3 ? 'var(--accent)' : undefined }}>
          {m.place ? `#${m.place}` : '—'}
        </div>
        <div style={{ width: 120 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · {className(data, m.classId)}
          </div>
        </div>
        <div style={{ width: 90, fontSize: 12 }}>
          <b>{m.kills}</b>/<b>{m.deaths}</b> <span className="muted">K/D</span>
          <div className="muted" style={{ fontSize: 11 }}>level {m.level}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
          {Object.entries(m.build)
            .sort((a, b) => b[1] - a[1])
            .map(([id, lvl]) => (
              <span key={id} title={`${name(data, id)} ${lvl}`}>
                <SkillIcon skill={skillById(data, id)} size={28} />
              </span>
            ))}
        </div>
        <div style={{ width: 110, textAlign: 'right', fontSize: 11 }} className="muted">
          {review.choices ? `Advice followed ${review.followed}/${review.choices}` : m.complete ? '' : 'Left early'}
        </div>
        <span className="muted" style={{ width: 14 }}>
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && <MatchDetail m={m} data={data} review={review} />}
    </div>
  );
}

function MatchDetail({ m, data, review }: { m: MatchRecord; data: SkillshotData; review: MatchReview }) {
  const killers = Object.entries(m.killedBy).sort((a, b) => b[1] - a[1]);
  return (
    <div className="enter" style={{ padding: '4px 12px 14px 70px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12 }}>
        {review.best && (
          <span>
            <span className="muted">Best pick: </span>
            <b style={{ color: 'var(--green)' }}>{name(data, review.best.picked)}</b>
          </span>
        )}
        {review.worst && (
          <span>
            <span className="muted">Weakest pick: </span>
            <b style={{ color: 'var(--red)' }}>{name(data, review.worst.picked)}</b>
            <span className="muted"> (advice was {name(data, review.worst.advised)})</span>
          </span>
        )}
        {m.roundResults.some((r) => r !== null) && (
          <span>
            <span className="muted">Rounds: </span>
            {m.roundResults.map((r, i) => (
              <b key={i} style={{ color: r === true ? 'var(--green)' : r === false ? 'var(--red)' : 'var(--muted)', marginRight: 4 }}>
                {r === true ? 'W' : r === false ? 'L' : '·'}
              </b>
            ))}
          </span>
        )}
        {killers.length > 0 && (
          <span>
            <span className="muted">Killed by: </span>
            {killers.map(([w, n]) => `${w}${n > 1 ? ` ×${n}` : ''}`).join(', ')}
          </span>
        )}
      </div>

      {review.synergies.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {review.synergies.map((i) => {
            const s = data.synergies.find((x) => x.index === i);
            return s ? (
              <span key={i} className="pill green" style={{ fontSize: 11 }} title={s.tip}>
                ⚡ {partName(data, s.parts[0])} + {partName(data, s.parts[1])}
              </span>
            ) : null;
          })}
        </div>
      )}

      <div>
        <div className="section-label">Picks</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
          {review.picks.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <span className="muted" style={{ width: 54 }}>
                R{p.round} · #{i + 1}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {p.offers.map((id) => {
                  const picked = id === p.picked;
                  const advised = id === p.advised;
                  return (
                    <span
                      key={id}
                      className="ss-chip"
                      style={{
                        opacity: picked ? 1 : 0.55,
                        boxShadow: picked ? 'inset 0 0 0 1px var(--accent)' : undefined,
                      }}
                    >
                      <SkillIcon skill={skillById(data, id)} size={18} />
                      {name(data, id)}
                      {advised && <span title="ShotCaller's advice" style={{ color: 'var(--green)' }}>★</span>}
                    </span>
                  );
                })}
              </div>
              <span className="muted" style={{ fontSize: 11, flex: 1 }}>
                {p.offers.length < 2 ? '' : p.followed ? '✓ followed the advice' : p.reason ? `Advice: ${p.reason.charAt(0).toLowerCase()}${p.reason.slice(1)}` : ''}
              </span>
            </div>
          ))}
          {!review.picks.length && <span className="muted">No skill picks were logged.</span>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Stats

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
      <div className="muted" style={{ fontSize: 11.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 2 }}>{value}</div>
      {sub && (
        <div className="muted" style={{ fontSize: 11 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

/** Placement per match, newest on the right; lower is better, so the line is drawn upside down. */
function Sparkline({ places }: { places: number[] }) {
  if (places.length < 2) return null;
  const w = 260;
  const h = 56;
  const max = Math.max(10, ...places);
  const pts = places.slice(-30).map((p, i, a) => [(i / (a.length - 1)) * w, ((p - 1) / (max - 1)) * (h - 8) + 4]);
  return (
    <svg width={w} height={h} role="img" aria-label="Placement trend, newest on the right">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill={places.slice(-30)[i] === 1 ? 'var(--gold)' : 'var(--accent)'} />
      ))}
    </svg>
  );
}

function StatsView({ data, matches }: { data: SkillshotData; matches: MatchRecord[] }) {
  const st = useMemo(() => computeStats(data, matches), [data, matches]);
  const goals = useMemo(() => suggestSessionGoals(matches), [matches]);
  const s = st.summary;
  const improving = st.trend.recent !== null && st.trend.previous !== null ? st.trend.previous - st.trend.recent : null;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card enter">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
          <Metric label="Win rate (1st)" value={pct(s.winRate)} sub={`${s.placed} finished matches`} />
          <Metric label="Average place" value={num(s.avgPlace)} />
          <Metric label="Top 3" value={pct(s.top3Rate)} />
          <Metric label="K/D" value={num(s.kd, 2)} />
          <Metric label="Advice followed" value={pct(st.adviceFollowRate)} />
        </div>
        {st.trend.places.length >= 2 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
            <Sparkline places={st.trend.places} />
            <div style={{ fontSize: 12 }}>
              <div className="muted">Last 10 matches: average place</div>
              <b style={{ fontSize: 16 }}>{num(st.trend.recent)}</b>
              {improving !== null && (
                <span style={{ marginLeft: 8, color: improving > 0 ? 'var(--green)' : improving < 0 ? 'var(--red)' : 'var(--muted)' }}>
                  {improving > 0 ? '▲' : improving < 0 ? '▼' : '='} {Math.abs(improving).toFixed(1)} vs the 10 before
                </span>
              )}
            </div>
          </div>
        )}
        {s.matches === 0 && (
          <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
            Stats fill in as you play: every match is read from the game's log automatically.
          </p>
        )}
      </section>

      <section className="card enter">
        <div className="section-label">Today's goals</div>
        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
          {goals.map((g) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ width: 18, color: g.done ? 'var(--green)' : 'var(--muted)' }}>{g.done ? '✓' : '○'}</span>
              <span style={{ flex: 1, textDecoration: g.done ? 'line-through' : undefined, opacity: g.done ? 0.7 : 1 }}>{g.text}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {g.progress}
              </span>
            </div>
          ))}
        </div>
      </section>

      <StatTable title="By skill" rows={st.bySkill} label={(k) => <SkillLabel data={data} id={k} />} />
      <StatTable
        title="By synergy"
        rows={st.bySynergy}
        label={(k) => {
          const syn = data.synergies.find((x) => String(x.index) === k);
          return syn ? `${partName(data, syn.parts[0])} + ${partName(data, syn.parts[1])}` : k;
        }}
      />
      <StatTable title="By build (your 3 top skills)" rows={st.byBuild} label={(k) => k.split('+').map((id) => name(data, id)).join(' + ')} />
      <StatTable title="By class" rows={st.byClass} label={(k) => className(data, k)} />
    </div>
  );
}

function SkillLabel({ data, id }: { data: SkillshotData; id: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <SkillIcon skill={skillById(data, id)} size={22} />
      {name(data, id)}
    </span>
  );
}

function StatTable({ title, rows, label }: { title: string; rows: Bucket[]; label: (key: string) => ReactNode }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return null;
  const shown = all ? rows : rows.slice(0, 8);
  return (
    <section className="card enter">
      <div className="section-label">{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 8 }}>
        <thead>
          <tr className="muted" style={{ textAlign: 'right', fontSize: 11 }}>
            <th style={{ textAlign: 'left', fontWeight: 600, padding: '4px 0' }} />
            <th style={{ fontWeight: 600 }}>Played</th>
            <th style={{ fontWeight: 600 }}>Win %</th>
            <th style={{ fontWeight: 600 }}>Avg place</th>
            <th style={{ fontWeight: 600 }}>Top 3</th>
            <th style={{ fontWeight: 600 }}>K/D</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((b) => (
            <tr key={b.key} style={{ textAlign: 'right', borderTop: '1px solid var(--border)' }}>
              <td style={{ textAlign: 'left', padding: '6px 0' }}>{label(b.key)}</td>
              <td>{b.played}</td>
              <td>{pct(winRate(b))}</td>
              <td>{num(avgPlace(b))}</td>
              <td>{b.placed ? `${b.top3}/${b.placed}` : '—'}</td>
              <td>{(b.kills / Math.max(1, b.deaths)).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 8 && (
        <button className="muted" style={{ fontSize: 12, marginTop: 8 }} onClick={() => setAll(!all)}>
          {all ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}
