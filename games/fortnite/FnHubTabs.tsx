import { useEffect, useState } from 'react';
import type { FnDisplay, FnDrop, FnShopItem, FnSquadState, FnStatBlock } from '../../shared/fortnite';
import { useFortnite, useFortniteMap, useFortniteShop, useFortniteStats, useSettings } from '../../src/hooks/useLive';
import { FnMap } from './FnMap';
import { ChestsPanel, InventoryPanel, RecapPanel, SessionPanel, useMatches } from './FnPanels';

type FnPatch = Parameters<typeof window.shotcaller.updateSettings>[0]['fortnite'];
const setFn = (patch: FnPatch) => void window.shotcaller.updateSettings({ fortnite: patch });

// ---------------------------------------------------------------------------------------------
// Lobby: last recap, session, goal, and the map with your drops

export function LobbyTab() {
  const live = useFortnite();
  const map = useFortniteMap();
  const settings = useSettings();
  const matches = useMatches(live);
  const [drops, setDrops] = useState<FnDrop[]>([]);
  const [planning, setPlanning] = useState(false);
  useEffect(() => {
    let active = true;
    void window.shotcaller.getFortniteDrops().then((d) => active && setDrops(d));
    return () => {
      active = false;
    };
  }, [live?.lastMatch?.id, map?.map.id]);
  if (!live || !settings) return <div className="card muted">Loading…</div>;
  const wins = drops.filter((d) => d.placement === 1).length;
  return (
    <div className="enter fn-lobby">
      <div className="fn-lobby-side">
        <SquadPanel />
        <InventoryPanel />
        <RecapPanel match={live.lastMatch} />
        <SessionPanel live={live} matches={matches} />
        <ChestsPanel live={live} goal={settings.fortnite.chestGoal} />
        <section className="fn-panel">
          <div className="fn-panel-title">Goal</div>
          <label className="fn-slider">
            <span>{settings.fortnite.chestGoal ? `${settings.fortnite.chestGoal} chests today` : 'No chest goal'}</span>
            <input type="range" min={0} max={150} step={5} value={settings.fortnite.chestGoal} onChange={(e) => setFn({ chestGoal: Number(e.target.value) })} />
          </label>
          <div className="fn-note">It shows on the overlay card and the map window too.</div>
        </section>
      </div>
      <section className="fn-panel fn-lobby-map">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div className="fn-panel-title" style={{ margin: 0, flex: 1 }}>
            Your drops this season ({drops.length}
            {wins ? `, ${wins} won` : ''})
          </div>
          <PlanButtons planning={planning} setPlanning={setPlanning} stops={map?.plan.length ?? 0} />
          <button className="btn" onClick={() => void window.shotcaller.showFortniteMonitor()}>
            Open map window
          </button>
        </div>
        <div className="fn-lobby-mapbox">
          <FnMap live={map} route={[]} chests={[]} landing={null} death={null} drops={drops} planning={planning} />
        </div>
        <div className="fn-note">
          {planning
            ? 'Click the map to add stops in order. Right-click takes the last stop off. Scroll to zoom, hold right-click and drag to move, double-click to reset. In a match, a green GPS line points from you to the next stop.'
            : 'Parachute: where you landed (gold = won). Red X: where you went down. Plan route: set your own stops with a GPS line between them.'}
        </div>
      </section>
    </div>
  );
}

/** How you show on the map: dot, arrow (turns the way you're moving) or your own picture. */
function MarkerPicker({ marker, image }: { marker: 'dot' | 'arrow' | 'image'; image: string | null }) {
  const pick = (file: File | undefined) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Shrunk to a 96 px square so it's small enough to keep in settings.
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const side = Math.min(img.width, img.height);
      c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 96, 96);
      URL.revokeObjectURL(url);
      setFn({ marker: 'image', markerImage: c.toDataURL('image/png') });
    };
    img.src = url;
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600 }}>You show as</span>
      {(['dot', 'arrow'] as const).map((m) => (
        <button key={m} className={`btn ${marker === m ? 'primary' : ''}`} onClick={() => setFn({ marker: m })}>
          {m === 'dot' ? 'Dot' : 'Arrow'}
        </button>
      ))}
      <label className={`btn ${marker === 'image' ? 'primary' : ''}`} style={{ cursor: 'pointer' }}>
        {image ? 'Custom picture' : 'Custom picture…'}
        <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      {image && (
        <>
          <img src={image} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} onClick={() => setFn({ marker: 'image' })} />
          {marker !== 'image' && (
            <button className="btn" onClick={() => setFn({ marker: 'image' })}>
              Use picture
            </button>
          )}
        </>
      )}
      <span className="muted" style={{ fontSize: 12, flexBasis: '100%' }}>
        The arrow turns the way you're moving. Linked friends see your choice too (pictures get a ring in your colour).
      </span>
    </div>
  );
}

/** "Plan route" on/off and "Clear route", shared by the lobby map and the map window. */
export function PlanButtons({ planning, setPlanning, stops }: { planning: boolean; setPlanning: (on: boolean) => void; stops: number }) {
  return (
    <span className="fn-plan-bar">
      <button className={`btn ${planning ? 'primary' : ''}`} onClick={() => setPlanning(!planning)}>
        {planning ? 'Done planning' : 'Plan route'}
      </button>
      {stops > 0 && (
        <button className="btn" onClick={() => void window.shotcaller.setFortnitePlan([])}>
          Clear route ({stops})
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Squad link: share map dots with a friend by join code

function SquadPanel() {
  const [squad, setSquad] = useState<FnSquadState | null>(null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    void window.shotcaller.getFortniteSquad().then((s) => active && setSquad(s));
    const off = window.shotcaller.onFortniteSquad(setSquad);
    return () => {
      active = false;
      off();
    };
  }, []);
  if (!squad) return null;
  const linked = squad.status !== 'off';
  const copy = () => {
    if (!squad.code) return;
    void navigator.clipboard.writeText(squad.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <section className="fn-panel">
      <div className="fn-panel-title">Squad link</div>
      {!linked ? (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => void window.shotcaller.startFortniteSquad().then(setSquad)}>
              Start squad
            </button>
            <input className="input" style={{ width: 110, textTransform: 'uppercase' }} placeholder="K7F-2QX" value={code} maxLength={8} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void window.shotcaller.joinFortniteSquad(code).then(setSquad)} />
            <button className="btn" disabled={!code.trim()} onClick={() => void window.shotcaller.joinFortniteSquad(code).then(setSquad)}>
              Join
            </button>
          </div>
          {squad.error && <div className="fn-note" style={{ color: '#ff8a8a' }}>{squad.error}</div>}
          <div className="fn-note">Start one and send the code to your friend, or type theirs. You'll see each other's map dot and path.</div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" onClick={copy} title="Copy the code">
              <b style={{ letterSpacing: 2 }}>{squad.code}</b> {copied ? 'Copied' : 'Copy'}
            </button>
            <span className="fn-note" style={{ margin: 0 }}>
              {squad.status === 'on' ? 'Linked' : squad.status === 'connecting' ? 'Connecting…' : 'Problem'}
            </span>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => void window.shotcaller.leaveFortniteSquad().then(setSquad)}>
              Leave
            </button>
          </div>
          {squad.error && <div className="fn-note" style={{ color: '#ff8a8a' }}>{squad.error}</div>}
          <div className="fn-note">
            {squad.friends.length
              ? `With you: ${squad.friends.map((f) => f.name).join(', ')}`
              : 'Waiting for your friend to type the code…'}
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Online stats

const MODES: [string, string][] = [
  ['overall', 'All modes'],
  ['solo', 'Solo'],
  ['duo', 'Duo'],
  ['trio', 'Trio'],
  ['squad', 'Squad'],
];

export function StatsTab() {
  const stats = useFortniteStats();
  const settings = useSettings();
  const [draft, setName] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [window_, setWindow] = useState<'season' | 'lifetime'>('season');
  if (!stats || !settings) return <div className="card muted">Loading…</div>;
  const name = draft ?? settings.fortnite.epicName;

  const saveKey = async () => {
    const r = await window.shotcaller.setFortniteApiKey(key);
    setKeyError(r.ok ? null : r.error);
    if (r.ok) setKey('');
  };
  const saveName = () => {
    setFn({ epicName: name.trim() });
    setName(null);
    setTimeout(() => void window.shotcaller.refreshFortniteStats(true), 50);
  };
  const s = stats.stats;
  const blocks = s ? (window_ === 'season' ? s.season : s.lifetime) : null;

  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="section-label">Your account</div>
        <form
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
          onSubmit={(e) => {
            e.preventDefault();
            saveName();
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Epic name" maxLength={40} style={{ width: 240 }} />
          <button className="btn primary" type="submit" disabled={!name.trim() || name.trim() === settings.fortnite.epicName}>
            Save name
          </button>
        </form>
        {!stats.hasKey ? (
          <>
            <div className="muted" style={{ fontSize: 13 }}>
              Stats come from fortnite-api.com with your own free key. Paste it here: it stays on this PC only (encrypted), never in the app’s files online.
            </div>
            <form
              style={{ display: 'flex', gap: 8 }}
              onSubmit={(e) => {
                e.preventDefault();
                void saveKey();
              }}
            >
              <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="fortnite-api.com key" style={{ width: 320 }} autoComplete="off" />
              <button className="btn primary" type="submit" disabled={!key.trim()}>
                Save key
              </button>
            </form>
          </>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <span className="pill green">Key saved</span>
            <button className="btn" onClick={() => void window.shotcaller.setFortniteApiKey('')}>
              Remove key
            </button>
            <button className="btn" onClick={() => void window.shotcaller.refreshFortniteStats(true)} disabled={stats.status === 'loading'}>
              {stats.status === 'loading' ? <span className="spinner" /> : null} Refresh
            </button>
          </div>
        )}
        {keyError && <div style={{ color: 'var(--red)', fontSize: 13 }}>{keyError}</div>}
        {stats.error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{stats.error}</div>}
      </section>

      {s && blocks && (
        <section className="card" style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="segmented">
              {(['season', 'lifetime'] as const).map((w) => (
                <button key={w} aria-pressed={window_ === w} onClick={() => setWindow(w)}>
                  {w === 'season' ? 'This season' : 'Lifetime'}
                </button>
              ))}
            </div>
            {s.battlePass && (
              <div className="fn-tile" data-rarity="epic" style={{ padding: '6px 14px' }}>
                <div className="fn-tile-value" style={{ fontSize: 22 }}>
                  Level {s.battlePass.level}
                </div>
                <div className="fn-tile-label">Battle pass · {s.battlePass.progress}% to next</div>
              </div>
            )}
            <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
              {s.name} · updated {new Date(s.fetchedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
          <div className="fn-stat-table">
            <div className="fn-stat-row fn-stat-head">
              <span>Mode</span>
              <span>Matches</span>
              <span>Wins</span>
              <span>Win rate</span>
              <span>Kills</span>
              <span>K/D</span>
            </div>
            {MODES.filter(([id]) => blocks[id]).map(([id, label]) => (
              <StatRow key={id} label={label} b={blocks[id]} strong={id === 'overall'} />
            ))}
          </div>
          <div className="fn-note">All inputs together. Fortnite’s stats service doesn’t split Builds from Zero Build.</div>
        </section>
      )}
    </div>
  );
}

function StatRow({ label, b, strong }: { label: string; b: FnStatBlock; strong?: boolean }) {
  return (
    <div className="fn-stat-row" data-strong={strong ? 'yes' : 'no'}>
      <span>{label}</span>
      <span>{b.matches.toLocaleString()}</span>
      <span className="fn-chest">{b.wins.toLocaleString()}</span>
      <span>{b.winRate.toFixed(1)}%</span>
      <span>{b.kills.toLocaleString()}</span>
      <span className="fn-elims">{b.kd.toFixed(2)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Item shop + wishlist

const RARITY: Record<string, string> = { legendary: 'legendary', epic: 'epic', rare: 'rare', uncommon: 'uncommon' };

export function ShopTab() {
  const shop = useFortniteShop();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<FnShopItem[] | null>(null);
  const [filter, setFilter] = useState('');
  if (!shop || !settings) return <div className="card muted">Loading…</div>;
  const wish = settings.fortnite.wishlist;
  const wished = new Set(wish.map((w) => w.id));
  const toggle = (item: { id: string; name: string }) =>
    setFn({ wishlist: wished.has(item.id) ? wish.filter((w) => w.id !== item.id) : [...wish, { id: item.id, name: item.name }] });
  const search = async () => setFound(await window.shotcaller.searchFortniteCosmetics(q));
  const items = shop.items.filter((i) => !filter || i.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="section-label">Wishlist ({wish.length})</div>
        <div className="muted" style={{ fontSize: 13 }}>
          When something on your wishlist is in the shop, ShotCaller tells you once that day.
        </div>
        {shop.wished.length > 0 && (
          <div className="fn-wished">
            In the shop now: {shop.wished.map((w) => `${w.name} (${w.price})`).join(', ')}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {wish.map((w) => (
            <button key={w.id} className="pill" onClick={() => toggle(w)} title="Remove from wishlist">
              {w.name} ✕
            </button>
          ))}
        </div>
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void search();
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find any skin, emote, pickaxe…" style={{ width: 320 }} />
          <button className="btn primary" type="submit" disabled={q.trim().length < 2}>
            Search
          </button>
        </form>
        {found && (found.length ? <ItemGrid items={found} wished={wished} onToggle={toggle} /> : <div className="muted">Nothing found.</div>)}
      </section>

      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="section-label" style={{ flex: 1 }}>
            Item shop today ({shop.items.length})
          </div>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" style={{ width: 200 }} />
        </div>
        {shop.status === 'error' && <div style={{ color: 'var(--red)', fontSize: 13 }}>{shop.error}</div>}
        {shop.status === 'loading' && <div className="muted"><span className="spinner" /> Loading the shop…</div>}
        <ItemGrid items={items} wished={wished} onToggle={toggle} />
      </section>
    </div>
  );
}

function ItemGrid({ items, wished, onToggle }: { items: FnShopItem[]; wished: Set<string>; onToggle: (i: FnShopItem) => void }) {
  return (
    <div className="fn-items">
      {items.map((i) => (
        <button key={i.id} className="fn-item" data-rarity={RARITY[i.rarity] ?? 'common'} data-wished={wished.has(i.id) ? 'yes' : 'no'} onClick={() => onToggle(i)} title={wished.has(i.id) ? 'On your wishlist (click to remove)' : 'Add to wishlist'}>
          {i.image ? <img src={i.image} alt="" loading="lazy" /> : <div className="fn-item-blank" />}
          <div className="fn-item-name">{i.name}</div>
          <div className="fn-item-meta">
            {i.type}
            {i.price ? ` · ${i.price}` : ''}
          </div>
          {wished.has(i.id) && <span className="fn-item-star">★</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Map options

export function MapOptions() {
  const settings = useSettings();
  const [displays, setDisplays] = useState<FnDisplay[]>([]);
  useEffect(() => {
    void window.shotcaller.getFortniteDisplays().then(setDisplays);
  }, []);
  if (!settings) return null;
  const fn = settings.fortnite;
  const auto = displays.find((d) => !d.primary);
  return (
    <section className="card" style={{ display: 'grid', gap: 10 }}>
      <div className="section-label">Live map</div>
      <label className="fn-switch">
        <input type="checkbox" checked={fn.liveMap} onChange={(e) => setFn({ liveMap: e.target.checked })} />
        <span>
          <span style={{ fontWeight: 600 }}>Find me on the map</span>
          <span className="muted" style={{ display: 'block', fontSize: 12 }}>
            Matches your minimap against the season map about once a second. Also pins your chests and draws your route.
          </span>
        </span>
      </label>
      <MarkerPicker marker={fn.marker} image={fn.markerImage} />
      <label className="fn-switch">
        <input type="checkbox" checked={fn.monitor.on} onChange={(e) => setFn({ monitor: { on: e.target.checked } })} />
        <span>
          <span style={{ fontWeight: 600 }}>Map window on my second screen</span>
          <span className="muted" style={{ display: 'block', fontSize: 12 }}>
            Opens with Fortnite and closes with it. With only one screen it stays closed.
          </span>
        </span>
      </label>
      {fn.monitor.on && displays.length > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
          <span>Screen:</span>
          <div className="segmented">
            {displays.map((d, i) => (
              <button
                key={d.id}
                aria-pressed={fn.monitor.displayId === d.id || (fn.monitor.displayId === null && d.id === auto?.id)}
                onClick={() => setFn({ monitor: { displayId: d.id } })}
                title={`${d.width}×${d.height}${d.primary ? ' (main screen)' : ''}`}
              >
                {i + 1}. {d.label}
                {d.primary ? ' (main)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <button className="btn" onClick={() => void window.shotcaller.showFortniteMonitor()}>
          Open map window now
        </button>
      </div>
    </section>
  );
}
