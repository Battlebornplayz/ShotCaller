import { useEffect, useMemo, useState } from 'react';
import { cmpVersion, decodeBuild, encodeBuild, type DbdBuild, type DbdData, type DbdPerk, type DbdPopularBuild, type DbdPopularList, type DbdSide, type DbdState } from '../../shared/dbd';
import { tierText } from '../../shared/dbdCatchup';
import { Icon, NewTag, RichText, tagLabel } from './dbdShared';

/**
 * Build manager: your saved builds per side, the curated popular builds, share codes, and an editor with a perk
 * grid (search, tag filters, one-line summaries that expand to the full game text).
 */

type Draft = Omit<DbdBuild, 'id' | 'createdAt' | 'updatedAt'> & { id: string | null };

const emptyDraft = (side: DbdSide): Draft => ({ id: null, name: '', side, perks: ['', '', '', ''], killer: null, item: null, addons: [], offering: null, notes: '', from: 'mine' });

const fromBuild = (b: Pick<DbdBuild, 'name' | 'side' | 'perks' | 'killer' | 'item' | 'addons' | 'offering'> & Partial<DbdBuild>): Draft => ({
  id: b.id ?? null,
  name: b.name,
  side: b.side,
  perks: [...b.perks, '', '', '', ''].slice(0, 4),
  killer: b.killer ?? null,
  item: b.item ?? null,
  addons: b.addons ?? [],
  offering: b.offering ?? null,
  notes: b.notes ?? '',
  from: b.from ?? 'mine',
});

const fromPopular = (p: DbdPopularBuild): Draft => ({
  ...fromBuild({ name: p.name, side: p.side, perks: p.perks, killer: p.killer ?? null, item: p.item ?? null, addons: p.addons ?? [], offering: p.offering ?? null }),
  notes: p.why,
  from: 'popular',
});

export function BuildsTab({ state, data, side, newSince }: { state: DbdState; data: DbdData; side: DbdSide; newSince: number | null }) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(side));
  const [slot, setSlot] = useState(0);
  const [popular, setPopular] = useState<DbdPopularList | null>(null);
  const [code, setCode] = useState('');
  const [codeMsg, setCodeMsg] = useState<string | null>(null);
  // The code shown belongs to the build it was made for; editing the build hides it.
  const [shared, setShared] = useState<{ code: string; of: Draft } | null>(null);
  const shareCode = shared?.of === draft ? shared.code : null;

  useEffect(() => {
    void window.shotcaller.getDbdPopular().then(setPopular);
  }, []);

  const perkByName = useMemo(() => new Map(data.perks.map((p) => [p.name, p])), [data]);
  const mine = state.builds.filter((b) => b.side === side);
  const pop = (popular?.builds ?? []).filter((b) => b.side === side);

  const pickPerk = (name: string) => {
    setDraft((d) => {
      const perks = [...d.perks];
      const at = perks.indexOf(name);
      if (at >= 0) {
        perks[at] = '';
        return { ...d, perks };
      }
      perks[slot] = name;
      return { ...d, perks };
    });
    setSlot((s) => {
      const next = draft.perks.findIndex((p, i) => i !== s && !p);
      return next >= 0 ? next : s;
    });
  };

  const save = async (asNew: boolean) => {
    const name = draft.name.trim() || `${side === 'killer' ? draft.killer ?? 'Killer' : 'Survivor'} build`;
    const next = await window.shotcaller.saveDbdBuild({ ...draft, name, id: asNew ? undefined : draft.id ?? undefined, from: asNew && draft.from === 'popular' ? 'popular' : draft.from });
    const saved = asNew || !draft.id ? next.builds[0] : next.builds.find((b) => b.id === draft.id);
    if (saved) setDraft(fromBuild(saved));
  };

  const importCode = async () => {
    const b = await decodeBuild(code);
    if (!b) {
      setCodeMsg('That isn’t a ShotCaller DbD build code (they start with DBD1-).');
      return;
    }
    const next = await window.shotcaller.saveDbdBuild({ ...b, from: 'friend', notes: 'From a friend’s code.' });
    setCode('');
    setCodeMsg(`Saved “${b.name}” to your ${b.side} builds.`);
    if (next.builds[0]) setDraft(fromBuild(next.builds[0]));
  };

  const copyCode = async () => {
    const c = await encodeBuild({ ...draft, name: draft.name.trim() || 'Build' });
    setShared({ code: c, of: draft });
    try {
      await navigator.clipboard.writeText(c);
    } catch {
      // The code is shown to copy by hand.
    }
  };

  return (
    <div className="enter dbd-builds">
      <aside style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <section className="card" style={{ display: 'grid', gap: 8, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="section-label">Your {side} builds · {mine.length}</div>
            <button className="pill" style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => (setDraft(emptyDraft(side)), setSlot(0))}>
              + New
            </button>
          </div>
          {mine.length === 0 && <div className="muted" style={{ fontSize: 13 }}>None yet. Make one on the right, or copy a popular one.</div>}
          {mine.map((b) => (
            <BuildRow key={b.id} name={b.name} perks={b.perks} perkByName={perkByName} active={draft.id === b.id} sub={b.from === 'friend' ? 'From a friend' : b.killer ?? b.item ?? undefined} onClick={() => (setDraft(fromBuild(b)), setSlot(0))} />
          ))}
        </section>

        <section className="card" style={{ display: 'grid', gap: 8, padding: 14 }}>
          <div className="section-label">Popular {side} builds</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Well-known builds, checked against patch {popular?.checkedPatch ?? '…'}. Click one to look at it, then save your own copy.
          </div>
          {pop.map((p) => {
            const changed = p.perks.filter((n) => {
              const perk = perkByName.get(n);
              return !perk || (perk.patch && popular && cmpVersion(perk.patch, popular.checkedPatch) > 0);
            });
            return (
              <BuildRow
                key={p.name}
                name={p.name}
                perks={p.perks}
                perkByName={perkByName}
                active={draft.from === 'popular' && !draft.id && draft.name === p.name}
                sub={changed.length ? `Check: ${changed.join(', ')} changed since` : p.why}
                warn={changed.length > 0}
                onClick={() => (setDraft(fromPopular(p)), setSlot(0))}
              />
            );
          })}
        </section>

        <section className="card" style={{ display: 'grid', gap: 8, padding: 14 }}>
          <div className="section-label">Build from a friend</div>
          <form
            style={{ display: 'flex', gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              void importCode();
            }}
          >
            <input value={code} onChange={(e) => (setCode(e.target.value), setCodeMsg(null))} placeholder="Paste a DBD1-… code" style={{ flex: 1, minWidth: 0 }} />
            <button className="btn" type="submit" disabled={!code.trim()} style={{ padding: '8px 12px' }}>
              Add
            </button>
          </form>
          {codeMsg && <div className="muted" style={{ fontSize: 12 }}>{codeMsg}</div>}
        </section>
      </aside>

      <div style={{ display: 'grid', gap: 12, alignContent: 'start', minWidth: 0 }}>
        <Editor draft={draft} setDraft={setDraft} slot={slot} setSlot={setSlot} data={data} perkByName={perkByName} />
        <section className="card" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: 14 }}>
          <button className="btn primary" onClick={() => void save(false)} disabled={!draft.perks.some(Boolean)}>
            {draft.id ? 'Save changes' : 'Save build'}
          </button>
          {draft.id && (
            <button className="btn" onClick={() => void save(true)}>
              Save as new
            </button>
          )}
          <button className="btn" onClick={() => void copyCode()} disabled={!draft.perks.some(Boolean)} title="A short code a friend can paste into their ShotCaller">
            Copy share code
          </button>
          {draft.id && (
            <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => void window.shotcaller.deleteDbdBuild(draft.id!).then(() => setDraft(emptyDraft(side)))}>
              Delete
            </button>
          )}
          {shareCode && (
            <div className="tile" style={{ width: '100%', padding: '8px 10px', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="muted">Copied:</span>
              <code style={{ userSelect: 'all', wordBreak: 'break-all' }}>{shareCode}</code>
            </div>
          )}
        </section>
        <PerkPicker data={data} side={side} chosen={draft.perks} onPick={pickPerk} newSince={newSince} showNew={state.settings.newTags} />
      </div>
    </div>
  );
}

function BuildRow({ name, perks, perkByName, active, sub, warn, onClick }: { name: string; perks: string[]; perkByName: Map<string, DbdPerk>; active: boolean; sub?: string; warn?: boolean; onClick: () => void }) {
  return (
    <button className={`dbd-build-row${active ? ' active' : ''}`} onClick={onClick}>
      <div style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2, 3].map((i) => (
          <Icon key={i} src={perkByName.get(perks[i])?.icon ?? null} size={30} />
        ))}
      </div>
      <div style={{ minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {sub && (
          <div className={warn ? undefined : 'muted'} style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: warn ? 'var(--gold)' : undefined }}>
            {sub}
          </div>
        )}
      </div>
    </button>
  );
}

function Editor({ draft, setDraft, slot, setSlot, data, perkByName }: { draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; slot: number; setSlot: (n: number) => void; data: DbdData; perkByName: Map<string, DbdPerk> }) {
  const killer = draft.side === 'killer';
  const item = data.items.find((i) => i.name === draft.item);
  const addonChoices = data.addons.filter((a) => (killer ? a.group === draft.killer : !!item && a.side === 'survivor' && a.group === item.group)).sort((a, b) => a.name.localeCompare(b.name));
  const offerings = data.offerings.filter((o) => o.side === 'both' || o.side === draft.side).sort((a, b) => a.name.localeCompare(b.name));
  const itemGroups = [...new Set(data.items.map((i) => i.group ?? 'Other'))].sort();
  const setAddon = (i: number, v: string) =>
    setDraft((d) => {
      const a = [d.addons[0] ?? '', d.addons[1] ?? ''];
      a[i] = v;
      return { ...d, addons: a.filter(Boolean) };
    });

  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Build name" maxLength={60} style={{ flex: 1, fontWeight: 700 }} />
        {draft.from === 'popular' && !draft.id && <span className="pill muted">Popular build, not saved yet</span>}
        {draft.from === 'friend' && <span className="pill muted">From a friend</span>}
      </div>

      <div className="dbd-slots">
        {draft.perks.map((name, i) => {
          const p = perkByName.get(name);
          return (
            <button key={i} className={`dbd-slot${slot === i ? ' active' : ''}`} onClick={() => setSlot(i)} title={name ? 'Click a perk below to swap, or click this perk there again to remove it' : 'Pick a perk below'}>
              <Icon src={p?.icon ?? null} size={64} />
              <span className="dbd-slot-name">{name || `Perk ${i + 1}`}</span>
              {name && !p && <span style={{ fontSize: 11, color: 'var(--gold)' }}>Not in the game data</span>}
              {name && (
                <span
                  className="dbd-slot-x"
                  role="button"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDraft((d) => ({ ...d, perks: d.perks.map((x, j) => (j === i ? '' : x)) }));
                    setSlot(i);
                  }}
                >
                  ✕
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="dbd-loadout">
        {killer ? (
          <label>
            <span className="muted">Killer</span>
            <select value={draft.killer ?? ''} onChange={(e) => setDraft((d) => ({ ...d, killer: e.target.value || null, addons: [] }))}>
              <option value="">Any killer</option>
              {[...data.killers].sort((a, b) => a.name.localeCompare(b.name)).map((k) => (
                <option key={k.id} value={k.name}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            <span className="muted">Item</span>
            <select value={draft.item ?? ''} onChange={(e) => setDraft((d) => ({ ...d, item: e.target.value || null, addons: [] }))}>
              <option value="">No item</option>
              {itemGroups.map((g) => (
                <optgroup key={g} label={g}>
                  {data.items
                    .filter((i) => (i.group ?? 'Other') === g)
                    .map((i) => (
                      <option key={i.name} value={i.name}>
                        {i.name} ({i.rarity})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
        {[0, 1].map((i) => (
          <label key={i}>
            <span className="muted">Add-on {i + 1}</span>
            <select value={draft.addons[i] ?? ''} onChange={(e) => setAddon(i, e.target.value)} disabled={!addonChoices.length}>
              <option value="">{addonChoices.length ? 'None' : killer ? 'Pick a killer first' : 'Pick an item first'}</option>
              {addonChoices.map((a) => (
                <option key={a.name} value={a.name} disabled={draft.addons.includes(a.name) && draft.addons[i] !== a.name}>
                  {a.name} ({a.rarity})
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          <span className="muted">Offering</span>
          <select value={draft.offering ?? ''} onChange={(e) => setDraft((d) => ({ ...d, offering: e.target.value || null }))}>
            <option value="">None</option>
            {offerings.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <LoadoutIcons draft={draft} data={data} />
      <textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder="Notes (when to use it, what to watch for)" rows={2} maxLength={500} />
    </section>
  );
}

function LoadoutIcons({ draft, data }: { draft: Draft; data: DbdData }) {
  const things = [
    draft.side === 'killer' ? data.killers.find((k) => k.name === draft.killer) : data.items.find((i) => i.name === draft.item),
    ...draft.addons.map((a) => data.addons.find((x) => x.name === a)),
    data.offerings.find((o) => o.name === draft.offering),
  ].filter((x): x is NonNullable<typeof x> => !!x);
  if (!things.length) return null;
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {things.map((t) => (
        <div key={t.name} className="tile" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', maxWidth: 320 }} title={'summary' in t ? t.summary : ''}>
          <Icon src={t.icon} size={34} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</div>
            {'summary' in t && <div className="muted" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.summary}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Perk picker

function PerkPicker({ data, side, chosen, onPick, newSince, showNew }: { data: DbdData; side: DbdSide; chosen: string[]; onPick: (name: string) => void; newSince: number | null; showNew: boolean }) {
  const [query, setQuery] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [onlyNew, setOnlyNew] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  const sidePerks = useMemo(() => data.perks.filter((p) => p.side === side), [data, side]);
  const isNew = (p: DbdPerk) => showNew && newSince !== null && p.date > newSince;
  const topTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of sidePerks) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([t]) => t);
  }, [sidePerks]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sidePerks.filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || (p.character ?? '').toLowerCase().includes(q) || p.summary.toLowerCase().includes(q)) &&
        tags.every((t) => p.tags.includes(t)) &&
        (!onlyNew || isNew(p)),
    );
  }, [sidePerks, query, tags, onlyNew, newSince, showNew]); // eslint-disable-line react-hooks/exhaustive-deps

  const focused = data.perks.find((p) => p.name === focus) ?? null;
  const anyNew = sidePerks.some(isNew);

  return (
    <section className="card" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div className="section-label">{side === 'killer' ? 'Killer' : 'Survivor'} perks · {list.length}</div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search perks, owners, effects" style={{ marginLeft: 'auto', width: 260 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {anyNew && (
          <button className={`dbd-chip${onlyNew ? ' on' : ''}`} onClick={() => setOnlyNew((v) => !v)}>
            New since you left
          </button>
        )}
        {topTags.map((t) => (
          <button key={t} className={`dbd-chip${tags.includes(t) ? ' on' : ''}`} onClick={() => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]))}>
            {tagLabel(t)}
          </button>
        ))}
        {(tags.length > 0 || onlyNew || query) && (
          <button className="dbd-chip" onClick={() => (setTags([]), setOnlyNew(false), setQuery(''))}>
            Clear
          </button>
        )}
      </div>

      {focused && (
        <div className="tile dbd-perk-detail">
          <Icon src={focused.icon} size={72} />
          <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{focused.name}</span>
              {isNew(focused) && <NewTag />}
              <span className="muted" style={{ fontSize: 12 }}>
                {focused.character ?? 'Everyone'}
                {focused.values.length ? ` · ${tierText(focused.values, focused.unit)}` : ''}
                {focused.patch ? ` · last changed ${focused.patch}` : ''}
              </span>
            </div>
            <div style={{ fontSize: 13 }}>{focused.summary}</div>
            {full && <RichText html={focused.text} style={{ fontSize: 13, marginTop: 4 }} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pill muted" style={{ cursor: 'pointer' }} onClick={() => setFull((v) => !v)}>
                {full ? 'Less' : 'Full text'}
              </button>
              <button className="pill" style={{ cursor: 'pointer' }} onClick={() => onPick(focused.name)}>
                {chosen.includes(focused.name) ? 'Remove from build' : 'Add to build'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="dbd-perk-grid">
        {list.map((p) => (
          <button
            key={p.name}
            className={`dbd-perk${chosen.includes(p.name) ? ' chosen' : ''}${focus === p.name ? ' focus' : ''}`}
            onClick={() => onPick(p.name)}
            onMouseEnter={() => setFocus(p.name)}
            onFocus={() => setFocus(p.name)}
            title={p.summary}
          >
            <Icon src={p.icon} size={56} />
            <span className="dbd-perk-name">{p.name}</span>
            {isNew(p) && <NewTag />}
          </button>
        ))}
        {list.length === 0 && <div className="muted">No perks match.</div>}
      </div>
    </section>
  );
}
