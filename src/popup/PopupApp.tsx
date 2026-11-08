import { useEffect, useState } from 'react';
import type { PopupPayload, RarityTier } from '../../shared/types';
import { AchIcon, formatRarity, TIER_COLOR, TIER_LABEL } from '../components/achievements';
import { playUnlockSound } from './sounds';

/** The unlock card window: one card at a time, queued by the main process. */

const SHOW_MS: Record<RarityTier, number> = { common: 5000, uncommon: 5500, rare: 6000, epic: 7000, legendary: 8500 };
const EXIT_MS = 350;
const SPARKS: Record<RarityTier, number> = { common: 0, uncommon: 0, rare: 6, epic: 12, legendary: 22 };

function Sparks({ count }: { count: number }) {
  const [sparks] = useState(() =>
    Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 30 + Math.random() * 40;
      return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, delay: 0.25 + Math.random() * 0.5 };
    }),
  );
  return (
    <>
      {sparks.map((s, i) => (
        <span
          key={i}
          className="spark"
          style={{ left: 48, top: 50, ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px`, animationDelay: `${s.delay}s` }}
        />
      ))}
    </>
  );
}

export function PopupApp() {
  const [payload, setPayload] = useState<PopupPayload | null>(null);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    document.documentElement.classList.add('popup-window');
    return window.shotcaller.onPopup((p) => {
      setPayload(p);
      setPhase('in');
      setSeq((n) => n + 1);
    });
  }, []);

  useEffect(() => {
    if (!payload) return;
    if (payload.sound) {
      try {
        playUnlockSound(payload.tier, payload.volume);
      } catch {
        // no audio device
      }
    }
    const out = setTimeout(() => setPhase('out'), SHOW_MS[payload.tier]);
    const done = setTimeout(() => {
      setPayload(null);
      window.shotcaller.popupDone();
    }, SHOW_MS[payload.tier] + EXIT_MS);
    return () => {
      clearTimeout(out);
      clearTimeout(done);
    };
    // seq: replay for a repeated payload
  }, [payload, seq]);

  if (!payload) return null;
  const { event, tier, corner } = payload;
  const right = corner.endsWith('right');
  const bottom = corner.startsWith('bottom');
  const color = TIER_COLOR[tier];

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        justifyContent: right ? 'flex-end' : 'flex-start',
        alignItems: bottom ? 'flex-end' : 'flex-start',
        padding: 20,
      }}
    >
      <div
        key={seq}
        className={`unlock-card ${tier} ${phase}`}
        style={{ ['--tier' as string]: color, ['--from-x' as string]: right ? '60px' : '-60px' }}
      >
        <span className="bar" />
        <span className="shine" />
        <div className="icon">
          <AchIcon src={event.icon} size={64} tier={tier} />
        </div>
        <Sparks count={SPARKS[tier]} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color }}>
            {payload.test ? 'Test · ' : ''}
            {tier === 'common' ? 'Achievement unlocked' : `${TIER_LABEL[tier]} achievement`}
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {event.name}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {event.gameName}
            {event.rarity !== null && ` · ${formatRarity(event.rarity)} of players`}
          </div>
        </div>
      </div>
    </div>
  );
}
