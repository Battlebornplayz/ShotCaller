import { useMemo, useState } from 'react';
import type { FnMatchRecord } from '../../shared/fortnite';
import { modeLabel } from '../../shared/fortniteLog';
import { bestLoadouts, matchScore, personalBests, rankLabel, rankValue, SCORE_FORMULA } from '../../shared/fortniteScore';
import { HealthBars, SlotRow, useInventory } from './FnPanels';

/**
 * Bests tab (Phase F4): last match score with its formula, personal bests and streaks, best loadouts,
 * the Ranked chart, and your inventory as read right now.
 */

const fmtTime = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const fmtDate = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

export function BestsTab({ matches }: { matches: FnMatchRecord[] }) {
  const bests = useMemo(() => personalBests(matches), [matches]);
  const loadouts = useMemo(() => bestLoadouts(matches).slice(0, 8), [matches]);
  const last = useMemo(() => [...matches].sort((a, b) => b.endedAt - a.endedAt)[0] ?? null, [matches]);
  const inv = useInventory();
  const [showFormula, setShowFormula] = useState(false);

  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="row" style={{ alignItems: 'baseline' }}>
          <div style={{ fontWeight: 700 }}>Last match score</div>
          <button className="pill muted" style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => setShowFormula((v) => !v)}>
            {showFormula ? 'Hide formula' : 'How it’s worked out'}
          </button>
        </div>
        {last ? <ScoreCard m={last} /> : <div className="muted">Play a match and its score shows here.</div>}
        {showFormula && (
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 4 }}>
            {SCORE_FORMULA.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Personal bests</div>
        <div className="fn-stats">
          <Best label="Most kills" value={String(bests.kills.value)} at={bests.kills.at} rarity="epic" />
          <Best label="Most chests" value={String(bests.chests.value)} at={bests.chests.at} rarity="legendary" />
          <Best label="Best score" value={String(bests.score.value)} at={bests.score.at} rarity="rare" />
          <Best label="Longest alive" value={fmtTime(bests.timeAliveMs.value)} at={bests.timeAliveMs.at} rarity="uncommon" />
          <Best label="Top-10 streak" value={`${bests.top10Streak.current}`} sub={`best ${bests.top10Streak.best}`} rarity="rare" />
          <Best label="Win streak" value={`${bests.winStreak.current}`} sub={`best ${bests.winStreak.best}`} rarity="legendary" />
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          Streaks count matches with a known placement; others are skipped, not counted as a loss. Stay on the “YOU PLACED” screen for a few seconds so it gets read.
        </div>
      </section>

      <RankedCard matches={matches} />

      <section className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Inventory right now</div>
        {inv && inv.at > 0 ? (
          <div style={{ maxWidth: 520 }}>
            <SlotRow inv={inv} big />
            <HealthBars inv={inv} />
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Read twice a second during a match. Item names show once you’ve held each item (read with Windows’ own text reader). Materials aren’t read yet.
            </div>
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>Shows during a match.</div>
        )}
      </section>

      <section className="card">
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Best loadouts</div>
        {loadouts.length ? (
          <div style={{ display: 'grid', gap: 6 }}>
            {loadouts.map((l) => (
              <div key={l.label} className="fn-match" style={{ gap: 12 }}>
                <div className="fn-match-place" title="Average score">
                  {Math.round(l.avgScore)}
                </div>
                <div style={{ flex: 1, fontSize: 13, textTransform: 'capitalize' }}>{l.label}</div>
                <div className="fn-match-num">{l.matches} {l.matches === 1 ? 'match' : 'matches'}</div>
                <div className="fn-match-num">{l.avgPlacement === null ? '—' : `avg #${Math.round(l.avgPlacement)}`}</div>
                <div className="fn-match-num">{l.wins} wins</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>Your final loadout is saved with each match from now on; the best ones show here, sorted by average score.</div>
        )}
      </section>
    </div>
  );
}

function ScoreCard({ m }: { m: FnMatchRecord }) {
  const s = matchScore(m);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div className="fn-score">{s.total}</div>
      <div style={{ display: 'grid', gap: 2, fontSize: 13 }}>
        <div className="muted">{modeLabel(m)} · {fmtDate(m.endedAt)}</div>
        <div>
          Placement <b>{s.placement ?? '—'}</b>/50 · Eliminations <b>{s.eliminations}</b>/30 · Time alive <b>{s.timeAlive}</b>/20
        </div>
        {s.placement === null && <div className="muted" style={{ fontSize: 12 }}>Placement not known for this match: the other parts are scaled to 100.</div>}
      </div>
    </div>
  );
}

function Best({ label, value, at, sub, rarity }: { label: string; value: string; at?: number | null; sub?: string; rarity: string }) {
  return (
    <div className="fn-tile" data-rarity={rarity}>
      <div className="fn-tile-value">{value}</div>
      <div className="fn-tile-label">{label}</div>
      {(sub || at) && <div className="fn-tile-label" style={{ opacity: 0.75 }}>{sub ?? fmtDate(at ?? null)}</div>}
    </div>
  );
}

/** Rank after each Ranked match, as read from the screen, over time. One line per mode (Builds / Zero Build). */
function RankedCard({ matches }: { matches: FnMatchRecord[] }) {
  const reads = matches.filter((m) => m.rank).sort((a, b) => a.endedAt - b.endedAt);
  const [hover, setHover] = useState<number | null>(null);
  const ranked = matches.filter((m) => m.kind === 'ranked').length;
  if (!reads.length) {
    return (
      <section className="card">
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Ranked</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {ranked
            ? 'No rank read yet. After a Ranked match, stay on the screen that shows your rank and progress bar for a few seconds with Fortnite in front.'
            : 'After each Ranked match, your rank and progress are read from the screen and charted here.'}
        </div>
      </section>
    );
  }
  const latest = reads[reads.length - 1].rank!;
  const values = reads.map((m) => rankValue(m.rank!.rank, m.rank!.division, m.rank!.progress));
  const lo = Math.floor(Math.min(...values));
  const hi = Math.ceil(Math.max(...values, lo + 1));
  const W = 600;
  const H = 180;
  const x = (i: number) => (reads.length === 1 ? W / 2 : 20 + (i * (W - 40)) / (reads.length - 1));
  const y = (v: number) => H - 20 - ((v - lo) / (hi - lo)) * (H - 40);
  const shown = hover !== null ? reads[hover] : reads[reads.length - 1];
  return (
    <section className="card">
      <div className="row" style={{ alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontWeight: 700 }}>Ranked</div>
        <div style={{ marginLeft: 'auto', fontSize: 13 }}>
          Now: <b>{rankLabel(latest.rank, latest.division)}</b>
          {latest.progress !== null ? ` · ${latest.progress}%` : ''}
        </div>
      </div>
      <svg className="fn-rank-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rank over time" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: hi - lo + 1 }, (_, k) => (
          <line key={k} x1={0} x2={W} y1={y(lo + k)} y2={y(lo + k)} stroke="var(--border)" strokeDasharray="2 4" />
        ))}
        <polyline points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--fn-rare)" strokeWidth={2.5} strokeLinejoin="round" />
        {values.map((v, i) => (
          <g key={reads[i].id} onMouseEnter={() => setHover(i)}>
            <rect x={x(i) - 12} y={0} width={24} height={H} fill="transparent" />
            <circle cx={x(i)} cy={y(v)} r={hover === i ? 6 : 4} fill={reads[i].zeroBuild ? 'var(--fn-epic)' : 'var(--fn-rare)'} stroke="#0b0e22" strokeWidth={2} />
          </g>
        ))}
      </svg>
      <div className="muted" style={{ fontSize: 12 }}>
        {shown.rank && `${rankLabel(shown.rank.rank, shown.rank.division)}${shown.rank.progress !== null ? ` · ${shown.rank.progress}%` : ''} · ${modeLabel(shown)} · ${fmtDate(shown.endedAt)}`}
        {' · '}Blue dots: Builds, purple: Zero Build.
      </div>
    </section>
  );
}
