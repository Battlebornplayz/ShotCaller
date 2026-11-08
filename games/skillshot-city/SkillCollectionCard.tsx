import { useMemo, useState } from 'react';
import type { SkillshotData } from '../../shared/skillshot';
import { RARITY_COLORS, RARITY_NAMES, type OwnedSkill, type SkillCollection } from '../../shared/skillshotCollection';
import { useSkillCollection, useSkillshot, useSkillshotData } from '../../src/hooks/useLive';
import { RarityPill, SkillIcon, skillById, TierBadge } from './ui';

/**
 * "Your skills" on the Skillshot City game page: every skill ShotCaller has seen you own, colored by
 * rarity, plus the build you equip on each class. All auto-detected from the game's files.
 */

type Tab = 'owned' | string;

const className = (data: SkillshotData | null, id: string | null): string =>
  (id && data?.classes.find((c) => c.id === id)?.name) || (id ? id.charAt(0) + id.slice(1).toLowerCase() : 'Unknown');

function ago(ms: number | null): string {
  if (!ms) return '';
  const d = Math.floor((Date.now() - ms) / 86400000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export function SkillCollectionCard() {
  const collection = useSkillCollection();
  const data = useSkillshotData();
  const live = useSkillshot();
  const [tab, setTab] = useState<Tab>('owned');
  const [picking, setPicking] = useState(false);

  if (!collection) return null;
  const empty = collection.owned.length === 0 && collection.classBuilds.length === 0;

  return (
    <section className="card enter" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Your skills</h2>
        <span className="pill green" style={{ fontSize: 11 }}>
          ● Auto-detected
        </span>
        <div style={{ flex: 1 }} />
        <ClassChip data={data} live={live} collection={collection} picking={picking} setPicking={setPicking} />
      </div>
      {picking && <ClassPicker data={data} current={live?.classSource === 'manual' ? live.classId : null} onDone={() => setPicking(false)} />}

      {empty ? (
        <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
          Nothing yet. Play a match: your equipped build and its rarities are read the moment the game logs your first skill pick.
        </p>
      ) : (
        <>
          <RarityLegend owned={collection.owned} />
          <div className="segmented" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button aria-pressed={tab === 'owned'} onClick={() => setTab('owned')}>
              All owned ({collection.owned.length})
            </button>
            {collection.classBuilds.map((b) => (
              <button key={b.classId} aria-pressed={tab === b.classId} onClick={() => setTab(b.classId)}>
                {className(data, b.classId)} build
              </button>
            ))}
          </div>
          {tab === 'owned' ? <OwnedGrid owned={collection.owned} data={data} /> : <ClassBuildView collection={collection} classId={tab} data={data} />}
        </>
      )}

      <p className="muted" style={{ fontSize: 11.5, margin: '12px 0 0' }}>
        Read-only from the game's files: each match's equipped build (with rarity and class) from <code>log.txt</code>, and your owned-skill list
        from your profile. The full collection is kept on the game's server, so a skill you've never equipped shows as a number until the game
        names it. The memory reader (coming later) fills in the rest.
      </p>
    </section>
  );
}

function ClassChip({
  data,
  live,
  collection,
  picking,
  setPicking,
}: {
  data: SkillshotData | null;
  live: ReturnType<typeof useSkillshot>;
  collection: SkillCollection;
  picking: boolean;
  setPicking: (v: boolean) => void;
}) {
  const cls = live?.classId ?? collection.detectedClass;
  const source = live?.classSource === 'manual' ? 'picked by you' : cls ? 'from your last match' : 'not detected yet';
  return (
    <button className="btn" onClick={() => setPicking(!picking)} title="Change the class advice uses">
      Class: <b style={{ marginLeft: 4 }}>{cls ? className(data, cls) : '—'}</b>
      <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
        {source}
      </span>
    </button>
  );
}

function ClassPicker({ data, current, onDone }: { data: SkillshotData | null; current: string | null; onDone: () => void }) {
  const set = (id: string | null) => {
    void window.shotcaller.setSkillshotClass(id);
    onDone();
  };
  return (
    <div className="enter" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
      <button className="btn" aria-pressed={current === null} onClick={() => set(null)} style={current === null ? { borderColor: 'var(--accent)' } : undefined}>
        Auto-detect
      </button>
      {data?.classes.map((c) => (
        <button key={c.id} className="btn" onClick={() => set(c.id)} style={current === c.id ? { borderColor: 'var(--accent)' } : undefined}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

function RarityLegend({ owned }: { owned: OwnedSkill[] }) {
  const named = owned.filter((o) => o.rarities.length);
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, fontSize: 12 }}>
      {[3, 2, 1, 0].map((r) => (
        <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: RARITY_COLORS[r] }} />
          <b>{named.filter((o) => o.rarity === r).length}</b> <span className="muted">{RARITY_NAMES[r]}</span>
        </span>
      ))}
      {owned.length > named.length && (
        <span className="muted">
          + {owned.length - named.length} owned, rarity not seen yet
        </span>
      )}
    </div>
  );
}

function OwnedGrid({ owned, data }: { owned: OwnedSkill[]; data: SkillshotData | null }) {
  const sorted = useMemo(
    () => [...owned].sort((a, b) => Number(!!b.rarities.length) - Number(!!a.rarities.length) || b.rarity - a.rarity),
    [owned],
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 12 }}>
      {sorted.map((o) => {
        const skill = skillById(data, o.skillId);
        const known = o.rarities.length > 0;
        return (
          <div
            key={o.num}
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              padding: 8,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${known ? `${RARITY_COLORS[o.rarity]}33` : 'var(--border)'}`,
            }}
          >
            <SkillIcon skill={skill} rarity={known ? o.rarity : undefined} label={`#${o.num}`} dim={!skill} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {skill?.name ?? `Skill #${o.num}`}
                </span>
                <TierBadge tier={skill?.tier} size={15} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                {known ? <RarityPill rarity={o.rarity} /> : <span className="muted" style={{ fontSize: 11 }}>{skill ? 'Rarity not seen yet' : 'Name not seen yet'}</span>}
                {o.copies > 1 && (
                  <span className="muted" style={{ fontSize: 11 }} title="Entries in your profile's owned-skill list">
                    ×{o.copies}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClassBuildView({ collection, classId, data }: { collection: SkillCollection; classId: string; data: SkillshotData | null }) {
  const build = collection.classBuilds.find((b) => b.classId === classId);
  if (!build) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
        Equipped {ago(build.seenAt)}
        {build.confirmed ? '' : ' · class guessed from your previous match (confirmed when this one finishes)'}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {build.slots.map((s, i) => {
          const skill = skillById(data, s.skillId);
          return (
            <div key={i} style={{ width: 76, textAlign: 'center' }}>
              {s.num < 0 ? (
                <div style={{ width: 52, height: 52, margin: '0 auto', borderRadius: 12, border: '2px dashed rgba(255,255,255,0.12)' }} />
              ) : (
                <SkillIcon skill={skill} rarity={s.rarity} size={52} label={`#${s.num}`} style={{ margin: '0 auto' }} />
              )}
              <div style={{ fontSize: 11, marginTop: 5, lineHeight: 1.25, color: s.num < 0 ? 'var(--muted)' : undefined }}>
                {s.num < 0 ? 'Empty' : (skill?.name ?? `#${s.num}`)}
              </div>
              {s.num >= 0 && (
                <div style={{ fontSize: 10, color: RARITY_COLORS[s.rarity], fontWeight: 700 }}>{RARITY_NAMES[s.rarity]}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
