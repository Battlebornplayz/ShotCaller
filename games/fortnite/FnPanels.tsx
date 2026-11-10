import { useEffect, useState } from 'react';
import type { FnLiveState, FnMatchRecord } from '../../shared/fortnite';
import { modeLabel } from '../../shared/fortniteLog';

/** Panels shared by the second-monitor window and the Fortnite page. */

export function useMatches(live: FnLiveState | null): FnMatchRecord[] {
  const [matches, setMatches] = useState<FnMatchRecord[]>([]);
  const sig = live?.lastMatch?.id ?? '';
  useEffect(() => {
    let active = true;
    void window.shotcaller.getFortniteMatches().then((m) => active && setMatches(m));
    return () => {
      active = false;
    };
  }, [sig]);
  return matches;
}

export const fmtTime = (ms: number | null) => {
  if (ms === null || !Number.isFinite(ms)) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** ▲ / ▼ against your usual, or nothing when it's about the same (within 10%) or there's no usual yet. */
function Trend({ now, usual }: { now: number | null; usual: number | null }) {
  if (now === null || usual === null || usual === 0) return null;
  const r = now / usual;
  if (r > 1.1) return <span className="fn-up" title={`Your usual: ${usual.toFixed(1)}`}>▲</span>;
  if (r < 0.9) return <span className="fn-down" title={`Your usual: ${usual.toFixed(1)}`}>▼</span>;
  return null;
}

function Cell({ label, value, now, usual }: { label: string; value: string; now?: number | null; usual?: number | null }) {
  return (
    <div className="fn-cell">
      <div className="fn-cell-value">
        {value} <Trend now={now ?? null} usual={usual ?? null} />
      </div>
      <div className="fn-cell-label">{label}</div>
    </div>
  );
}

/** Since ShotCaller started: matches, wins, kills, K/D, chests; arrows compare per-match numbers to your usual. */
export function SessionPanel({ live, matches }: { live: FnLiveState; matches: FnMatchRecord[] }) {
  const s = live.session;
  const n = matches.length;
  const usualKills = n ? matches.reduce((a, m) => a + (m.eliminations ?? 0), 0) / n : null;
  const usualChests = n ? matches.reduce((a, m) => a + m.chests, 0) / n : null;
  const kd = s.deaths ? s.eliminations / s.deaths : s.eliminations;
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">This session</div>
      <div className="fn-cells">
        <Cell label="Matches" value={String(s.matches)} />
        <Cell label="Wins" value={String(s.wins)} />
        <Cell label="Kills" value={String(s.eliminations)} now={s.matches ? s.eliminations / s.matches : null} usual={usualKills} />
        <Cell label="K/D" value={kd.toFixed(2)} />
        <Cell label="Chests" value={String(live.chests.session)} now={s.matches ? s.chests / s.matches : null} usual={usualChests} />
      </div>
      <div className="fn-note">Arrows: kills and chests per match against your usual.</div>
    </section>
  );
}

/** This match's chests by kind, and today's goal. */
export function ChestsPanel({ live, goal }: { live: FnLiveState; goal: number }) {
  const m = live.match;
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Chests</div>
      <div className="fn-cells">
        <Cell label="This match" value={String(live.chests.match)} />
        <Cell label="Rare" value={String(m?.chestKinds.rare ?? 0)} />
        <Cell label="Today" value={String(live.chests.today)} />
        <Cell label="All time" value={String(live.chests.allTime)} />
      </div>
      {goal > 0 && <GoalBar done={live.chests.today} goal={goal} />}
    </section>
  );
}

export function GoalBar({ done, goal }: { done: number; goal: number }) {
  const pct = Math.min(1, done / goal);
  return (
    <div className="fn-goal" title={`${done} of ${goal} chests today`}>
      <div className="fn-goal-text">
        <span>Goal: {goal} chests today</span>
        <b>{pct >= 1 ? 'Done!' : `${done} / ${goal}`}</b>
      </div>
      <div className="fn-goal-bar">
        <span style={{ width: `${pct * 100}%` }} data-done={pct >= 1 ? 'yes' : 'no'} />
      </div>
    </div>
  );
}

/** The last match at a glance. */
export function RecapPanel({ match }: { match: FnMatchRecord | null }) {
  if (!match) {
    return (
      <section className="fn-panel">
        <div className="fn-panel-title">Last match</div>
        <div className="fn-note">Play a match and its recap shows here.</div>
      </section>
    );
  }
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Last match · {modeLabel(match)}</div>
      <div className="fn-cells">
        <Cell label="Placed" value={match.placement ? `#${match.placement}` : '—'} />
        <Cell label="Kills" value={match.eliminations === null ? '—' : String(match.eliminations)} />
        <Cell label="Chests" value={String(match.chests)} />
        <Cell label="Time alive" value={fmtTime(match.timeAliveMs)} />
      </div>
    </section>
  );
}

/** Inventory comes with the squad link (F5); a placeholder keeps its spot in the layout. */
export function InventoryPanel() {
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Inventory</div>
      <div className="fn-slots">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="fn-slot" />
        ))}
      </div>
      <div className="fn-note">Your items show here in a later update.</div>
    </section>
  );
}
