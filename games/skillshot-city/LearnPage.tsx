import { useMemo, type ReactNode } from 'react';
import type { SkillshotData } from '../../shared/skillshot';
import {
  CLASS_NOTES,
  DRAFT_STEPS,
  FIRST_MATCHES,
  GLOSSARY,
  GUNS,
  GUNS_TO_AVOID,
  IF_YOU_DIE,
  LEARN_VERSION,
  ROUNDS,
  SOURCES_NOTE,
  THE_LOOP,
} from './learnData';
import { SkillIcon, TierBadge } from './ui';

/** Learn-to-play page: what to do in a match, in plain language, with no game knowledge assumed. */

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="card enter">
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
      {sub && (
        <p className="muted" style={{ fontSize: 12.5, margin: '3px 0 0', lineHeight: 1.45 }}>
          {sub}
        </p>
      )}
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 5, fontSize: 13, lineHeight: 1.45 }}>
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

const CELL = { padding: '7px 10px 7px 0', verticalAlign: 'top' } as const;

export function LearnPage({ data, onOpenSkill }: { data: SkillshotData; onOpenSkill: (id: string) => void }) {
  // Strong skills that need nothing pressed: the easiest good picks while you learn.
  const easyPicks = useMemo(
    () =>
      data.skills
        .filter((s) => (s.tier === 'S' || s.tier === 'A') && s.tags?.includes('passive'))
        .sort((a, b) => (a.tier ?? '').localeCompare(b.tier ?? '') || a.name.localeCompare(b.name)),
    [data.skills],
  );
  const traps = useMemo(() => data.skills.filter((s) => s.tier === 'C').sort((a, b) => a.name.localeCompare(b.name)), [data.skills]);

  const skillButton = (id: string, name: string, s: (typeof data.skills)[number]) => (
    <button key={id} className="ss-chip" onClick={() => onOpenSkill(id)} title={s.how}>
      <SkillIcon skill={s} size={20} />
      {name}
      <TierBadge tier={s.tier} size={14} />
    </button>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card enter" style={{ background: 'rgba(79,140,255,0.1)' }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>The whole game in five lines</h2>
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, display: 'grid', gap: 5, fontSize: 13.5, lineHeight: 1.45 }}>
          {THE_LOOP.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
      </section>

      <Section title="Your first matches" sub="You don’t need to understand everything yet. These habits matter first.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {FIRST_MATCHES.map((f) => (
            <div key={f.title} style={{ fontSize: 12.5, lineHeight: 1.45 }}>
              <b style={{ display: 'block', fontSize: 13, marginBottom: 2 }}>{f.title}</b>
              <span className="muted">{f.text}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Round by round" sub="What to do in each part of a match.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {ROUNDS.map((r) => (
            <div key={r.title} className="tile" style={{ padding: 12 }}>
              <b style={{ fontSize: 14 }}>{r.title}</b>
              <div style={{ fontSize: 12.5, color: 'var(--accent)', fontWeight: 600, margin: '2px 0 8px', lineHeight: 1.35 }}>{r.goal}</div>
              <Bullets items={r.steps} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="If you die" sub="Before the end of a match, dying usually isn’t the end.">
        <Bullets items={IF_YOU_DIE} />
      </Section>

      <Section title="Picking skills" sub="ShotCaller’s overlay recommends a pick at each level-up. This is what’s behind it.">
        <div className="section-label">Easy picks while you learn (strong, and nothing to press)</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 14px' }}>{easyPicks.map((s) => skillButton(s.id, s.name, s))}</div>
        <div className="section-label">Usually weak, even when they look good</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0 14px' }}>{traps.map((s) => skillButton(s.id, s.name, s))}</div>
        <div className="section-label">Where offers come from</div>
        <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px', lineHeight: 1.45 }}>
          Most offers are random, from every skill you’ve unlocked. Your equipped build only guarantees the right-hand offer for skills 3 and 4, so don’t count on getting one exact build. Equipped skills do show up more often, but nobody outside the game knows by how much.
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr className="muted" style={{ textAlign: 'left', fontSize: 11 }}>
              <th style={{ ...CELL, fontWeight: 600 }}>Step</th>
              <th style={{ ...CELL, fontWeight: 600 }}>Left offer</th>
              <th style={{ ...CELL, fontWeight: 600 }}>Right offer</th>
            </tr>
          </thead>
          <tbody>
            {DRAFT_STEPS.map((d) => (
              <tr key={d.step} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...CELL, fontWeight: 600 }}>{d.step}</td>
                <td style={CELL}>{d.left}</td>
                <td style={CELL}>{d.right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Classes" sub="Class matters less than it seems: average trophies are within half a trophy across all 8. How good each one is for a beginner is ShotCaller’s judgment.">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <tbody>
            {data.classes.map((c) => {
              const n = CLASS_NOTES[c.id];
              return (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...CELL, fontWeight: 700, width: 92 }}>{c.name}</td>
                  <td style={{ ...CELL, lineHeight: 1.4 }}>
                    {c.description}
                    {n && <div className="muted" style={{ marginTop: 2 }}>{n.note}</div>}
                  </td>
                  <td style={{ ...CELL, width: 92, textAlign: 'right', paddingRight: 0, fontWeight: 600, color: n?.fit === 'Best to start' ? 'var(--green)' : undefined }}>{n?.fit}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Which gun to buy" sub={GUNS_TO_AVOID}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {GUNS.map((g) => (
            <div key={g.round}>
              <div className="section-label">{g.round}</div>
              <div style={{ display: 'grid', gap: 5, marginTop: 5, fontSize: 12.5, lineHeight: 1.35 }}>
                {g.picks.map((p) => (
                  <div key={p.name}>
                    <b>{p.name}</b> <span className="muted">{p.why}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What the words mean">
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px 18px', fontSize: 12.5, lineHeight: 1.45 }}>
          {GLOSSARY.map((g) => (
            <div key={g.term}>
              <dt style={{ fontWeight: 700 }}>{g.term}</dt>
              <dd className="muted" style={{ margin: 0 }}>
                {g.meaning}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {!!data.tips?.length && (
        <Section title="Tips from the game" sub="The developer’s own loading-screen tips.">
          <Bullets items={data.tips} />
        </Section>
      )}

      <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.45 }}>
        Checked against {LEARN_VERSION}. {SOURCES_NOTE}
      </p>
    </div>
  );
}
