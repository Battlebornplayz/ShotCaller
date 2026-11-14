import { useEffect, useMemo, useState } from 'react';
import type { FnMapState, FnSavedRoute, FnStop, FnStopGoal } from '../../shared/fortnite';
import { RUN_MPS, STOP_GOALS, fmtMetres, fmtSecs, goalColor, legs, metres, stopLabel, totalMetres } from '../../shared/fortniteRoute';

/**
 * The route planner panel: your stops with a label, goal and note each, the distance of every leg and a rough
 * time, a suggested loot route from your own history, named routes you can save and load, and your squad's
 * routes to copy. Works with the map: click to add a stop, drag a stop to move it, right-click to take the last off.
 */

const setPlan = (stops: FnStop[]) => void window.shotcaller.setFortnitePlan(stops);

export function RoutePlanner({ map, planning, setPlanning }: { map: FnMapState | null; planning: boolean; setPlanning: (on: boolean) => void }) {
  const plan = useMemo(() => map?.plan ?? [], [map?.plan]);
  const step = map?.planStep ?? 0;
  const [saved, setSaved] = useState<FnSavedRoute[]>([]);
  const [saveName, setSaveName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void window.shotcaller.getFortniteSavedRoutes().then(setSaved);
  }, []);

  // Hotkeys while planning: Ctrl+Z takes the last stop off, Esc finishes. Not while typing in a box.
  useEffect(() => {
    if (!planning) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'Escape') setPlanning(false);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && plan.length) {
        e.preventDefault();
        setPlan(plan.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [planning, plan, setPlanning]);

  const edit = (i: number, patch: Partial<FnStop>) => setPlan(plan.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => setPlan(plan.filter((_, j) => j !== i));
  const suggest = async () => {
    setBusy(true);
    const r = await window.shotcaller.suggestFortniteRoute();
    setBusy(false);
    if (r.length) {
      setPlan(r);
      setMsg(`Suggested ${r.length} stops from your best drop and the chests you open most.`);
    } else setMsg('Play a few matches first: suggestions come from where you landed and opened chests.');
  };
  const save = async (name: string, stops: FnStop[]) => {
    if (!name.trim() || !stops.length) return;
    setSaved(await window.shotcaller.saveFortniteRoute(name, stops));
    setSaveName('');
    setMsg(`Saved “${name.trim()}”.`);
  };

  const legM = legs(plan);
  const total = totalMetres(plan);
  const dot = map?.dot ?? null;
  const next = step < plan.length ? plan[step] : null;
  const friends = (map?.squad ?? []).filter((f) => (f.marks?.plan.length ?? 0) > 0);
  const mapId = map?.map.id ?? null;

  return (
    <section className="fn-panel fn-planner">
      <div className="fn-panel-title">Route planner</div>
      <div className="fn-plan-bar">
        <button className={`btn ${planning ? 'primary' : ''}`} onClick={() => setPlanning(!planning)}>
          {planning ? 'Done planning' : 'Plan route'}
        </button>
        <button className="btn" disabled={busy} onClick={() => void suggest()} title="From your best drop through the chest spots you open most">
          {busy ? 'Thinking…' : 'Suggest loot route'}
        </button>
        {plan.length > 0 && (
          <button className="btn" onClick={() => setPlan([])}>
            Clear
          </button>
        )}
      </div>

      {plan.length > 0 && (
        <div className="fn-cells" style={{ marginTop: 8 }}>
          <Stat label="Stops" value={String(plan.length)} />
          <Stat label="Distance" value={fmtMetres(total)} />
          <Stat label="On foot" value={`~${fmtSecs(total / RUN_MPS)}`} />
          {next && dot && <Stat label={`To ${stopLabel(next, step)}`} value={fmtMetres(metres(dot, next))} />}
        </div>
      )}

      {plan.length === 0 ? (
        <div className="fn-note">{planning ? 'Click the map to add your first stop.' : 'No route yet. Plan one, suggest one, or load a saved one.'}</div>
      ) : (
        <ol className="fn-stops">
          {plan.map((s, i) => {
            const eta = legM.slice(0, i + 1).reduce((a, b) => a + b, 0) / RUN_MPS;
            return (
              <li key={i} className="fn-stop" data-done={i < step ? 'yes' : undefined} data-next={i === step ? 'yes' : undefined}>
                <span className="fn-stop-num" style={{ background: goalColor(s.goal) }}>
                  {i < step ? '✓' : i + 1}
                </span>
                <div className="fn-stop-body">
                  <div className="fn-stop-row">
                    <input
                      key={`n${i}-${s.name ?? ''}`}
                      className="fn-stop-name"
                      defaultValue={s.name ?? ''}
                      placeholder={`Stop ${i + 1}`}
                      maxLength={24}
                      onBlur={(e) => e.target.value.trim() !== (s.name ?? '') && edit(i, { name: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      aria-label={`Name of stop ${i + 1}`}
                    />
                    <span className="fn-stop-leg">{i === 0 ? 'start' : `+${fmtMetres(legM[i])} · ~${fmtSecs(eta)}`}</span>
                    <button className="fn-stop-x" aria-label={`Remove stop ${i + 1}`} onClick={() => remove(i)}>
                      ✕
                    </button>
                  </div>
                  <div className="fn-stop-row">
                    {STOP_GOALS.map((g) => (
                      <button
                        key={g.id}
                        className="fn-goal"
                        aria-pressed={s.goal === g.id}
                        style={s.goal === g.id ? { background: g.color, borderColor: g.color, color: '#0b0c1c' } : { borderColor: g.color }}
                        onClick={() => edit(i, { goal: s.goal === g.id ? undefined : (g.id as FnStopGoal) })}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <input
                    key={`t${i}-${s.note ?? ''}`}
                    className="fn-stop-note"
                    defaultValue={s.note ?? ''}
                    placeholder="Note (optional)"
                    maxLength={80}
                    onBlur={(e) => e.target.value.trim() !== (s.note ?? '') && edit(i, { note: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    aria-label={`Note for stop ${i + 1}`}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {plan.length > 0 && (
        <form
          className="fn-plan-bar"
          style={{ marginTop: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void save(saveName, plan);
          }}
        >
          <input className="fn-stop-name" style={{ flex: 1 }} value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this route" maxLength={40} />
          <button className="btn" type="submit" disabled={!saveName.trim()}>
            Save
          </button>
        </form>
      )}

      {msg && <div className="fn-note">{msg}</div>}

      {saved.length > 0 && (
        <>
          <div className="fn-panel-sub">Saved routes</div>
          <ul className="fn-saved">
            {saved.map((r) => (
              <li key={r.id}>
                <span className="fn-saved-name">
                  {r.name}
                  <span className="muted">
                    {' '}
                    · {r.stops.length} stops · {fmtMetres(totalMetres(r.stops))}
                    {r.mapId && mapId && r.mapId !== mapId ? ' · older map' : ''}
                  </span>
                </span>
                <button className="btn" onClick={() => setPlan(r.stops)}>
                  Load
                </button>
                <button className="fn-stop-x" aria-label={`Delete ${r.name}`} onClick={() => void window.shotcaller.deleteFortniteSavedRoute(r.id).then(setSaved)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {friends.length > 0 && (
        <>
          <div className="fn-panel-sub">Squad routes</div>
          <ul className="fn-saved">
            {friends.map((f) => (
              <li key={f.id}>
                <span className="fn-saved-name">
                  {f.name}
                  <span className="muted"> · {f.marks!.plan.length} stops</span>
                </span>
                <button className="btn" onClick={() => setPlan(f.marks!.plan)}>
                  Use
                </button>
                <button className="btn" onClick={() => void save(`${f.name}'s route`, f.marks!.plan)}>
                  Save
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="fn-note">
        {planning
          ? 'Click to add a stop, drag a stop to move it, right-click or Ctrl+Z to take the last one off, Esc when done. Gold rings are where you’ve opened chests before.'
          : 'Squad link shares your route with linked friends automatically. Times are rough, on foot.'}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="fn-cell">
      <div className="fn-cell-value">{value}</div>
      <div className="fn-cell-label">{label}</div>
    </div>
  );
}
