import { useMemo, useState } from 'react';
import { rarityTier, type UnlockEvent } from '../../../shared/types';
import { AchIcon, RarityPill } from '../../components/achievements';
import { useHubQuery } from '../../hooks/useLive';
import { PageHeader } from '../pages';

type Filter = 'all' | 'rare';

const VIA: Record<UnlockEvent['via'], string> = { steam: 'Steam', emulator: 'Local file', manual: 'Ticked' };

function dayLabel(ms: number): string {
  if (!ms) return 'Unknown date';
  const d = new Date(ms);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

export function TimelinePage({ onOpenGame }: { onOpenGame: (key: string) => void }) {
  const [limit, setLimit] = useState(150);
  const [filter, setFilter] = useState<Filter>('all');
  const { value: events, loading } = useHubQuery(() => window.shotcaller.getTimeline(limit), [limit]);

  const groups = useMemo(() => {
    const list = (events ?? []).filter((e) => filter === 'all' || (e.rarity !== null && e.rarity <= 25));
    const out: { label: string; items: UnlockEvent[] }[] = [];
    for (const e of list) {
      const label = dayLabel(e.unlockedAt);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [events, filter]);

  return (
    <>
      <PageHeader
        title="Timeline"
        subtitle="Every achievement you’ve unlocked, newest first."
        actions={
          <div className="segmented">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
              All
            </button>
            <button aria-pressed={filter === 'rare'} onClick={() => setFilter('rare')}>
              Rare and up
            </button>
          </div>
        }
      />
      {loading && !events && (
        <div className="card muted" style={{ display: 'flex', gap: 10 }}>
          <span className="spinner" /> Loading…
        </div>
      )}
      {events && groups.length === 0 && <div className="card muted">No unlocks yet. Go earn something!</div>}
      <div style={{ display: 'grid', gap: 18 }}>
        {groups.map((g) => (
          <div key={g.label} className="enter">
            <div className="section-label" style={{ marginBottom: 8 }}>
              {g.label}
            </div>
            <div className="card" style={{ padding: 4 }}>
              {g.items.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onOpenGame(e.gameKey)}
                  className="row"
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10 }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    <AchIcon src={e.icon} size={44} tier={rarityTier(e.rarity)} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700 }}>{e.name}</div>
                      <div className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {e.gameName} · {VIA[e.via]}
                        {e.unlockedAt ? ` · ${new Date(e.unlockedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}
                      </div>
                    </div>
                  </div>
                  <RarityPill rarity={e.rarity} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {events && events.length >= limit && (
        <button className="btn" style={{ marginTop: 16 }} onClick={() => setLimit((l) => l + 150)}>
          Show more
        </button>
      )}
    </>
  );
}
