import { useEffect, useState } from 'react';
import type { FnDrop, FnRoute } from '../../shared/fortnite';
import { FnMap, gridCell } from '../../games/fortnite/FnMap';
import { PlanButtons } from '../../games/fortnite/FnHubTabs';
import { ChestsPanel, InventoryPanel, RecapPanel, SessionPanel, useMatches } from '../../games/fortnite/FnPanels';
import { useFortnite, useFortniteMap, useSettings } from '../hooks/useLive';

/**
 * The Fortnite second-monitor window: the map on the left, panels stacked on the right. During a match the map
 * follows your dot; in the lobby it shows the last match's route and your landing spots on this season's map.
 */
export function FnMonitorApp() {
  const live = useFortnite();
  const map = useFortniteMap();
  const settings = useSettings();
  const matches = useMatches(live);
  const [follow, setFollow] = useState(true);
  const [planning, setPlanning] = useState(false);
  const [route, setRoute] = useState<FnRoute | null>(null);
  const [drops, setDrops] = useState<FnDrop[]>([]);
  const inMatch = !!live?.match;
  const last = live?.lastMatch ?? null;
  const lastId = last?.id ?? null;

  // Lobby: the last match's route (its recap) and drop pins.
  useEffect(() => {
    if (inMatch || !lastId) return;
    let active = true;
    void window.shotcaller.getFortniteRoute(lastId).then((r) => active && setRoute(r));
    void window.shotcaller.getFortniteDrops().then((d) => active && setDrops(d));
    return () => {
      active = false;
    };
  }, [inMatch, lastId, map?.map.id]);

  if (!live || !settings) return <div className="fnm-root" />;
  const dot = map?.dot ?? null;
  return (
    <div className="fnm-root fn-theme">
      <header className="fnm-bar">
        <span className="fnm-title">{inMatch ? 'Live map' : 'Lobby'}</span>
        {inMatch && dot && (
          <span className="fnm-where" data-state={dot.state}>
            {gridCell(dot)} {dot.state === 'unsure' ? '· not sure' : ''}
          </span>
        )}
        {inMatch && dot && map && map.planStep < map.plan.length && (
          <span className="fnm-where">
            Next stop {map.planStep + 1} · {gridCell(map.plan[map.planStep])}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <PlanButtons planning={planning} setPlanning={setPlanning} stops={map?.plan.length ?? 0} />
        {inMatch && (
          <button className="btn" onClick={() => setFollow((f) => !f)}>
            {follow ? 'Whole map' : 'Follow me'}
          </button>
        )}
        <button className="fnm-x" aria-label="Close the map window" onClick={() => window.close()}>
          ✕
        </button>
      </header>
      <div className="fnm-body">
        <div className="fnm-map">
          {inMatch ? (
            <FnMap live={map} follow={follow && !planning} planning={planning} />
          ) : (
            <FnMap live={map} route={route?.points.map(([x, y]) => [x, y] as [number, number]) ?? []} chests={route?.chests ?? []} landing={route?.landing ?? null} death={route?.death ?? null} kills={route?.kills ?? []} drops={drops} planning={planning} />
          )}
          {!inMatch && (
            <div className="fnm-legend">
              <span>🪂 Where you landed (gold = won)</span>
              <span>📦 Chest looted</span>
              <span>💀 Got a kill</span>
              <span>❌ Where you went down</span>
              <span><i className="fn-key fn-key-route" /> Last match's route</span>
            </div>
          )}
        </div>
        <aside className="fnm-side">
          {!inMatch && <RecapPanel match={last} />}
          <SessionPanel live={live} matches={matches} />
          <ChestsPanel live={live} goal={settings.fortnite.chestGoal} />
          <InventoryPanel />
        </aside>
      </div>
    </div>
  );
}
