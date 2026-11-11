import { modeLabel } from '../../shared/fortniteLog';
import { useFortnite, useFortniteScreen, useSettings } from '../../src/hooks/useLive';
import { useFortniteMap } from '../../src/hooks/useLive';
import { gridCell } from './FnMap';
import { GoalBar, useSquad } from './FnPanels';
import type { FnShowOn } from '../../shared/fortnite';

/**
 * The Fortnite overlay card: chests this match, this session, today and all time, each part with its own
 * switch (Fortnite hub → Options). See-through by default (60%); size and opacity are set there too.
 */

const PHASE: Record<string, string> = { warmup: 'Warm-up', bus: 'Battle bus', zones: 'In the match', endgame: 'Match over' };

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="fn-row">
      <span className="fn-row-label">{label}</span>
      <span className={strong ? 'fn-row-value fn-chest' : 'fn-row-value'}>{value}</span>
    </div>
  );
}

export function FortniteCard() {
  const live = useFortnite();
  const screen = useFortniteScreen();
  const settings = useSettings();
  const parts = settings?.fortnite.card;
  if (!live || !parts) return <div className="muted">Loading…</div>;
  const m = live.match;
  const reading = screen?.mode === 'watching';
  return (
    <div className="fn-card">
      <div className="fn-card-head">
        <span className="fn-dot" data-on={reading ? 'yes' : 'no'} title={reading ? 'Reading the screen' : 'Not reading the screen right now'} />
        <span className="fn-card-mode">{m ? modeLabel(m.mode) : 'In the lobby'}</span>
        {m?.phase && <span className="muted">{PHASE[m.phase]}</span>}
      </div>
      {m && parts.match && (
        <div className="fn-row">
          <span className="fn-row-label">Eliminations</span>
          <span className="fn-row-value fn-elims">{m.eliminations ?? '—'}</span>
        </div>
      )}
      <div className="fn-section-label">Chests</div>
      {parts.match && <Row label="This match" value={live.chests.match} strong />}
      {parts.match && m && (
        <div className="fn-kinds">
          <span className="fn-kind fn-kind-rare">{m.chestKinds.rare} rare</span>
          {!!m.chestKinds.sprite && <span className="fn-kind fn-kind-sprite">{m.chestKinds.sprite} sprite</span>}
          {!!m.chestKinds.manual && <span className="fn-kind fn-kind-manual">+{m.chestKinds.manual} by key</span>}
        </div>
      )}
      {parts.session && <Row label="Session" value={live.chests.session} />}
      {parts.today && <Row label="Today" value={live.chests.today} />}
      {parts.allTime && <Row label="All time" value={live.chests.allTime} />}
      {!parts.match && !parts.session && !parts.today && !parts.allTime && <div className="muted">Every part is switched off.</div>}
      {settings.fortnite.chestGoal > 0 && <GoalBar done={live.chests.today} goal={settings.fortnite.chestGoal} />}
      <CardExtras />
      {settings.fortnite.display === 'ask' && <DisplayChoice />}
    </div>
  );
}

/** Session stats, last match, GPS next stop, linked friends and hotbars: each with its own switch. */
function CardExtras() {
  const live = useFortnite();
  const settings = useSettings();
  const map = useFortniteMap();
  const squad = useSquad();
  const parts = settings?.fortnite.card;
  if (!live || !parts) return null;
  const s = live.session;
  const last = live.lastMatch;
  const next = map && map.planStep < map.plan.length ? map.plan[map.planStep] : null;
  return (
    <>
      {parts.stats && (
        <>
          <div className="fn-section-label">Session</div>
          <div className="fn-row">
            <span className="fn-row-label">
              {s.matches} played · {s.wins} won
            </span>
            <span className="fn-row-value">{s.eliminations} elims</span>
          </div>
        </>
      )}
      {parts.recap && last && (
        <>
          <div className="fn-section-label">Last match</div>
          <div className="fn-row">
            <span className="fn-row-label">{last.placement ? `#${last.placement}` : 'Placed —'}</span>
            <span className="fn-row-value">
              {last.eliminations ?? 0} elims · {last.chests} chests
            </span>
          </div>
        </>
      )}
      {parts.gps && next && (
        <div className="fn-row">
          <span className="fn-row-label">Next stop {map!.planStep + 1}</span>
          <span className="fn-row-value">{gridCell(next)}</span>
        </div>
      )}
      {parts.squad && !!squad?.friends.length && (
        <>
          <div className="fn-section-label">Squad</div>
          {squad.friends.map((f) => (
            <div key={f.id} className="fn-row">
              <span className="fn-row-label">{f.name}</span>
              <span className="fn-row-value">
                {!f.live ? 'needs update' : f.live.reading ? `${f.live.chests} chests · ${f.live.kills ?? 0} elims` : `${f.live.chests} chests · not reading`}
              </span>
            </div>
          ))}
        </>
      )}
      {parts.hotbar && squad?.mine && <img src={squad.mine} alt="Your hotbar" style={{ width: '100%', borderRadius: 4, marginTop: 6 }} />}
      {parts.hotbar &&
        squad?.friends.map((f) => f.inventory && <img key={f.id} src={f.inventory} alt={`${f.name}'s hotbar`} title={f.name} style={{ width: '100%', borderRadius: 4, marginTop: 4 }} />)}
    </>
  );
}

/** First launch: where should the Fortnite info go? (Hold Alt to click the overlay.) */
export function DisplayChoice() {
  const pick = (display: FnShowOn) => void window.shotcaller.updateSettings({ fortnite: { display } });
  return (
    <div className="fn-display-choice">
      <div className="fn-section-label">Where should this show?</div>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => pick('overlay')}>
          Overlay
        </button>
        <button className="btn" onClick={() => pick('monitor')}>
          Second monitor
        </button>
        <button className="btn primary" onClick={() => pick('both')}>
          Both
        </button>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
        Hold Alt to click. Change it any time in Fortnite settings.
      </div>
    </div>
  );
}
