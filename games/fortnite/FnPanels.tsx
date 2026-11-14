import { useEffect, useState } from 'react';
import { MAP_PX_METRES, type FnDrop, type FnInventory, type FnLiveState, type FnMapState, type FnMatchRecord, type FnRarity, type FnRoute, type FnSquadState } from '../../shared/fortnite';
import { modeLabel } from '../../shared/fortniteLog';
import { SCORE_LINE_POINTS, SCORE_STOPS_POINTS } from '../../shared/fortniteRoute';

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
  // How well you followed your planned route, when you had one that match.
  const [loaded, setPlanned] = useState<FnRoute | null>(null);
  const id = match?.id ?? null;
  const planned = loaded && loaded.matchId === id ? loaded : null;
  useEffect(() => {
    if (!id) return;
    let active = true;
    void window.shotcaller.getFortniteRoute(id).then((r) => active && setPlanned(r?.planScore !== undefined ? r : null));
    return () => {
      active = false;
    };
  }, [id]);
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
        {planned && <Cell label="Route score" value={String(planned.planScore)} />}
      </div>
      {planned && (
        <div className="fn-note" title="How the route score is worked out">
          Route: {planned.planReached}/{planned.plan?.length ?? 0} stops reached = {Math.round((SCORE_STOPS_POINTS * (planned.planReached ?? 0)) / Math.max(1, planned.plan?.length ?? 1))} of {SCORE_STOPS_POINTS}
          {' · '}
          {Math.round((planned.planOnLine ?? 0) * 100)}% of your path on the line = {Math.round(SCORE_LINE_POINTS * (planned.planOnLine ?? 0))} of {SCORE_LINE_POINTS}
        </div>
      )}
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

/** Your inventory as read from the screen (Phase F4). */
export function useInventory(): FnInventory | null {
  const [inv, setInv] = useState<FnInventory | null>(null);
  useEffect(() => {
    let active = true;
    void window.shotcaller.getFortniteInventory().then((s) => active && setInv(s));
    const off = window.shotcaller.onFortniteInventory(setInv);
    return () => {
      active = false;
      off();
    };
  }, []);
  return inv;
}

export const RARITY_VAR: Record<FnRarity, string> = {
  common: 'var(--fn-common)',
  uncommon: 'var(--fn-uncommon)',
  rare: 'var(--fn-rare)',
  epic: 'var(--fn-epic)',
  legendary: 'var(--fn-legendary)',
  mythic: 'var(--fn-mythic)',
  exotic: 'var(--fn-exotic)',
};

/** Slots 1-5 as tiles in their rarity colours, with the count and (once held) the item's name. */
export function SlotRow({ inv, big }: { inv: FnInventory; big?: boolean }) {
  return (
    <div className="fn-slots" data-big={big ? 'yes' : undefined}>
      {inv.slots.map((s) => (
        <div
          key={s.slot}
          className="fn-slot"
          data-empty={s.empty ? 'yes' : undefined}
          data-held={s.held ? 'yes' : undefined}
          style={s.rarity ? { ['--slot' as string]: RARITY_VAR[s.rarity] } : undefined}
          title={s.empty ? `Slot ${s.slot}: empty` : `Slot ${s.slot}: ${s.name ?? 'item (hold it once to read its name)'}${s.rarity ? ` · ${s.rarity}` : ''}`}
        >
          <span className="fn-slot-key">{s.slot}</span>
          {!s.empty && <span className="fn-slot-name">{s.name ?? (s.rarity ? s.rarity : '?')}</span>}
          {!s.empty && s.count !== null && <span className="fn-slot-count">{s.mag !== null ? `${s.mag} | ${s.count}` : s.count}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * Where each slot sits in the shared hotbar picture (squad.ts readHotbar: 580x190, cut from 1080p x 1310, y 830):
 * slot n (1-5) is an 80 px square at x 15 + 95n, y 102; the held slot is raised 16 px.
 */
const PIC_W = 580;
const PIC_H = 190;
const picSlot = (n: number, held: boolean) => ({ x: 15 + 95 * n, y: held ? 86 : 102 });

interface StripTile {
  empty?: boolean;
  held?: boolean;
  rarity?: FnRarity | null;
  count?: number | null;
  name?: string | null;
}

/** One square: the item's picture cut from the hotbar picture, rarity border, count, held raised. */
function PicTile({ pic, n, tile, size }: { pic: string | null; n: number; tile: StripTile; size: number }) {
  const s = size / 80;
  const at = picSlot(n, !!tile.held);
  const style: React.CSSProperties = {
    width: size,
    height: size,
    ...(tile.rarity ? { ['--slot' as string]: RARITY_VAR[tile.rarity] } : {}),
    ...(pic && !tile.empty
      ? { backgroundImage: `url(${pic})`, backgroundSize: `${PIC_W * s}px ${PIC_H * s}px`, backgroundPosition: `${-at.x * s}px ${-at.y * s}px` }
      : {}),
  };
  return (
    <div
      className="fn-strip-tile"
      data-empty={tile.empty ? 'yes' : undefined}
      data-held={tile.held ? 'yes' : undefined}
      data-rarity={tile.rarity ? 'yes' : undefined}
      style={style}
      title={tile.empty ? `Slot ${n}: empty` : `Slot ${n}${tile.name ? `: ${tile.name}` : ''}${tile.rarity ? ` · ${tile.rarity}` : ''}`}
    >
      {/* No picture yet (hotbar not seen): show the read count instead; pictures already carry Fortnite's own. */}
      {!pic && !tile.empty && tile.count != null && <span className="fn-strip-count">{tile.count}</span>}
    </div>
  );
}

/**
 * The squad loadout strip (DESIGN.md S-E3e): one row per player, name on the left (cut short), five squares on
 * the right with each item's picture. Yours also uses the screen reading (empty, held, rarity, count);
 * friends' squares are cut from the hotbar picture their app sends.
 */
export function SquadStrip({ size = 34, title = true }: { size?: number; title?: boolean }) {
  const squad = useSquad();
  const inv = useInventory();
  const mineLive = !!inv && inv.at > 0 && inv.seen;
  const rows: { key: string; name: string; pic: string | null; tiles: StripTile[]; color?: string }[] = [];
  if (squad?.mine || mineLive)
    rows.push({ key: 'me', name: 'You', pic: squad?.mine ?? null, tiles: mineLive ? inv!.slots : Array.from({ length: 5 }, () => ({})) });
  for (const f of squad?.friends ?? []) rows.push({ key: f.id, name: f.name, pic: f.inventory, tiles: Array.from({ length: 5 }, () => (f.inventory ? {} : { empty: true })) });
  if (!rows.length) return null;
  return (
    <div className="fn-strip">
      {title && <div className="fn-strip-head">Loadouts</div>}
      {rows.map((r) => (
        <div key={r.key} className="fn-strip-row">
          <span className="fn-strip-name" title={r.name}>
            {r.name}
          </span>
          <div className="fn-strip-tiles">
            {r.tiles.map((t, i) => (
              <PicTile key={i} pic={r.pic} n={i + 1} tile={t} size={size} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Health and shield bars as read from the screen. */
export function HealthBars({ inv }: { inv: FnInventory }) {
  return (
    <div className="fn-hp">
      <div className="fn-hp-row" data-kind="shield">
        <span>Shield</span>
        <div className="fn-hp-bar">
          <i style={{ width: `${inv.shield ?? 0}%` }} />
        </div>
        <b>{inv.shield ?? '—'}</b>
      </div>
      <div className="fn-hp-row" data-kind="health">
        <span>Health</span>
        <div className="fn-hp-bar">
          <i style={{ width: `${inv.health ?? 0}%` }} />
        </div>
        <b>{inv.health ?? '—'}</b>
      </div>
    </div>
  );
}

/** Your inventory read live from the screen, and linked friends' hotbars as pictures from their screens. */
export function InventoryPanel() {
  const squad = useSquad();
  const inv = useInventory();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  const rows = [
    ...(squad?.friends ?? []).map((f) => ({ key: f.id, name: f.name, img: f.inventory, old: now - f.seenAt > 15_000, note: f.live ? ` · ${f.live.chests} chests · ${f.live.kills ?? 0} elims${f.live.reading ? '' : ' · not reading their screen'}` : ' · needs the latest ShotCaller' })),
  ];
  const mineLive = !!inv && inv.at > 0 && (inv.seen || inv.slots.some((s) => !s.empty));
  if (!mineLive) rows.push({ key: 'me', name: 'You', img: squad?.mine ?? null, old: false, note: '' });
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Inventory</div>
      {mineLive && inv && (
        <div style={{ marginBottom: 10, opacity: inv.seen ? 1 : 0.6 }}>
          <div className="fn-note" style={{ margin: '0 0 6px' }}>
            You{inv.heldName ? ` · holding ${inv.heldName}` : ''}
            {inv.seen ? '' : ' (hotbar hidden right now)'}
          </div>
          <SlotRow inv={inv} big />
          <HealthBars inv={inv} />
        </div>
      )}
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
