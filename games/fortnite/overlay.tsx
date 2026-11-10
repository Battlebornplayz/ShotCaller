import { modeLabel } from '../../shared/fortniteLog';
import { useFortnite, useFortniteScreen, useSettings } from '../../src/hooks/useLive';
import { GoalBar } from './FnPanels';

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
    </div>
  );
}
