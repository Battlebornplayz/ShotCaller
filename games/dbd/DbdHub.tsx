import { useEffect, useMemo, useState } from 'react';
import type { DbdData, DbdSide, DbdState } from '../../shared/dbd';
import type { DisplayInfo } from '../../shared/types';
import { computeCatchup, tierText } from '../../shared/dbdCatchup';
import { useDetection } from '../../src/hooks/useLive';
import { AiChatPanel } from '../../src/components/AiChat';
import { BuildsTab } from './DbdBuilds';
import { CatchupTab, catchupFrom, usePatchNotes } from './DbdCatchup';
import {
  daysAgo,
  fmtDate,
  Icon,
  NewTag,
  RichText,
  Section,
  Switch,
  useDbdData,
  useDbdState,
  useNow,
} from './dbdShared';
import './dbd.css';

/**
 * Dead by Daylight section of the game page (Phase D1): Home, Builds, Catch-up, Killers, Maps, Stats, Options,
 * with a survivor/killer switch. Nothing here reads the game; screen reading comes in Phase D3.
 */

type Tab = 'home' | 'builds' | 'catchup' | 'killers' | 'maps' | 'stats' | 'ask' | 'options';

export function DbdHub() {
  const state = useDbdState();
  const data = useDbdData();
  const [tab, setTab] = useState<Tab>('home');
  if (!state)
    return (
      <div className="card muted" style={{ marginBottom: 14 }}>
        Loading…
      </div>
    );
  const side = state.settings.side;
  const setSide = (s: DbdSide) => void window.shotcaller.updateDbd({ side: s });
  const from = catchupFrom(state);
  const newSince = state.settings.newTags ? from : null;

  return (
    <div className="dbd" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="segmented">
          {(
            [
              ['home', 'Home'],
              ['builds', 'Builds'],
              ['catchup', 'Catch-up'],
              ['killers', 'Killers'],
              ['maps', 'Maps'],
              ['stats', 'Stats'],
              ['ask', 'Ask AI'],
              ['options', 'Options'],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" style={{ marginLeft: 'auto' }} title="Which side the hub shows">
          {(['survivor', 'killer'] as DbdSide[]).map((s) => (
            <button key={s} aria-pressed={side === s} onClick={() => setSide(s)}>
              {s === 'survivor' ? 'Survivor' : 'Killer'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'options' ? (
        <OptionsTab state={state} />
      ) : tab === 'ask' ? (
        <AiChatPanel page="Dead by Daylight" onOpenBuilds={() => setTab('builds')} />
      ) : !data ? (
        <DataMissing state={state} />
      ) : (
        <>
          {tab === 'home' && <HomeTab state={state} data={data} side={side} go={setTab} />}
          {/* A new key per side: switching side starts that side's builds fresh. */}
          {tab === 'builds' && (
            <BuildsTab key={side} state={state} data={data} side={side} newSince={newSince} />
          )}
          {tab === 'catchup' && <CatchupTab state={state} data={data} onBuilds={() => setTab('builds')} />}
          {tab === 'killers' && <KillersTab data={data} side={side} newSince={newSince} />}
          {tab === 'maps' && <MapsTab data={data} newSince={newSince} />}
          {tab === 'stats' && <StatsTab state={state} />}
        </>
      )}
    </div>
  );
}

function DataMissing({ state }: { state: DbdState }) {
  const d = state.data;
  return (
    <section className="card" style={{ display: 'grid', gap: 10 }}>
      {d.state === 'error' ? (
        <>
          <div style={{ fontWeight: 700 }}>Couldn’t get the DbD game data</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {d.error}
          </div>
          <div>
            <button className="btn" onClick={() => void window.shotcaller.refreshDbd()}>
              Try again
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="spinner" /> Getting the perks, killers and patches from the DbD wiki (about 15 s,
          once)…
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Home

function HomeTab({
  state,
  data,
  side,
  go,
}: {
  state: DbdState;
  data: DbdData;
  side: DbdSide;
  go: (t: Tab) => void;
}) {
  const detection = useDetection();
  const running = detection?.running.find((r) => r.moduleId === 'dbd');
  const now = useNow();
  const from = catchupFrom(state);
  const away = from ? Math.round((now - from) / 86_400_000) : null;
  const latest = data.patches.find((p) => p.version === data.latestPatch) ?? null;
  const upcoming = [...data.patches].reverse().find((p) => p.date > now) ?? null;
  const showCatchup = state.settings.catchupBanner && away !== null && away >= 14;
  const showPatch =
    state.settings.patchNotice && !!latest && state.settings.seenPatch !== latest.version && !showCatchup;
  const mine = state.builds.filter((b) => b.side === side).slice(0, 4);
  const perkIcon = (n: string) => data.perks.find((p) => p.name === n)?.icon ?? null;

  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      {!state.settings.setupDone && (
        <section className="card dbd-callout">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Quick DbD setup</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Check your screen, DbD’s menu and HUD scale, and a second monitor. Takes 30 seconds; the screen
              reading later uses it.
            </div>
          </div>
          <button className="btn primary" onClick={() => go('options')}>
            Set up
          </button>
        </section>
      )}

      {showCatchup && from && <CatchupBanner state={state} data={data} from={from} go={go} />}
      {showPatch && latest && <PatchCard data={data} version={latest.version} />}

      <div className="dbd-home-grid">
        <Section title="Session">
          {running ? (
            <div>
              <div style={{ fontWeight: 700 }}>Playing now</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Since{' '}
                {new Date(running.since).toLocaleTimeString(undefined, {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 700 }}>
                {state.steamLastPlayed
                  ? `Last played ${daysAgo(state.steamLastPlayed)}`
                  : 'Not played on this PC yet'}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {state.steamLastPlayed ? fmtDate(state.steamLastPlayed) : ''}
                {state.steamHours ? ` · ${state.steamHours.toLocaleString()} h on Steam` : ''}
              </div>
            </div>
          )}
          <div className="muted" style={{ fontSize: 12 }}>
            Match recaps arrive once ShotCaller reads DbD’s end screen (a later update).
          </div>
        </Section>

        <Section title="What’s new">
          <div style={{ fontWeight: 700 }}>Patch {data.latestPatch ?? '?'}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {latest ? `Out ${daysAgo(latest.date)}` : ''}
            {upcoming ? ` · ${upcoming.version} due ${fmtDate(upcoming.date)}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="pill" style={{ cursor: 'pointer' }} onClick={() => go('catchup')}>
              Catch-up
            </button>
            {state.settings.seenPatch === latest?.version && state.settings.patchNotice && (
              <button
                className="pill muted"
                style={{ cursor: 'pointer' }}
                onClick={() => void window.shotcaller.updateDbd({ seenPatch: null })}
              >
                Show this patch’s changes again
              </button>
            )}
          </div>
        </Section>
      </div>

      <Section
        title={`Your ${side} builds`}
        right={
          <button className="pill" style={{ cursor: 'pointer' }} onClick={() => go('builds')}>
            {mine.length ? 'All builds' : 'Make one'}
          </button>
        }
      >
        {mine.length === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            No {side} builds saved yet.
          </div>
        ) : (
          <div
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}
          >
            {mine.map((b) => (
              <div key={b.id} className="tile" style={{ padding: 10, display: 'grid', gap: 6 }}>
                <b style={{ fontSize: 13 }}>{b.name}</b>
                <div style={{ display: 'flex', gap: 4 }}>
                  {b.perks.map((n, i) => (
                    <Icon key={i} src={perkIcon(n)} size={40} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function CatchupBanner({
  state,
  data,
  from,
  go,
}: {
  state: DbdState;
  data: DbdData;
  from: number;
  go: (t: Tab) => void;
}) {
  const c = useMemo(() => computeCatchup(data, from), [data, from]);
  const parts = [
    c.killers.length &&
      `${c.killers.length} new killer${c.killers.length > 1 ? 's' : ''} (${c.killers.map((k) => k.name).join(', ')})`,
    c.survivors.length && `${c.survivors.length} new survivor${c.survivors.length > 1 ? 's' : ''}`,
    c.newPerks.length && `${c.newPerks.length} new perks`,
    c.changedPerks.length && `${c.changedPerks.length} perks changed`,
    c.patches.length && `${c.patches.length} patches`,
  ].filter(Boolean);
  return (
    <section className="card dbd-callout">
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>Welcome back: {c.days} days away</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {parts.length ? `${parts.join(' · ')}.` : 'Nothing big changed.'}{' '}
          {state.settings.catchupFrom ? '' : 'From the last time Steam saw you play.'}
        </div>
      </div>
      <button className="btn primary" onClick={() => go('catchup')}>
        Catch up
      </button>
    </section>
  );
}

/** "What changed this patch": once per new DbD patch, until dismissed. */
function PatchCard({ data, version }: { data: DbdData; version: string }) {
  const notes = usePatchNotes();
  const [open, setOpen] = useState(false);
  const idx = data.patches.findIndex((p) => p.version === version);
  const prev = data.patches[idx + 1];
  const c = useMemo(() => (prev ? computeCatchup(data, prev.date) : null), [data, prev]);
  const note = notes?.find((n) => !n.ptb && n.version === version.toLowerCase());
  const lines = [
    ...(c?.killers.map((k) => `New killer: The ${k.name}`) ?? []),
    ...(c?.survivors.map((s) => `New survivor: ${s.name}`) ?? []),
    ...(c?.changedPerks
      .slice(0, 6)
      .map(
        (ch) =>
          `${ch.perk.name}: ${ch.before && ch.before.join() !== ch.after.join() ? `${tierText(ch.before, ch.perk.unit)} → ${tierText(ch.after, ch.perk.unit)}` : 'changed'}`,
      ) ?? []),
    ...(c?.changedPowers.map((k) => `The ${k.name}: ${k.power} changed`) ?? []),
  ];
  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div>
          <div className="section-label">What changed this patch</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Patch {version}</div>
        </div>
        <button
          className="btn"
          style={{ marginLeft: 'auto' }}
          onClick={() => void window.shotcaller.updateDbd({ seenPatch: version })}
        >
          Got it
        </button>
      </div>
      {lines.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'grid', gap: 2 }}>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {(c?.changedPerks.length ?? 0) > 6 && (
            <li className="muted">…and {(c?.changedPerks.length ?? 0) - 6} more perks</li>
          )}
        </ul>
      ) : (
        <div className="muted" style={{ fontSize: 13 }}>
          No perk, killer or survivor changes in the game data: mostly fixes.
        </div>
      )}
      {note && (
        <div>
          <button className="pill muted" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
            {open ? 'Hide official notes' : 'Official notes'}
          </button>
          {open && (
            <RichText
              html={note.html}
              style={{ fontSize: 13, marginTop: 8, maxHeight: 380, overflow: 'auto' }}
            />
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Killers, maps, stats (fuller versions come in D4 and D5)

function KillersTab({ data, side, newSince }: { data: DbdData; side: DbdSide; newSince: number | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const list = [...data.killers]
    .filter(
      (k) =>
        !query ||
        k.name.toLowerCase().includes(query.toLowerCase()) ||
        (k.power ?? '').toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date - a.date);
  const opened = data.killers.find((k) => k.id === open);
  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <section className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className="muted" style={{ fontSize: 13 }}>
          {side === 'survivor' ? 'Every killer you can face, newest first.' : 'Every killer, newest first.'}{' '}
          Counter cards and your escape rates come in a later update.
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search killers or powers"
          style={{ marginLeft: 'auto', width: 220 }}
        />
      </section>
      {opened && (
        <section className="card" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <Icon src={opened.icon} size={84} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>The {opened.name}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                {[opened.realName, opened.chapter, fmtDate(opened.date)].filter(Boolean).join(' · ')}
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                {[
                  opened.speed,
                  opened.radius && `terror radius ${opened.radius}`,
                  opened.powerPatch && `power last changed ${opened.powerPatch}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
          {opened.powerText && (
            <RichText html={opened.powerText} style={{ fontSize: 13, maxHeight: 360, overflow: 'auto' }} />
          )}
          <KillerAddons data={data} killer={opened.name} />
        </section>
      )}
      <div className="dbd-killer-grid">
        {list.map((k) => (
          <button
            key={k.id}
            className={`tile dbd-killer${open === k.id ? ' active' : ''}`}
            onClick={() => setOpen(k.id)}
          >
            <Icon src={k.icon} size={64} />
            <div style={{ fontWeight: 700, fontSize: 13 }}>The {k.name}</div>
            <div className="muted" style={{ fontSize: 11 }}>
              {k.power}
            </div>
            {newSince !== null && k.date > newSince && <NewTag />}
          </button>
        ))}
      </div>
    </div>
  );
}

function KillerAddons({ data, killer }: { data: DbdData; killer: string }) {
  const addons = data.addons.filter((a) => a.group === killer);
  const order = ['Ultra Rare', 'Very Rare', 'Rare', 'Uncommon', 'Common'];
  addons.sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity) || a.name.localeCompare(b.name));
  if (!addons.length) return null;
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="section-label">Add-ons · {addons.length}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 6 }}>
        {addons.map((a) => (
          <div
            key={a.name}
            className="tile"
            style={{ display: 'flex', gap: 8, padding: 6, alignItems: 'center' }}
            title={a.summary}
          >
            <Icon src={a.icon} size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>
                {a.name}{' '}
                <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>
                  {a.rarity}
                </span>
              </div>
              <div
                className="muted"
                style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {a.summary}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MapsTab({ data, newSince }: { data: DbdData; newSince: number | null }) {
  const realms = useMemo(() => {
    const by = new Map<string, DbdData['maps']>();
    for (const m of data.maps) by.set(m.realm ?? 'Other', [...(by.get(m.realm ?? 'Other') ?? []), m]);
    return [...by];
  }, [data]);
  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <section className="card muted" style={{ fontSize: 13 }}>
        {data.maps.length} maps in {realms.length} realms. Map pictures with the main building and strong
        loops marked come in a later update.
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {realms.map(([realm, maps]) => (
          <section key={realm} className="card" style={{ display: 'grid', gap: 6, padding: 14 }}>
            <div className="section-label">{realm}</div>
            {maps.map((m) => (
              <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <span>{m.name}</span>
                {newSince !== null && m.date !== null && m.date > newSince && <NewTag />}
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 11 }}>
                  {m.version ?? ''}
                </span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function StatsTab({ state }: { state: DbdState }) {
  return (
    <section className="card enter" style={{ display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 700 }}>Stats</div>
      <div className="muted" style={{ fontSize: 13 }}>
        {state.steamHours ? `${state.steamHours.toLocaleString()} hours in DbD on Steam. ` : ''}Escape and
        kill rates, per-killer tables, how each build does and your official match history come in a later
        update.
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Options and setup

function OptionsTab({ state }: { state: DbdState }) {
  const s = state.settings;
  const g = state.game;
  const set = (patch: Parameters<typeof window.shotcaller.updateDbd>[0]) =>
    void window.shotcaller.updateDbd(patch);
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  useEffect(() => {
    void window.shotcaller.getDisplays().then(setDisplays);
  }, []);
  const screenW = Math.round(window.screen.width * window.devicePixelRatio);
  const screenH = Math.round(window.screen.height * window.devicePixelRatio);
  const menu = s.menuScale ?? g.menuScale;
  const hud = s.hudScale ?? g.hudScale;
  const sizeMismatch = g.width && g.height && (g.width !== screenW || g.height !== screenH);
  const d = state.data;

  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <Section title="DbD setup" right={s.setupDone ? <span className="pill green">Done</span> : null}>
        <div className="dbd-setup">
          <div className="tile" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Screen
            </div>
            <div style={{ fontWeight: 700 }}>
              {screenW} × {screenH}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              {g.width && g.height ? `DbD is set to ${g.width} × ${g.height}` : 'DbD’s screen size not found'}
            </div>
            {sizeMismatch && (
              <div style={{ fontSize: 12, color: 'var(--gold)' }}>
                DbD runs at a different size than this screen. Fine if DbD is on another monitor.
              </div>
            )}
          </div>
          <ScaleBox
            key={`m${menu}`}
            label="Menu scale"
            value={menu}
            fromFile={s.menuScale === null && g.menuScale !== null}
            onChange={(v) => set({ menuScale: v })}
          />
          <ScaleBox
            key={`h${hud}`}
            label="HUD scale"
            value={hud}
            fromFile={s.hudScale === null && g.hudScale !== null}
            onChange={(v) => set({ hudScale: v })}
          />
          <div className="tile" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Display mode
            </div>
            <div style={{ fontWeight: 700 }}>
              {g.windowMode === 1
                ? 'Windowed fullscreen'
                : g.windowMode === 0
                  ? 'Fullscreen'
                  : g.windowMode === 2
                    ? 'Windowed'
                    : 'Unknown'}
            </div>
            {g.windowMode === 0 && (
              <div style={{ fontSize: 12, color: 'var(--gold)' }}>
                ShotCaller’s overlay can’t show over true fullscreen: switch DbD to Windowed fullscreen (later
                updates need it).
              </div>
            )}
          </div>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          {g.found
            ? 'Read from DbD’s own settings file (only that file); it updates when you change them in the game. Type a number to override.'
            : 'DbD’s settings file wasn’t found: type your Menu and HUD scale from DbD’s Graphics settings.'}
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>Second monitor</span>
          <select
            value={s.monitorId ?? ''}
            onChange={(e) => set({ monitorId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">None</option>
            {displays.map((dsp) => (
              <option key={dsp.id} value={dsp.id}>
                {dsp.label}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>
            Maps, killer cards and stats go there in later updates.
          </span>
        </label>
        <div>
          <button className="btn primary" onClick={() => set({ setupDone: true })} disabled={s.setupDone}>
            {s.setupDone ? 'Setup done' : 'Looks right'}
          </button>
        </div>
      </Section>

      <Section title="Features">
        <Switch
          label="Welcome-back catch-up"
          help="On Home after a break of 2+ weeks: what changed since you last played."
          on={s.catchupBanner}
          onChange={(v) => set({ catchupBanner: v })}
        />
        <Switch
          label="What changed this patch"
          help="On Home once after each DbD update, until you press Got it."
          on={s.patchNotice}
          onChange={(v) => set({ patchNotice: v })}
        />
        <Switch
          label="“New” tags"
          help="Marks perks, killers and maps that came out since you last played."
          on={s.newTags}
          onChange={(v) => set({ newTags: v })}
        />
        <Switch
          label="Update the popular builds list online"
          help="Downloads ShotCaller’s list of popular builds from its GitHub page, so it stays current between updates."
          on={s.popularOnline}
          onChange={(v) => set({ popularOnline: v })}
        />
      </Section>

      <Section title="Game data">
        <div style={{ fontSize: 13 }}>
          {d.state === 'loading' ? (
            <span>
              <span className="spinner" /> Getting the latest data…
            </span>
          ) : d.fetchedAt ? (
            `Patch ${d.latestPatch ?? '?'} · updated ${daysAgo(d.fetchedAt)} · ${d.icons} icons saved on this PC`
          ) : (
            'Not downloaded yet.'
          )}
        </div>
        {d.error && <div style={{ fontSize: 13, color: 'var(--red)' }}>{d.error}</div>}
        <div className="muted" style={{ fontSize: 12 }}>
          Perks, killers, add-ons and icons from the DbD wiki (deadbydaylight.wiki.gg); patch notes from
          Steam. Checked again every few days and after DbD updates. ShotCaller never reads the game itself.
        </div>
        <div>
          <button
            className="btn"
            onClick={() => void window.shotcaller.refreshDbd()}
            disabled={d.state === 'loading'}
          >
            Refresh now
          </button>
        </div>
      </Section>
    </div>
  );
}

function ScaleBox({
  label,
  value,
  fromFile,
  onChange,
}: {
  label: string;
  value: number | null;
  fromFile: boolean;
  onChange: (v: number | null) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? '');
  return (
    <div className="tile" style={{ padding: 12 }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          value={text}
          inputMode="numeric"
          onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 3))}
          onBlur={() => {
            const n = Number(text);
            onChange(text && n >= 50 && n <= 150 ? n : null);
          }}
          style={{ width: 64, fontWeight: 700 }}
          placeholder="—"
        />
        <span className="muted">%</span>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        {fromFile ? 'From DbD’s settings' : value !== null ? 'Set by you (empty = from DbD)' : ''}
      </div>
    </div>
  );
}
