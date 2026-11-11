import { useEffect, useMemo, useState } from 'react';
import type { FnChestRead, FnMatchRecord } from '../../shared/fortnite';
import { modeLabel, type FnTeamSize } from '../../shared/fortniteLog';
import { useFortnite, useFortniteScreen, useSettings } from '../../src/hooks/useLive';
import { LobbyTab, MapOptions, ShopTab, StatsTab } from './FnHubTabs';

/**
 * Fortnite section of the game page: match history (trend on top, list below), Screen check and Options.
 * Matches reload whenever a new one is saved (pushed lastMatch changes).
 */

type Tab = 'lobby' | 'matches' | 'stats' | 'shop' | 'screen' | 'options';
type ModeFilter = 'all' | 'builds' | 'zero-build' | 'ranked' | 'reload';

function useMatches(): FnMatchRecord[] | null {
  const live = useFortnite();
  const [matches, setMatches] = useState<FnMatchRecord[] | null>(null);
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

export function FortniteHub() {
  const [tab, setTab] = useState<Tab>('lobby');
  const matches = useMatches();
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="segmented" style={{ marginBottom: 12 }}>
        {(
          [
            ['lobby', 'Lobby'],
            ['matches', `Matches${matches ? ` (${matches.length})` : ''}`],
            ['stats', 'Stats'],
            ['shop', 'Shop'],
            ['screen', 'Screen check'],
            ['options', 'Options'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'lobby' && <LobbyTab />}
      {tab === 'stats' && <StatsTab />}
      {tab === 'shop' && <ShopTab />}
      {tab === 'matches' && (matches ? <MatchHistory matches={matches} /> : <div className="card muted">Loading…</div>)}
      {tab === 'screen' && <ScreenCheck />}
      {tab === 'options' && <Options />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Match history

const MODE_FILTERS: [ModeFilter, string][] = [
  ['all', 'All modes'],
  ['builds', 'Builds'],
  ['zero-build', 'Zero Build'],
  ['ranked', 'Ranked'],
  ['reload', 'Reload'],
];
const SIZE_FILTERS: [FnTeamSize | 'all', string][] = [
  ['all', 'Any team'],
  ['solo', 'Solo'],
  ['duo', 'Duo'],
  ['trio', 'Trio'],
  ['squad', 'Squad'],
];

function matchesMode(m: FnMatchRecord, f: ModeFilter): boolean {
  if (f === 'all') return true;
  if (f === 'ranked') return m.kind === 'ranked';
  if (f === 'reload') return m.kind === 'reload';
  return m.kind === 'br' && m.zeroBuild === (f === 'zero-build');
}

const fmtTime = (ms: number | null) => {
  if (ms === null) return '—';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function MatchHistory({ matches }: { matches: FnMatchRecord[] }) {
  const [mode, setMode] = useState<ModeFilter>('all');
  const [size, setSize] = useState<FnTeamSize | 'all'>('all');
  const list = useMemo(
    () => matches.filter((m) => matchesMode(m, mode) && (size === 'all' || m.teamSize === size)).sort((a, b) => b.startedAt - a.startedAt),
    [matches, mode, size],
  );
  const chests = list.reduce((s, m) => s + m.chests, 0);
  const rare = list.reduce((s, m) => s + (m.chestKinds?.rare ?? 0), 0);
  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <div className="fn-filters">
        <div className="segmented">
          {MODE_FILTERS.map(([id, label]) => (
            <button key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="segmented">
          {SIZE_FILTERS.map(([id, label]) => (
            <button key={String(id)} aria-pressed={size === id} onClick={() => setSize(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {!list.length ? (
        <section className="card muted" style={{ fontSize: 13 }}>
          {matches.length
            ? 'No matches with these filters.'
            : 'No matches yet. Every match you play is saved by itself: the start, end and mode come from Fortnite’s log, the chests from the screen.'}
        </section>
      ) : (
        <>
          <section className="card">
            <div className="fn-stats">
              <Stat label="Matches" value={String(list.length)} rarity="uncommon" />
              <Stat label="Chests" value={String(chests)} rarity="legendary" />
              <Stat label="Rare chests" value={String(rare)} rarity="rare" />
              <Stat label="Chests per match" value={(chests / list.length).toFixed(1)} rarity="epic" />
              <Stat label="Avg time alive" value={fmtTime(list.reduce((s, m) => s + (m.timeAliveMs ?? 0), 0) / list.length)} rarity="common" />
            </div>
            <ChestTrend list={list} />
          </section>
          <section className="card" style={{ padding: 8 }}>
            {list.map((m) => (
              <MatchRow key={m.id} m={m} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}

type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** A stat as a slanted tile in a rarity colour, like an item card. */
function Stat({ label, value, rarity }: { label: string; value: string; rarity: Rarity }) {
  return (
    <div className="fn-tile" data-rarity={rarity}>
      <div className="fn-tile-value">{value}</div>
      <div className="fn-tile-label">{label}</div>
    </div>
  );
}

/** Chests in each of the last 30 matches, oldest on the left. One series: no legend. */
function ChestTrend({ list }: { list: FnMatchRecord[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = list.slice(0, 30).reverse();
  const max = Math.max(4, ...data.map((m) => m.chests));
  const W = 600;
  const H = 120;
  const slot = W / Math.max(data.length, 1);
  const bar = Math.min(18, slot * 0.6);
  const h = (v: number) => (v / max) * (H - 18);
  const shown = hover !== null ? data[hover] : null;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="section-label">Chests per match (last {data.length})</div>
      <div style={{ position: 'relative' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Chests per match" onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="fn-bar" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="var(--fn-epic)" />
              <stop offset="1" stopColor="var(--fn-legendary)" />
            </linearGradient>
          </defs>
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--border)" />
          <line x1={0} x2={W} y1={H - 18 - h(max) + 18} y2={H - 18 - h(max) + 18} stroke="var(--border)" strokeDasharray="2 4" />
          {data.map((m, i) => {
            const x = i * slot + (slot - bar) / 2;
            const bh = Math.max(m.chests ? 3 : 0, h(m.chests));
            return (
              <g key={m.id} onMouseEnter={() => setHover(i)}>
                <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
                <path
                  d={bh ? `M${x},${H} v${-(bh - 4)} q0,-4 4,-4 h${bar - 8} q4,0 4,4 v${bh - 4} z` : ''}
                  fill="url(#fn-bar)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              </g>
            );
          })}
        </svg>
        <div className="muted" style={{ position: 'absolute', top: 0, left: 4, fontSize: 11 }}>
          {max}
        </div>
        {shown && (
          <div className="fn-tip">
            <b>{shown.chests} chests</b> · {modeLabel(shown)} · {new Date(shown.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

function kindsTitle(m: FnMatchRecord): string {
  const k = m.chestKinds;
  if (!k) return 'Chests opened';
  return `Chests opened: ${k.chest} normal, ${k.rare} rare, ${k.sprite} sprite, ${k.manual} added with the +1 key`;
}

function MatchRow({ m }: { m: FnMatchRecord }) {
  const d = new Date(m.startedAt);
  return (
    <div className="fn-match">
      <div className="fn-match-place">{m.placement ? `#${m.placement}` : '—'}</div>
      <div style={{ width: 130 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
        <div className="muted" style={{ fontSize: 11 }}>
          {d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
      <div style={{ flex: 1, fontSize: 13 }}>{modeLabel(m)}</div>
      <div className="fn-match-num" title={kindsTitle(m)}>
        <span className="fn-chest">{m.chests}</span> chests
        {!!m.chestKinds?.rare && <div className="fn-rare-note">{m.chestKinds.rare} rare</div>}
      </div>
      <div className="fn-match-num" title="Eliminations, read from the number next to the skull">
        {m.eliminations ?? '—'} elims
      </div>
      <div className="fn-match-num" title="Time alive from the battle bus, not counting time spent down (read from the screen)">
        {fmtTime(m.timeAliveMs)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Screen check

const SCREEN_TEXT: Record<string, [string, string]> = {
  off: ['Screen reading is off', 'Switch it on in Options to count chests.'],
  'no-game': ['Fortnite isn’t running', 'It starts by itself when Fortnite opens.'],
  lobby: ['In the lobby', 'Chests are read once a match starts.'],
  'not-front': ['Fortnite isn’t the window in front', 'Click into the game. Use Windowed Fullscreen so the overlay shows too.'],
  'no-picture': ['Can’t copy the screen', 'Try Windowed Fullscreen instead of Fullscreen.'],
  watching: ['Watching for chests', 'Open a chest: the "+XP / CHEST" text should light up the box below.'],
};

const KIND_LABEL: Record<FnChestRead['kind'], string> = { chest: 'Chest', rare: 'Rare chest', sprite: 'Sprite chest', manual: '+1 key' };

function ScreenCheck() {
  const status = useFortniteScreen();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof window.shotcaller.getFortniteScreenPreview>>>(null);
  useEffect(() => {
    const t = setInterval(() => void window.shotcaller.getFortniteScreenPreview().then(setPreview), 500);
    return () => clearInterval(t);
  }, []);
  if (!status) return <div className="card muted">Loading…</div>;
  const [title, help] = SCREEN_TEXT[status.mode] ?? ['', ''];
  const hit = (preview?.score ?? 0) >= 0.68;
  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <section className="card">
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          {help}
        </div>
        {status.width > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Game picture {status.width}×{status.height}
            {status.height !== 1080 && ' (tuned for 1920×1080: other sizes aren’t checked)'}
          </div>
        )}
      </section>
      {preview && (
        <section className="card">
          <div className="section-label">What it looks at</div>
          <div style={{ position: 'relative', width: '100%', maxWidth: 520, aspectRatio: String(preview.aspect), marginTop: 6 }}>
            <img src={preview.image} alt="The area the chest reader looks at" style={{ width: '100%', height: '100%', borderRadius: 8, display: 'block' }} />
            {preview.match && (
              <div
                className="fn-box"
                data-hit={hit ? 'yes' : 'no'}
                style={{
                  left: `${preview.match.x * 100}%`,
                  top: `${preview.match.y * 100}%`,
                  width: `${preview.match.width * 100}%`,
                  height: `${preview.match.height * 100}%`,
                }}
              />
            )}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Best match {Math.round((preview.score ?? 0) * 100)}%. A chest counts at 80% or more (68% when RARE, SPRITE or X2 backs it up), seen twice in a row.
          </div>
        </section>
      )}
      <section className="card">
        <div className="section-label">Eliminations this match</div>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{status.eliminations ?? '—'}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          Read from the number next to the skull, top right. It pauses while you’re down or spectating (that row hides).
        </div>
      </section>
      <section className="card">
        <div className="section-label">Chests read this session ({status.chests.length})</div>
        {status.chests.length ? (
          <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
            {[...status.chests].reverse().slice(0, 20).map((c) => (
              <div key={c.at} style={{ fontSize: 13 }}>
                {new Date(c.at).toLocaleTimeString()} · <span className={`fn-kind fn-kind-${c.kind}`}>{KIND_LABEL[c.kind]}</span>
                {c.kind !== 'manual' && ` · match ${Math.round(c.score * 100)}%`}
              </div>
            ))}
          </div>
        ) : (
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            None yet.
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Options

function Switch({ label, help, on, onChange }: { label: string; help?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="fn-switch">
      <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {help && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{help}</span>}
      </span>
    </label>
  );
}

function Options() {
  const settings = useSettings();
  const live = useFortnite();
  const screen = useFortniteScreen();
  if (!settings) return <div className="card muted">Loading…</div>;
  const fn = settings.fortnite;
  const set = (patch: Parameters<typeof window.shotcaller.updateSettings>[0]['fortnite']) => void window.shotcaller.updateSettings({ fortnite: patch });
  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="section-label">Reading</div>
        <Switch label="Count chests from the screen" help="Copies a small area right of centre while a match is on. Offline; never touches the game." on={fn.screenReader} onChange={(v) => set({ screenReader: v })} />
        <Switch
          label="Save screenshots while I play"
          help={`For building new readers. One picture every 10 s during matches, kept on this PC only, up to ${screen?.recorder.cap ?? 600}. Saved so far: ${screen?.recorder.saved ?? 0}.`}
          on={fn.recorder}
          onChange={(v) => set({ recorder: v })}
        />
        <div className="muted" style={{ fontSize: 12 }}>
          Broke a chest open? Those show no XP popup, so press <b>{settings.hotkeys.fnChest || '(no key set)'}</b> to add +1. Change the key in Settings → Hotkeys.
        </div>
        <div>
          <button className="btn" onClick={() => void window.shotcaller.openFortniteShots()}>
            Open screenshots folder
          </button>
        </div>
        {live && !live.logFound && <div className="muted" style={{ fontSize: 12 }}>Fortnite’s log folder wasn’t found on this PC, so matches can’t be tracked yet.</div>}
      </section>
      <MapOptions />
      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="section-label">Overlay card</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600 }}>Show Fortnite info on</span>
          {(
            [
              ['overlay', 'Overlay'],
              ['monitor', 'Second monitor'],
              ['both', 'Both'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={`btn ${fn.display === v ? 'primary' : ''}`} onClick={() => set({ display: v })}>
              {label}
            </button>
          ))}
        </div>
        <Switch label="This match" on={fn.card.match} onChange={(v) => set({ card: { match: v } })} />
        <Switch label="This session" on={fn.card.session} onChange={(v) => set({ card: { session: v } })} />
        <Switch label="Today" on={fn.card.today} onChange={(v) => set({ card: { today: v } })} />
        <Switch label="All time" on={fn.card.allTime} onChange={(v) => set({ card: { allTime: v } })} />
        <Switch label="Session stats (played, won, elims)" on={fn.card.stats} onChange={(v) => set({ card: { stats: v } })} />
        <Switch label="Last match" on={fn.card.recap} onChange={(v) => set({ card: { recap: v } })} />
        <Switch label="Next stop on your planned route" on={fn.card.gps} onChange={(v) => set({ card: { gps: v } })} />
        <Switch label="Linked friends" on={fn.card.squad} onChange={(v) => set({ card: { squad: v } })} />
        <Switch label="Hotbar pictures" on={fn.card.hotbar} onChange={(v) => set({ card: { hotbar: v } })} />
        <label className="fn-slider">
          <span>See-through: {Math.round(fn.cardOpacity * 100)}%</span>
          <input type="range" min={30} max={100} step={5} value={Math.round(fn.cardOpacity * 100)} onChange={(e) => set({ cardOpacity: Number(e.target.value) / 100 })} />
        </label>
        <label className="fn-slider">
          <span>Size: {Math.round(fn.cardScale * 100)}%</span>
          <input type="range" min={80} max={150} step={5} value={Math.round(fn.cardScale * 100)} onChange={(e) => set({ cardScale: Number(e.target.value) / 100 })} />
        </label>
        <div className="muted" style={{ fontSize: 12 }}>
          Hold Alt over the card and drag its top bar to move it (the spot is saved). {settings.hotkeys.popup || 'The show/hide key'} hides and shows every overlay. The overlay needs Fortnite in Windowed Fullscreen.
        </div>
      </section>
    </div>
  );
}
