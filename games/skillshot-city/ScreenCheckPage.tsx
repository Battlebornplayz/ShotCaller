import { useEffect, useState, type CSSProperties } from 'react';
import type { ScreenPreview, ScreenRead, ScreenReadStatus, SkillshotData } from '../../shared/skillshot';
import { useScreenStatus } from '../../src/hooks/useLive';
import { SkillIcon, skillById } from './ui';

/**
 * Shows whether screen reading is working: a one-line status for the overlay, and a page with the picture it
 * sees and each read marked right or wrong against the game's log.
 */

const name = (data: SkillshotData | null, id: string | null) => (id && skillById(data, id)?.name) || id || '?';

/** How far each read has got against the log. */
export function tally(s: ScreenReadStatus) {
  const count = (...v: ScreenRead['verdict'][]) => s.reads.filter((r) => v.includes(r.verdict)).length;
  return { right: count('right'), wrong: count('pick-wrong', 'offer-wrong'), missed: count('missed'), waiting: count('waiting') };
}

const COLOR = { good: 'var(--green)', info: 'var(--accent)', warn: 'var(--gold)', bad: 'var(--red)', idle: 'var(--muted)' };
type Tone = keyof typeof COLOR;

/** The current state in plain words. `detail` says what to do about it, on the page only. */
function describe(s: ScreenReadStatus, data: SkillshotData | null): { tone: Tone; text: string; detail: string } {
  const last = s.reads.at(-1);
  switch (s.mode) {
    case 'off':
      return { tone: 'idle', text: 'Screen reading is off', detail: 'Turn it on in Settings to get advice without entering offers by hand.' };
    case 'no-game':
      return { tone: 'idle', text: 'Screen reading starts with the game', detail: 'Nothing to check until Skillshot City is running.' };
    case 'not-front':
      return { tone: 'warn', text: 'Paused: the game isn’t the front window', detail: 'It only looks while the game is in front. Click back into the game and this turns green.' };
    case 'no-picture':
      return { tone: 'bad', text: 'Can’t see the game’s picture', detail: 'The copy came back empty. Set the game to borderless or windowed: exclusive fullscreen can’t be copied.' };
    case 'offer':
      return {
        tone: 'info',
        text: `Read: ${last ? last.offers.map((id) => name(data, id)).join(' / ') : 'skill offer'}`,
        detail: 'An offer is on screen now, and the advice cards are using it.',
      };
    default:
      if (last?.picked && last.how !== 'log' && Date.now() - last.at < 60_000) {
        return { tone: 'good', text: `Saw you pick ${name(data, last.picked)}`, detail: 'Watching for your next offer.' };
      }
      return { tone: 'good', text: 'Watching for skill offers', detail: 'Working. The next level-up should show up here within a second.' };
  }
}

function Dot({ tone, pulse }: { tone: Tone; pulse?: boolean }) {
  return <span className={pulse ? 'ss-live-dot' : undefined} style={{ width: 8, height: 8, borderRadius: '50%', flex: 'none', background: COLOR[tone] }} />;
}

/** One line for the overlay, always visible, so you can see at a glance it's alive. */
export function ScreenStatusLine({ status, data }: { status: ScreenReadStatus | null; data: SkillshotData | null }) {
  if (!status) return null;
  const d = describe(status, data);
  const t = tally(status);
  const checked = t.right + t.wrong + t.missed;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, minWidth: 0 }}>
      <Dot tone={d.tone} pulse={status.mode === 'watching' || status.mode === 'offer'} />
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.text}>
        {d.text}
      </span>
      {checked > 0 && (
        <span style={{ flex: 'none', fontWeight: 700, color: t.right === checked ? 'var(--green)' : 'var(--gold)' }} title="Reads the game's log agreed with, out of those checked so far">
          {t.right}/{checked} right
        </span>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: Tone }) {
  return (
    <div className="tile" style={{ padding: '10px 12px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: tone && value > 0 ? COLOR[tone] : undefined }}>{value}</div>
      <div className="muted" style={{ fontSize: 11.5 }}>
        {label}
      </div>
    </div>
  );
}

const marker = (b: ScreenPreview['buildRow'], color: string): CSSProperties => ({
  position: 'absolute',
  left: `${b.x * 100}%`,
  top: `${b.y * 100}%`,
  width: `${b.width * 100}%`,
  height: `${b.height * 100}%`,
  border: `1px solid ${color}`,
  borderRadius: 4,
  pointerEvents: 'none',
});

/** What the reader is looking at right now. Only asks for pictures while this page is open. */
function LiveView() {
  const [view, setView] = useState<ScreenPreview | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => void window.shotcaller.getScreenPreview().then((v) => active && setView(v));
    load();
    const t = setInterval(load, 1000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  return (
    <section className="card enter">
      <div className="section-label">What ShotCaller sees right now</div>
      {view ? (
        <>
          <div style={{ position: 'relative', marginTop: 8, borderRadius: 6, overflow: 'hidden', aspectRatio: String(view.aspect) }}>
            <img src={view.image} alt="The strip of the game's picture being read" style={{ display: 'block', width: '100%', height: '100%' }} />
            {view.offers.map((b, i) => (
              <div key={i} style={marker(b, 'var(--accent)')} />
            ))}
            <div style={marker(view.buildRow, 'var(--gold)')} />
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>
            During a level-up, each <b style={{ color: 'var(--accent)' }}>blue box</b> should sit on a skill’s icon. Your build’s icons should be inside the{' '}
            <b style={{ color: 'var(--gold)' }}>gold box</b>. This updates once a second while the game is in front.
          </p>
        </>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>
          No picture yet. Start the game and click into it.
        </p>
      )}
    </section>
  );
}

const VERDICT: Record<ScreenRead['verdict'], { text: string; tone: Tone }> = {
  waiting: { text: 'Waiting for the log', tone: 'idle' },
  right: { text: '✓ Log agrees', tone: 'good' },
  'pick-wrong': { text: '✗ Wrong pick', tone: 'bad' },
  'offer-wrong': { text: '✗ Wrong skills', tone: 'bad' },
  missed: { text: '✗ Missed this one', tone: 'warn' },
  rerolled: { text: 'Rerolled', tone: 'idle' },
};

const HOW: Record<NonNullable<ScreenRead['how']>, string> = {
  'build row': 'seen in your build row',
  click: 'from your click',
  'not in build row': 'the new skill never appeared, so the upgrade',
  log: 'from the log',
};

function ReadRow({ r, data }: { r: ScreenRead; data: SkillshotData }) {
  const v = VERDICT[r.verdict];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12.5 }}>
      <span className="muted" style={{ width: 62, fontSize: 11 }}>
        {new Date(r.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
      </span>
      <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 240, flexWrap: 'wrap' }}>
        {r.offers.map((id, i) => (
          <span key={id} className="ss-chip" style={{ opacity: !r.picked || r.picked === id ? 1 : 0.55, boxShadow: r.picked === id ? 'inset 0 0 0 1px var(--accent)' : undefined }}>
            <SkillIcon skill={skillById(data, id)} size={18} />
            {name(data, id)}
            {r.scores[i] !== undefined && <span className="muted"> {Math.round(r.scores[i] * 100)}%</span>}
          </span>
        ))}
      </div>
      <span className="muted" style={{ fontSize: 11, flex: 1, minWidth: 130 }}>
        {r.logged
          ? `Log says: ${r.logged.offers.map((id) => name(data, id)).join(' / ')}, picked ${name(data, r.logged.picked)}`
          : r.how && r.picked
            ? `Pick ${HOW[r.how]}`
            : ''}
      </span>
      <b style={{ fontSize: 11.5, color: COLOR[v.tone], whiteSpace: 'nowrap' }}>{v.text}</b>
    </div>
  );
}

export function ScreenCheckPage({ data }: { data: SkillshotData }) {
  const status = useScreenStatus();
  if (!status) return <div className="card muted">Loading…</div>;
  const d = describe(status, data);
  const t = tally(status);
  const reads = [...status.reads].reverse();
  const measured = status.height === 0 || (status.width === 1920 && Math.abs(status.height - 1080) <= 1);
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card enter">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Dot tone={d.tone} pulse={status.mode === 'watching' || status.mode === 'offer'} />
          <b style={{ fontSize: 16 }}>{d.text}</b>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
          {d.detail}
        </p>
        {status.frames > 0 && (
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            {status.frames.toLocaleString()} pictures checked this session{status.width ? `, game picture ${status.width}×${status.height}` : ''}.
          </p>
        )}
        {!measured && (
          <p style={{ fontSize: 12, margin: '6px 0 0', color: 'var(--gold)' }}>
            The layout was only measured at 1920×1080, so offers may be missed at this size. Check the blue boxes below during a level-up.
          </p>
        )}
      </section>

      <LiveView />

      <section className="card enter">
        <div className="section-label">Checked against the game’s log</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginTop: 8 }}>
          <Stat label="Right" value={t.right} tone="good" />
          <Stat label="Wrong" value={t.wrong} tone="bad" />
          <Stat label="Missed" value={t.missed} tone="warn" />
          <Stat label="Waiting for the log" value={t.waiting} />
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '10px 0 0' }}>
          The game writes every skill choice to its log, so that’s the answer key. It can run about 2.5 minutes behind, and often catches up when a round ends or the game
          closes, so “waiting” is normal during a fight.
        </p>
        {reads.length ? (
          <div style={{ marginTop: 10 }}>
            {reads.map((r) => (
              <ReadRow key={r.id} r={r} data={data} />
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>
            No offers read yet this session. They’ll list here as you level up.
          </p>
        )}
      </section>
    </div>
  );
}
