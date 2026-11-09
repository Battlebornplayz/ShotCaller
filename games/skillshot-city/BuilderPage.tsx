import { useMemo, useState } from 'react';
import type { MatchRecord, SkillshotData, SkillshotLiveState } from '../../shared/skillshot';
import { BUILD_SIZE, planBuilds, type BuildPlan, type Playstyle, type Sliders } from '../../shared/skillshotBuilder';
import type { SkillCollection } from '../../shared/skillshotCollection';
import { computeStats } from '../../shared/skillshotStats';
import styleFile from './playstyles.json';
import { SkillIcon, skillById, TierBadge } from './ui';

/**
 * Build planner: pick a playstyle, fine-tune it, get the top 3 builds from the skills you own. The
 * chosen build becomes the goal the live advisor follows.
 */

const STYLES = styleFile.styles as Playstyle[];
const BALANCED: Sliders = { aggression: 50, range: 50, survival: 60, spice: 15 };

const SLIDERS: { key: keyof Sliders; label: string; low: string; high: string }[] = [
  { key: 'aggression', label: 'Aggression', low: 'Hang back', high: 'Pick fights' },
  { key: 'range', label: 'Range', low: 'Up close', high: 'From afar' },
  { key: 'survival', label: 'Survival', low: 'Glass cannon', high: 'Hard to kill' },
  { key: 'spice', label: 'Spice', low: 'Proven', high: 'Wild' },
];

function SkillRow({ data, id, owned }: { data: SkillshotData; id: string; owned: Map<string, number | null> }) {
  const s = skillById(data, id);
  return (
    <span className="ss-chip" title={s?.how}>
      <SkillIcon skill={s} size={18} rarity={owned.get(id) ?? undefined} />
      {s?.name ?? id}
    </span>
  );
}

export function BuilderPage({
  data,
  matches,
  collection,
  live,
}: {
  data: SkillshotData;
  matches: MatchRecord[];
  collection: SkillCollection | null;
  live: SkillshotLiveState | null;
}) {
  const [styleId, setStyleId] = useState<string | null>(null);
  const [sliders, setSliders] = useState<Sliders>(BALANCED);
  const [simple, setSimple] = useState(true);
  const [seed, setSeed] = useState(0);
  const [classChoice, setClassChoice] = useState<string | null>(null);
  const classId = classChoice ?? live?.classId ?? collection?.detectedClass ?? null;

  const owned = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const o of collection?.owned ?? []) if (o.skillId) out.set(o.skillId, o.rarities.length ? o.rarity : null);
    return out;
  }, [collection]);
  const stats = useMemo(() => (matches.length ? computeStats(data, matches) : null), [data, matches]);
  const style = STYLES.find((x) => x.id === styleId) ?? null;
  const plans = useMemo(
    () => planBuilds({ data, sliders, style, classId, owned, simple, stats, seed }),
    [data, sliders, style, classId, owned, simple, stats, seed],
  );

  const chooseStyle = (s: Playstyle) => {
    setStyleId(s.id);
    setSliders(s.sliders);
    setSeed(0);
  };
  const surprise = () => {
    const s = STYLES[Math.floor(Math.random() * STYLES.length)];
    setStyleId(s.id);
    setSliders({ ...s.sliders, spice: Math.max(s.sliders.spice, 50) });
    setSeed(Math.floor(Math.random() * 1e9) + 1);
  };

  const missing = collection?.ownedCount !== null && collection?.ownedCount !== undefined ? collection.ownedCount - owned.size : 0;
  const goalKey = live?.goal.locked ? [...live.goal.ids].sort().join('+') : null;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card enter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, flex: 1 }}>Pick a playstyle</h2>
          <button className="btn" onClick={surprise}>
            🎲 Surprise me
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginTop: 12 }}>
          {STYLES.map((s) => (
            <button
              key={s.id}
              aria-pressed={styleId === s.id}
              onClick={() => chooseStyle(s)}
              style={{
                textAlign: 'left',
                padding: '9px 11px',
                borderRadius: 10,
                background: styleId === s.id ? 'rgba(79,140,255,0.18)' : 'rgba(255,255,255,0.04)',
                boxShadow: styleId === s.id ? 'inset 0 0 0 1px var(--accent)' : undefined,
              }}
            >
              <b style={{ display: 'block', fontSize: 13 }}>{s.name}</b>
              <span className="muted" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.3, marginTop: 2 }}>
                {s.pitch}
              </span>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px 22px', marginTop: 16 }}>
          {SLIDERS.map((sl) => (
            <label key={sl.key} style={{ display: 'block', fontSize: 12.5 }}>
              <b>{sl.label}</b>
              <input
                type="range"
                min={0}
                max={100}
                value={sliders[sl.key]}
                onChange={(e) => {
                  setSliders({ ...sliders, [sl.key]: Number(e.target.value) });
                  setSeed(0);
                }}
                style={{ display: 'block', width: '100%', margin: '4px 0 1px' }}
              />
              <span className="muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span>{sl.low}</span>
                <span>{sl.high}</span>
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', marginTop: 14, fontSize: 12.5 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            Class
            <select value={classId ?? ''} onChange={(e) => setClassChoice(e.target.value || null)} style={{ fontSize: 12.5, padding: '4px 8px', borderRadius: 7 }}>
              <option value="">Any class</option>
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <input type="checkbox" checked={simple} onChange={(e) => setSimple(e.target.checked)} />
            Keep it simple (mostly automatic skills)
          </label>
          {style && (
            <span className="muted">
              Suits: {style.classes.map((id) => data.classes.find((c) => c.id === id)?.name ?? id).join(', ')}
            </span>
          )}
        </div>
      </section>

      <section className="card enter" style={{ padding: '10px 14px', background: 'rgba(245,196,81,0.07)', fontSize: 12.5, lineHeight: 1.45 }}>
        <b>Treat a plan as a preference.</b> <span className="muted">You get {BUILD_SIZE} skills per match, and most offers are random from everything you’ve unlocked, so you’ll rarely get all of these. If 3 of them show up, the build works. When one doesn’t, take a backup.</span>
        {missing > 0 && <span className="muted"> ShotCaller knows {owned.size} of your {collection?.ownedCount} unlocked skills so far, and fills in the rest as you’re offered them.</span>}
      </section>

      {plans.length === 0 ? (
        <section className="card enter muted" style={{ fontSize: 13 }}>
          No skills detected yet. Play one match and your unlocked skills are read automatically.
        </section>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14, alignItems: 'start' }}>
          {plans.map((p, i) => (
            <PlanCard key={p.skills.join('+')} plan={p} rank={i} data={data} owned={owned} chosen={goalKey === [...p.skills].sort().join('+')} />
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.45 }}>
        Built from official synergies, community ranked stats (skillshotcity.gg), your rarities and your own results. Damage and cooldown numbers aren’t included: no readable game file has them.
      </p>
    </div>
  );
}

function PlanCard({ plan, rank, data, owned, chosen }: { plan: BuildPlan; rank: number; data: SkillshotData; owned: Map<string, number | null>; chosen: boolean }) {
  return (
    <section className="card enter" style={{ display: 'grid', gap: 12, boxShadow: chosen ? 'inset 0 0 0 1.5px var(--green)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontSize: 15, flex: 1 }}>{rank === 0 ? 'Best fit' : `Option ${rank + 1}`}</b>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {plan.fit}% match
        </span>
      </div>

      <div style={{ display: 'grid', gap: 5 }}>
        {plan.skills.map((id) => {
          const s = skillById(data, id);
          return (
            <div key={id} title={s?.how} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <SkillIcon skill={s} size={30} rarity={owned.get(id) ?? undefined} />
              <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{s?.name ?? id}</span>
              <TierBadge tier={s?.tier} size={16} />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: 3, fontSize: 12, lineHeight: 1.35 }}>
        {plan.pros.map((t) => (
          <div key={t} style={{ color: 'var(--green)' }}>
            ＋ {t}
          </div>
        ))}
        {plan.cons.map((t) => (
          <div key={t} style={{ color: 'var(--red)' }}>
            － {t}
          </div>
        ))}
      </div>

      <div>
        <div className="section-label">Level these first</div>
        <div style={{ display: 'grid', gap: 4, marginTop: 4, fontSize: 12, lineHeight: 1.35 }}>
          {plan.levelFirst.map((l) => (
            <div key={l.id}>
              <b>{skillById(data, l.id)?.name ?? l.id}.</b> <span className="muted">{l.why}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="section-label">Not offered? Take these instead</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
          {plan.backups.map((id) => (
            <SkillRow key={id} data={data} id={id} owned={owned} />
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11.5, margin: '5px 0 0', lineHeight: 1.35 }}>
          If neither offer is on this card and both look weak, use a reroll. You don’t get many.
        </p>
      </div>

      <div>
        <div className="section-label">Equip in the game</div>
        <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.35 }}>
          <span className="muted">Top slots: </span>
          {plan.equip.top.length ? plan.equip.top.map((id) => skillById(data, id)?.name ?? id).join(', ') : <span className="muted">no known Legendary, leave empty (that offer becomes random)</span>}
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
          {plan.equip.bottom.map((id) => (
            <SkillRow key={id} data={data} id={id} owned={owned} />
          ))}
        </div>
      </div>

      {chosen ? (
        <button className="btn" onClick={() => void window.shotcaller.setSkillshotGoal([], false)}>
          ✓ Your goal build. Clear it
        </button>
      ) : (
        <button className="btn primary" onClick={() => void window.shotcaller.setSkillshotGoal(plan.skills, true)}>
          Make this my goal build
        </button>
      )}
    </section>
  );
}
