import { useEffect, useMemo, useState } from 'react';
import type { DbdData, DbdPatchNote, DbdPopularList, DbdState } from '../../shared/dbd';
import { computeCatchup, tierText, type DbdCatchup } from '../../shared/dbdCatchup';
import { daysAgo, fmtDate, Icon, NewTag, RichText, Section, useNow } from './dbdShared';

/**
 * "What changed since you last played": from Steam's last-played date for DbD (or a date you pick), grouped by
 * type. Game data from the wiki; the official wording of each patch from Steam's news feed.
 */

export function catchupFrom(state: DbdState): number | null {
  return state.settings.catchupFrom ?? state.steamLastPlayed;
}

export function usePatchNotes(): DbdPatchNote[] | null {
  const [notes, setNotes] = useState<DbdPatchNote[] | null>(null);
  useEffect(() => {
    void window.shotcaller.getDbdNews().then(setNotes);
  }, []);
  return notes;
}

const toInput = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function CatchupTab({ state, data, onBuilds }: { state: DbdState; data: DbdData; onBuilds: () => void }) {
  const from = catchupFrom(state);
  const now = useNow();
  const [picking, setPicking] = useState(false);
  const c = useMemo(() => (from ? computeCatchup(data, from) : null), [data, from]);
  const notes = usePatchNotes();
  const [popular, setPopular] = useState<DbdPopularList | null>(null);
  useEffect(() => {
    void window.shotcaller.getDbdPopular().then(setPopular);
  }, []);

  const custom = state.settings.catchupFrom !== null;
  const shortSession = !custom && state.steamLastSessionMin !== null && state.steamLastSessionMin < 30;

  return (
    <div className="enter" style={{ display: 'grid', gap: 12 }}>
      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>{from ? `Since ${fmtDate(from)}` : 'Since when?'}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {from
                ? `${custom ? 'The date you picked' : 'The last time Steam saw you play DbD'} · ${daysAgo(from)}${c ? ` · patch ${c.fromVersion ?? '?'} → ${c.nowVersion ?? '?'}` : ''}`
                : 'Steam has no last-played date for DbD on this PC. Pick the date you last played.'}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            {picking ? (
              <input
                type="date"
                autoFocus
                defaultValue={from ? toInput(from) : undefined}
                max={toInput(now)}
                min="2016-06-14"
                onChange={(e) => {
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  if (y && m && d) void window.shotcaller.updateDbd({ catchupFrom: new Date(y, m - 1, d).getTime() });
                }}
                onBlur={() => setPicking(false)}
              />
            ) : (
              <button className="btn" onClick={() => setPicking(true)}>
                Change
              </button>
            )}
            {custom && state.steamLastPlayed && (
              <button className="btn" onClick={() => void window.shotcaller.updateDbd({ catchupFrom: null })}>
                Use Steam’s date
              </button>
            )}
          </div>
        </div>
        {shortSession && (
          <div className="tile" style={{ padding: '8px 12px', fontSize: 13 }}>
            That last time was only {state.steamLastSessionMin} min. If you just opened the game and didn’t really play, pick an earlier date with <b>Change</b>.
          </div>
        )}
      </section>

      {c && <Summary c={c} />}
      {c && <Groups c={c} notes={notes} />}
      {c && popular && (
        <Section title="Strong right now" right={<button className="pill" style={{ cursor: 'pointer' }} onClick={onBuilds}>Open builds</button>}>
          <div className="muted" style={{ fontSize: 13 }}>
            Popular builds to start from (checked against patch {popular.checkedPatch}). Perks changed since you left are marked in Builds.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
            {popular.builds.map((b) => (
              <div key={b.name} className="tile" style={{ padding: 10, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 700 }}>{b.name}</span>
                  <span className="pill muted" style={{ marginLeft: 'auto' }}>
                    {b.side}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {b.perks.map((n) => (
                    <Icon key={n} src={data.perks.find((p) => p.name === n)?.icon ?? null} size={36} />
                  ))}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{b.why}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Summary({ c }: { c: DbdCatchup }) {
  const bits = [
    [c.patches.length, 'patch', 'patches'],
    [c.chapters.length, 'chapter', 'chapters'],
    [c.killers.length, 'new killer', 'new killers'],
    [c.survivors.length, 'new survivor', 'new survivors'],
    [c.newPerks.length, 'new perk', 'new perks'],
    [c.changedPerks.length, 'perk changed', 'perks changed'],
    [c.changedPowers.length, 'killer power changed', 'killer powers changed'],
    [c.maps.length, 'new map', 'new maps'],
  ] as [number, string, string][];
  const shown = bits.filter(([n]) => n > 0);
  return (
    <section className="card dbd-summary">
      {shown.length === 0 ? (
        <div className="muted">Nothing changed in the game since then.</div>
      ) : (
        shown.map(([n, one, many]) => (
          <div key={many}>
            <div className="dbd-summary-n">{n}</div>
            <div className="muted" style={{ fontSize: 12 }}>{n === 1 ? one : many}</div>
          </div>
        ))
      )}
    </section>
  );
}

function Groups({ c, notes }: { c: DbdCatchup; notes: DbdPatchNote[] | null }) {
  const [openPerk, setOpenPerk] = useState<string | null>(null);
  const [showAllPerks, setShowAllPerks] = useState(false);
  const perks = showAllPerks ? c.changedPerks : c.changedPerks.slice(0, 24);
  return (
    <>
      {c.killers.length > 0 && (
        <Section title="New killers" count={c.killers.length}>
          <div className="dbd-card-grid">
            {c.killers.map((k) => (
              <div key={k.id} className="tile dbd-char">
                <Icon src={k.icon} size={64} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <b>The {k.name}</b> <NewTag />
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {[k.power, k.speed, k.radius && `terror radius ${k.radius}`].filter(Boolean).join(' · ')}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {k.chapter} · {fmtDate(k.date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.survivors.length > 0 && (
        <Section title="New survivors" count={c.survivors.length}>
          <div className="dbd-card-grid">
            {c.survivors.map((s) => (
              <div key={s.id} className="tile dbd-char">
                <Icon src={s.icon} size={56} />
                <div>
                  <b>{s.name}</b>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.chapter} · {fmtDate(s.date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.newPerks.length > 0 && (
        <Section title="New perks" count={c.newPerks.length}>
          <div style={{ display: 'grid', gap: 6 }}>
            {c.newPerks.map((p) => (
              <PerkLine key={p.name} name={p.name} icon={p.icon} sub={`${p.side === 'killer' ? 'Killer' : 'Survivor'} · ${p.character ?? 'everyone'}`} line={p.summary} html={p.text} open={openPerk === p.name} onToggle={() => setOpenPerk(openPerk === p.name ? null : p.name)} isNew />
            ))}
          </div>
        </Section>
      )}

      {c.changedPerks.length > 0 && (
        <Section title="Perk changes" count={c.changedPerks.length}>
          <div className="muted" style={{ fontSize: 12 }}>Numbers are tier I/II/III, before → now. Click a perk for its full text now.</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {perks.map((ch) => {
              const same = ch.before && ch.before.join() === ch.after.join();
              const change = ch.before && !same ? `${tierText(ch.before, ch.perk.unit)} → ${tierText(ch.after, ch.perk.unit)}` : 'Wording or how it works changed';
              return (
                <PerkLine
                  key={ch.perk.name}
                  name={ch.perk.name}
                  icon={ch.perk.icon}
                  sub={`${ch.perk.side === 'killer' ? 'Killer' : 'Survivor'} · changed in ${ch.version}`}
                  line={change}
                  html={ch.perk.text}
                  open={openPerk === ch.perk.name}
                  onToggle={() => setOpenPerk(openPerk === ch.perk.name ? null : ch.perk.name)}
                />
              );
            })}
          </div>
          {c.changedPerks.length > perks.length && (
            <button className="btn" onClick={() => setShowAllPerks(true)}>
              Show all {c.changedPerks.length}
            </button>
          )}
        </Section>
      )}

      {(c.changedPowers.length > 0 || c.changedAddons.length > 0) && (
        <Section title="Killer changes">
          {c.changedPowers.length > 0 && (
            <div className="dbd-card-grid">
              {c.changedPowers.map((k) => (
                <div key={k.id} className="tile dbd-char">
                  <Icon src={k.icon} size={48} />
                  <div>
                    <b>The {k.name}</b>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {k.power} changed in {k.powerPatch}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {c.changedAddons.length > 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              Add-ons changed: {c.changedAddons.map((a) => `${a.killer} (${a.count})`).join(', ')}
            </div>
          )}
        </Section>
      )}

      {c.maps.length > 0 && (
        <Section title="New maps" count={c.maps.length}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {c.maps.map((m) => (
              <span key={m.id} className="pill muted">
                {m.name}
                {m.realm ? ` · ${m.realm}` : ''}
              </span>
            ))}
          </div>
        </Section>
      )}

      {(c.changedItems.length > 0 || c.changedOfferings.length > 0) && (
        <Section title="Items and offerings changed">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[...c.changedItems, ...c.changedOfferings].map((t) => (
              <span key={t.name} className="tile" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 10px 4px 4px', fontSize: 13 }} title={t.summary}>
                <Icon src={t.icon} size={28} />
                {t.name}
              </span>
            ))}
          </div>
        </Section>
      )}

      {c.patches.length > 0 && <PatchList c={c} notes={notes} />}
    </>
  );
}

function PerkLine({ name, icon, sub, line, html, open, onToggle, isNew }: { name: string; icon: string | null; sub: string; line: string; html: string; open: boolean; onToggle: () => void; isNew?: boolean }) {
  return (
    <div className="tile" style={{ padding: 8 }}>
      <button onClick={onToggle} style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', textAlign: 'left' }}>
        <Icon src={icon} size={44} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{name}</b>
            {isNew && <NewTag />}
            <span className="muted" style={{ fontSize: 12 }}>{sub}</span>
          </div>
          <div style={{ fontSize: 13 }}>{line}</div>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <RichText html={html} style={{ fontSize: 13, padding: '8px 4px 2px 54px' }} />}
    </div>
  );
}

function PatchList({ c, notes }: { c: DbdCatchup; notes: DbdPatchNote[] | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const live = (notes ?? []).filter((n) => !n.ptb);
  return (
    <Section title="Patches" count={c.patches.length}>
      <div style={{ display: 'grid', gap: 6 }}>
        {c.patches.map((p) => {
          const note = live.find((n) => n.version === p.version.toLowerCase());
          return (
            <div key={p.version} className="tile" style={{ padding: '8px 12px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <b>{p.version}</b>
                <span className="muted" style={{ fontSize: 13 }}>{fmtDate(p.date)}</span>
                {note && <span className="muted" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.title}</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flex: 'none' }}>
                  {note ? (
                    <>
                      <button className="pill muted" style={{ cursor: 'pointer' }} onClick={() => setOpen(open === p.version ? null : p.version)}>
                        {open === p.version ? 'Hide notes' : 'Official notes'}
                      </button>
                      <button className="pill muted" style={{ cursor: 'pointer' }} onClick={() => void window.shotcaller.openExternal(note.url)}>
                        Steam ↗
                      </button>
                    </>
                  ) : (
                    <span className="muted" style={{ fontSize: 12 }}>{notes ? 'No notes on Steam' : 'Loading notes…'}</span>
                  )}
                </span>
              </div>
              {open === p.version && note && <RichText html={note.html} style={{ fontSize: 13, marginTop: 8, maxHeight: 420, overflow: 'auto' }} />}
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 12 }}>Steam only keeps the most recent announcements, so older patches may have no notes here.</div>
    </Section>
  );
}
