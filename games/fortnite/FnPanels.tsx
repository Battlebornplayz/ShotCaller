import { useEffect, useState } from 'react';
import { MAP_PX_METRES, type FnDrop, type FnLiveState, type FnMapState, type FnMatchRecord, type FnSquadState } from '../../shared/fortnite';
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

/** Distance travelled this match and how well the live dot matched Fortnite's own map when you opened it. */
export function MapStatsPanel({ live }: { live: FnMapState | null }) {
  if (!live) return null;
  const km = (live.distance * MAP_PX_METRES) / 1000;
  const a = live.accuracy;
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Map this match</div>
      <div className="fn-cells">
        <Cell label="Travelled" value={km >= 1 ? `${km.toFixed(2)} km` : `${Math.round(km * 1000)} m`} />
        <Cell label="Dot checks" value={a.checks ? `${a.close}/${a.checks}` : '—'} />
        <Cell label="Off by" value={a.avgErr === null ? '—' : `${Math.round(a.avgErr * MAP_PX_METRES)} m`} />
      </div>
      <div className="fn-note">Open your map (M) now and then: ShotCaller checks your dot against Fortnite's arrow and puts it right.</div>
    </section>
  );
}

/**
 * What Fortnite's full map (M) panel showed the last time it was open: the storm timer (counted down from
 * that read), players and teams left, and each squad member's eliminations with their name as a picture.
 */
export function MapPanelPanel({ live }: { live: FnMapState | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const p = live?.panel;
  if (!p) {
    return (
      <section className="fn-panel">
        <div className="fn-panel-title">Squad</div>
        <div className="fn-note">Open your map (M) and the storm timer, players left and everyone's eliminations show here.</div>
      </section>
    );
  }
  const ago = Math.round((now - p.at) / 1000);
  const storm = p.stormSecs === null ? null : Math.max(0, p.stormSecs - ago);
  const total = p.squad.reduce((a, s) => a + s.count, 0);
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Squad</div>
      <div className="fn-cells">
        <Cell label="Storm" value={storm === null ? '—' : `${Math.floor(storm / 60)}:${String(storm % 60).padStart(2, '0')}`} />
        <Cell label="Players left" value={p.playersLeft === null ? '—' : String(p.playersLeft)} />
        {p.teamsLeft !== null && <Cell label="Teams left" value={String(p.teamsLeft)} />}
        {p.squad.length > 1 && <Cell label="Squad elims" value={String(total)} />}
      </div>
      {p.squad.length > 0 && (
        <div className="fn-squad-rows">
          {p.squad.map((s, i) => (
            <div className="fn-squad-row" key={i}>
              {s.name ? <img src={s.name} alt={`Squad member ${i + 1}`} /> : <span>Player {i + 1}</span>}
              <b>{s.count}</b>
            </div>
          ))}
        </div>
      )}
      <div className="fn-note">From your map (M), {ago < 60 ? `${ago} s` : `${Math.round(ago / 60)} min`} ago.</div>
    </section>
  );
}

/** Drop stats: for each place you've landed this season, how often and how you placed. */
export function DropStatsPanel({ drops }: { drops: FnDrop[] }) {
  const byPlace = new Map<string, { n: number; wins: number; placed: number[] }>();
  for (const d of drops) {
    if (!d.place) continue;
    const e = byPlace.get(d.place) ?? { n: 0, wins: 0, placed: [] };
    e.n++;
    if (d.placement === 1) e.wins++;
    if (d.placement) e.placed.push(d.placement);
    byPlace.set(d.place, e);
  }
  const rows = [...byPlace.entries()].sort((a, b) => b[1].n - a[1].n);
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Where you drop</div>
      {rows.length === 0 ? (
        <div className="fn-note">Land at a named place and it shows here with your average placement.</div>
      ) : (
        <table className="fn-drop-table">
          <thead>
            <tr>
              <th>Place</th>
              <th>Drops</th>
              <th>Avg place</th>
              <th>Wins</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, e]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{e.n}</td>
                <td>{e.placed.length ? `#${Math.round(e.placed.reduce((a, b) => a + b, 0) / e.placed.length)}` : '—'}</td>
                <td>{e.wins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Live squad-link state (friends, their hotbar pictures, and yours). */
export function useSquad(): FnSquadState | null {
  const [squad, setSquad] = useState<FnSquadState | null>(null);
  useEffect(() => {
    let active = true;
    void window.shotcaller.getFortniteSquad().then((s) => active && setSquad(s));
    const off = window.shotcaller.onFortniteSquad(setSquad);
    return () => {
      active = false;
      off();
    };
  }, []);
  return squad;
}

/** Your hotbar and linked friends' hotbars, as pictures cropped from each player's own screen. */
export function InventoryPanel() {
  const squad = useSquad();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const rows = [
    ...(squad?.friends ?? []).map((f) => ({ key: f.id, name: f.name, img: f.inventory, old: now - f.seenAt > 15_000, note: f.live ? ` · ${f.live.chests} chests · ${f.live.kills ?? 0} elims${f.live.reading ? '' : ' · not reading their screen'}` : ' · needs the latest ShotCaller' })),
    { key: 'me', name: 'You', img: squad?.mine ?? null, old: false, note: '' },
  ];
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Inventory</div>
      {rows.map((r) => (
        <div key={r.key} style={{ marginBottom: 8 }}>
          <div className="fn-note" style={{ margin: '0 0 4px' }}>
            {r.name}
            {r.note}
            {r.old ? ' (not updating)' : ''}
          </div>
          {r.img ? (
            <img src={r.img} alt={`${r.name}'s hotbar`} style={{ width: '100%', maxWidth: 580, borderRadius: 6, display: 'block', opacity: r.old ? 0.5 : 1 }} />
          ) : (
            <div className="fn-slots">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="fn-slot" />
              ))}
            </div>
          )}
        </div>
      ))}
      {!squad?.friends.length && <div className="fn-note">Shows during a match. Link a friend (Lobby → Squad link) to see theirs too.</div>}
    </section>
  );
}
