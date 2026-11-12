import { useEffect, useState, type ReactNode } from 'react';
import {
  DEFAULT_HOTKEYS,
  HOTKEY_ACTIONS,
  type AppInfo,
  type Channel,
  type DisplayInfo,
  type GameLaunchAction,
  type HotkeyAction,
  type McpInfo,
  type OverlayMode,
  type PopupCorner,
  type SettingsPatch,
  type UpdateState,
  RARITY_TIERS,
} from '../../shared/types';
import { TIER_COLOR, TIER_LABEL } from '../components/achievements';
import { acceleratorParts, HOTKEY_LABELS } from '../hotkeyLabels';
import { useHotkeyStatus, useLibrary, useOverlayState, useSettings } from '../hooks/useLive';
import { StoreList } from './games/GamesPage';
import { useUpdateState } from '../hooks/useUpdateState';
import { AccountSection, PrivacySection } from './AccountPage';
import { PageHeader } from './pages';

const update = (patch: SettingsPatch) => void window.shotcaller.updateSettings(patch);

// ---------- Small building blocks ----------

function Section({ title, subtitle, children, delay = 0 }: { title: string; subtitle: string; children: ReactNode; delay?: number }) {
  return (
    <section className="card enter" style={{ display: 'grid', gap: 16, maxWidth: 760, marginBottom: 14, animationDelay: `${delay}ms` }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {subtitle}
        </div>
      </div>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)} />;
}

function SettingRow({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="row">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {description && (
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {description}
          </div>
        )}
      </div>
      <div style={{ flex: 'none' }}>{children}</div>
    </div>
  );
}

function ChoiceCards<T extends string>({
  options,
  value,
  onPick,
  columns,
}: {
  options: { id: T; title: string; description: string }[];
  value: T | undefined;
  onPick: (v: T) => void;
  columns: number;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 10 }}>
      {options.map((o) => {
        const selected = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onPick(o.id)}
            aria-pressed={selected}
            style={{
              textAlign: 'left',
              padding: 14,
              borderRadius: 10,
              background: selected ? 'var(--accent-soft)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            }}
          >
            <div style={{ fontWeight: 700 }}>{o.title}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {o.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------- Overlay ----------

const MODES: { id: OverlayMode; title: string; description: string }[] = [
  { id: 'always', title: 'Always on', description: 'Corner overlay whenever a supported game runs.' },
  { id: 'popup', title: 'Hotkey popup', description: 'Hidden until you press the popup hotkey.' },
  { id: 'monitor', title: 'Second monitor', description: 'A normal window on another screen.' },
];

function OverlaySection() {
  const settings = useSettings();
  const overlay = useOverlayState();
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  useEffect(() => {
    void window.shotcaller.getDisplays().then(setDisplays);
  }, []);
  const o = settings?.overlay;

  return (
    <Section title="Overlay" subtitle="How ShotCaller shows up over your game.">
      <ChoiceCards options={MODES} value={o?.mode} onPick={(mode) => update({ overlay: { mode } })} columns={3} />

      {o?.mode === 'monitor' ? (
        <SettingRow title="Display" description={displays.length < 2 ? 'Only one display is connected, so the window opens on it.' : 'Where the overlay window opens.'}>
          <select
            value={o.monitorDisplayId ?? ''}
            onChange={(e) => update({ overlay: { monitorDisplayId: e.target.value === '' ? null : Number(e.target.value) } })}
          >
            <option value="">Automatic (first non-primary)</option>
            {displays.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label} · {d.width}×{d.height}
                {d.primary ? ' · primary' : ''}
              </option>
            ))}
          </select>
        </SettingRow>
      ) : (
        <>
          <div>
            <div className="row">
              <div>
                <div style={{ fontWeight: 600 }}>Idle opacity</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  How see-through the overlay is when you’re not holding Alt.
                </div>
              </div>
              <span className="pill">{Math.round((o?.idleOpacity ?? 0.7) * 100)}%</span>
            </div>
            <input
              type="range"
              min={30}
              max={100}
              step={5}
              value={Math.round((o?.idleOpacity ?? 0.7) * 100)}
              onChange={(e) => update({ overlay: { idleOpacity: Number(e.target.value) / 100 } })}
              style={{ marginTop: 10 }}
            />
          </div>
          <SettingRow
            title="Position"
            description={o?.position ? 'Moved by you. Hold Alt and drag the overlay’s header to move it.' : 'Top right of your main display. Hold Alt and drag its header to move it.'}
          >
            <button className="btn" onClick={() => update({ overlay: { position: null } })} disabled={!o?.position}>
              Reset position
            </button>
          </SettingRow>
        </>
      )}

      <SettingRow
        title="Read Skillshot City's skill offers from the screen"
        description="Copies a small strip at the top of the game's picture to recognize the 2 offered skills, offline. It doesn't touch the game. Off: enter offers by hand."
      >
        <Toggle
          label="Read Skillshot City's skill offers from the screen"
          checked={settings?.skillshot.screenReader ?? true}
          onChange={(v) => update({ skillshot: { screenReader: v } })}
        />
      </SettingRow>

      <SettingRow title="Show the overlay for every game" description="Off: only games with a ShotCaller module (Skillshot City) get the overlay.">
        <Toggle label="Show the overlay for every game" checked={!!o?.allGames} onChange={(v) => update({ overlay: { allGames: v } })} />
      </SettingRow>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="muted" style={{ fontSize: 12, maxWidth: 480 }}>
          The overlay is its own window, never injected into the game. It shows over <b>borderless</b> and <b>windowed</b> games; exclusive
          fullscreen hides it.
          {overlay && !overlay.altHook && o?.mode !== 'monitor' && (
            <div style={{ color: 'var(--gold)', marginTop: 6 }}>
              The Alt-key listener couldn’t start on this system, so the corner overlay stays clickable instead of click-through.
            </div>
          )}
        </div>
        <button className="btn primary" onClick={() => void window.shotcaller.setOverlayPreview(!overlay?.preview)}>
          {overlay?.preview ? 'Close preview' : 'Preview overlay'}
        </button>
      </div>
    </Section>
  );
}

// ---------- Hotkeys ----------

const CODE_KEYS: Record<string, string> = {
  Space: 'Space',
  Tab: 'Tab',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
  Enter: 'Return',
};

/** Keyboard event → Electron accelerator, or null if it's only modifiers / not allowed. */
function toAccelerator(e: KeyboardEvent): string | null {
  let key: string | null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Numpad\d$/.test(e.code)) key = `num${e.code.slice(6)}`;
  else if (/^F([1-9]|1\d|2[0-4])$/.test(e.code)) key = e.code;
  else key = CODE_KEYS[e.code] ?? null;
  if (!key) return null;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean) as string[];
  if (mods.length === 0 && !/^F\d+$/.test(key)) return null;
  return [...mods, key].join('+');
}

const STATUS_TEXT = {
  active: { text: 'Active', cls: 'pill green' },
  inactive: { text: 'Waiting for a game', cls: 'pill muted' },
  failed: { text: 'In use by another app', cls: 'pill gold' },
  unbound: { text: 'Unbound', cls: 'pill muted' },
} as const;

function HotkeysSection() {
  const settings = useSettings();
  const status = useHotkeyStatus();
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    void window.shotcaller.setHotkeyCapture(true);
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && !e.altKey && !e.ctrlKey && !e.shiftKey) {
        update({ hotkeys: { [recording]: '' } });
        setRecording(null);
        return;
      }
      const accel = toAccelerator(e);
      if (!accel) {
        if (!['Alt', 'Control', 'Shift', 'Meta'].includes(e.key)) setHint('Use a modifier (Alt, Ctrl, Shift) with the key, or a function key.');
        return;
      }
      update({ hotkeys: { [recording]: accel } });
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      void window.shotcaller.setHotkeyCapture(false);
      setHint(null);
    };
  }, [recording]);

  const isDefault = settings && HOTKEY_ACTIONS.every((a) => settings.hotkeys[a] === DEFAULT_HOTKEYS[a]);

  return (
    <Section title="Hotkeys" subtitle="Global shortcuts that work while you’re in game. Click one to rebind it." delay={60}>
      <div style={{ display: 'grid', gap: 10 }}>
        {HOTKEY_ACTIONS.map((action) => {
          const accel = settings?.hotkeys[action] ?? '';
          const st = status?.[action];
          const isRec = recording === action;
          return (
            <div key={action} className="row">
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{HOTKEY_LABELS[action].title}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {HOTKEY_LABELS[action].description}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                {st && !isRec && <span className={STATUS_TEXT[st].cls}>{STATUS_TEXT[st].text}</span>}
                <button className={`kbd${isRec ? ' recording' : ''}`} onClick={() => setRecording(isRec ? null : action)}>
                  {isRec ? 'Press keys…' : accel ? acceleratorParts(accel).join(' + ') : 'Not set'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {recording && (
        <div className="muted fade" style={{ fontSize: 12 }}>
          {hint ?? 'Press the new combination. Esc cancels, Backspace clears it.'}
        </div>
      )}
      <SettingRow title="Only while a game is running" description="Off: the hotkeys are always active, even outside games.">
        <Toggle label="Only while a game is running" checked={!!settings?.hotkeysOnlyInGame} onChange={(v) => update({ hotkeysOnlyInGame: v })} />
      </SettingRow>
      <div>
        <button className="btn" onClick={() => update({ hotkeys: DEFAULT_HOTKEYS })} disabled={!!isDefault}>
          Reset to defaults
        </button>
      </div>
    </Section>
  );
}

// ---------- Startup ----------

const LAUNCH_ACTIONS: { id: GameLaunchAction; label: string }[] = [
  { id: 'overlay', label: 'Show the overlay' },
  { id: 'window', label: 'Show the overlay and open ShotCaller' },
  { id: 'nothing', label: 'Do nothing (use the hotkey)' },
];

/** The Claude connection is parked and only partly tested (see HANDOFF.md), so its switch stays out of releases. */
const SHOW_CLAUDE_CONNECTION: boolean = false;

function ClaudeSection() {
  const settings = useSettings();
  const enabled = !!settings?.mcp.enabled;
  const [mcp, setMcp] = useState<McpInfo | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    // Starting the server takes a moment, and a port clash only shows up after that.
    const t = setTimeout(() => void window.shotcaller.getMcpInfo().then(setMcp), 400);
    return () => clearTimeout(t);
  }, [enabled]);
  const copy = () => {
    if (!mcp?.command) return;
    void navigator.clipboard.writeText(mcp.command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Section title="Claude connection" subtitle="Optional: lets Claude see your match data and coach you. ShotCaller works fully without it." delay={90}>
      <SettingRow
        title="Connect to Claude"
        description="Runs a small server that only this PC can reach, protected by a secret token. It shares ShotCaller’s data, including your match history, with the Claude app you connect. Claude’s replies use your Claude plan."
      >
        <Toggle label="Connect to Claude" checked={enabled} onChange={(v) => update({ mcp: { enabled: v } })} />
      </SettingRow>
      {enabled && (
        <>
          <SettingRow
            title="Let Claude show advice"
            description="Claude can put advice on your overlay, set your goal build and enter offers. Off: it can only read."
          >
            <Toggle label="Let Claude show advice" checked={!!settings?.mcp.allowActions} onChange={(v) => update({ mcp: { allowActions: v } })} />
          </SettingRow>
          {mcp?.error && <div style={{ fontSize: 13, color: 'var(--red)' }}>Couldn’t start: {mcp.error}</div>}
          {mcp?.running && (
            <div className="tile" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
              <div className="row">
                <div className="eyebrow">Set up Claude Code</div>
                <button className="btn" style={{ padding: '5px 12px', fontSize: 12.5 }} onClick={copy}>
                  {copied ? 'Copied' : 'Copy command'}
                </button>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                Run the command once in a terminal, then start a new Claude Code chat. Type <b style={{ color: 'var(--text)' }}>/mcp__shotcaller__coach</b> when you start a match. The command holds your secret token, so
                don’t share it.
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function StartupSection({ info }: { info: AppInfo | null }) {
  const settings = useSettings();
  const s = settings?.startup;
  return (
    <Section title="Startup" subtitle="Running in the background so ShotCaller is ready when you play." delay={120}>
      <SettingRow
        title="Start with your computer"
        description={info?.packaged === false ? 'Saved, but only applied in installed builds.' : 'Starts quietly in the tray; nothing opens until a game launches.'}
      >
        <Toggle label="Start with your computer" checked={!!s?.launchAtLogin} onChange={(v) => update({ startup: { launchAtLogin: v } })} />
      </SettingRow>
      <SettingRow title="When a supported game launches">
        <select value={s?.onGameLaunch ?? 'overlay'} onChange={(e) => update({ startup: { onGameLaunch: e.target.value as GameLaunchAction } })}>
          {LAUNCH_ACTIONS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </SettingRow>
      <SettingRow title="Keep running in the tray when closed" description="Off: closing the window quits ShotCaller and game detection stops.">
        <Toggle label="Keep running in the tray when closed" checked={!!s?.closeToTray} onChange={(v) => update({ startup: { closeToTray: v } })} />
      </SettingRow>
    </Section>
  );
}

// ---------- Updates ----------

const CHANNELS: { id: Channel; title: string; description: string }[] = [
  { id: 'stable', title: 'Stable', description: 'Tested releases only. Recommended for most people.' },
  { id: 'beta', title: 'Beta', description: 'Get new features early (GitHub pre-releases). Expect rough edges.' },
];

function UpdateStatus({ state, info }: { state: UpdateState; info: AppInfo | null }) {
  const text = (() => {
    switch (state.status) {
      case 'checking':
        return 'Checking for updates…';
      case 'up-to-date':
        return `You're on the latest version (v${state.version}).`;
      case 'available':
        return `Version ${state.version} is available.`;
      case 'downloading':
        return `Downloading ${state.version}… ${state.percent}%`;
      case 'downloaded':
        return `Version ${state.version} is ready to install. ShotCaller will restart.`;
      case 'dev':
        return 'Development build: updates are disabled.';
      case 'error':
        return `Couldn't check for updates: ${state.message}`;
      default:
        return info?.packaged === false ? 'Development build.' : '';
    }
  })();
  return (
    <div className="muted" style={{ fontSize: 13 }}>
      {text}
    </div>
  );
}

/** One button that follows the update: check, then download, then restart to install. */
function UpdateButton({ state }: { state: UpdateState }) {
  if (state.status === 'available') {
    return (
      <button className="btn primary" onClick={() => void window.shotcaller.downloadUpdate()}>
        Update to {state.version}
      </button>
    );
  }
  if (state.status === 'downloaded') {
    return (
      <button className="btn primary" onClick={() => void window.shotcaller.installUpdate()}>
        Restart and install
      </button>
    );
  }
  return (
    <button className="btn" onClick={() => void window.shotcaller.checkForUpdates()} disabled={state.status === 'checking' || state.status === 'downloading'}>
      {state.status === 'downloading' ? `Downloading… ${state.percent}%` : 'Check for updates'}
    </button>
  );
}

const CORNERS: { id: PopupCorner; label: string }[] = [
  { id: 'top-left', label: 'Top left' },
  { id: 'top-right', label: 'Top right' },
  { id: 'bottom-left', label: 'Bottom left' },
  { id: 'bottom-right', label: 'Bottom right' },
];

function PopupSection() {
  const settings = useSettings();
  const p = settings?.popups;
  return (
    <Section title="Unlock popups" subtitle="The card that slides in when you earn an achievement. Rarer unlocks get fancier cards and sounds.">
      <SettingRow title="Show unlock popups" description="Shows over borderless and windowed games.">
        <Toggle checked={p?.enabled ?? true} onChange={(enabled) => update({ popups: { enabled } })} label="Show unlock popups" />
      </SettingRow>
      <SettingRow title="Play a sound">
        <Toggle checked={p?.sound ?? true} onChange={(sound) => update({ popups: { sound } })} label="Play a sound" />
      </SettingRow>
      <div>
        <div className="row">
          <div style={{ fontWeight: 600 }}>Volume</div>
          <span className="pill">{Math.round((p?.volume ?? 0.6) * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round((p?.volume ?? 0.6) * 100)}
          disabled={!p?.sound}
          onChange={(e) => update({ popups: { volume: Number(e.target.value) / 100 } })}
          style={{ marginTop: 10 }}
        />
      </div>
      <SettingRow title="Corner" description="Where on your main display the card appears.">
        <select value={p?.corner ?? 'bottom-right'} onChange={(e) => update({ popups: { corner: e.target.value as PopupCorner } })}>
          {CORNERS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </SettingRow>
      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Try it</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {RARITY_TIERS.map((tier) => (
            <button key={tier} className="btn" onClick={() => void window.shotcaller.testPopup(tier)} style={{ color: TIER_COLOR[tier] }}>
              {TIER_LABEL[tier]}
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

/** Game stores the Games tab reads, plus the optional SteamGridDB key for missing art. */
function StoresSection() {
  const library = useLibrary();
  const [keySet, setKeySet] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  useEffect(() => {
    void window.shotcaller.getSteamGridKeySet().then(setKeySet);
  }, []);
  const saveKey = async (value: string | null) => {
    const r = await window.shotcaller.setSteamGridKey(value);
    if (r.ok) {
      setKey('');
      setKeySet(!!value);
      setMsg({ ok: true, text: value ? 'Key saved. Missing covers fill in over the next minute.' : 'Key removed.' });
    } else setMsg({ ok: false, text: r.error ?? 'That didn’t work.' });
  };
  return (
    <Section title="Game stores" subtitle="Where the Games tab finds your games. ShotCaller only reads the stores’ files; no sign-in, nothing changed.">
      {library ? <StoreList library={library} /> : <div className="muted">Reading your stores…</div>}
      <div className="row" style={{ gap: 8 }}>
        <button
          className="btn"
          disabled={scanning}
          onClick={async () => {
            setScanning(true);
            try {
              await window.shotcaller.importSteam();
            } finally {
              setScanning(false);
            }
          }}
        >
          {scanning ? <span className="spinner" /> : null} Look for games again
        </button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Cover art for games without any (optional)</div>
        <div className="muted" style={{ fontSize: 13 }}>
          Paste a free SteamGridDB API key (steamgriddb.com → Preferences → API). It’s stored encrypted on this PC only. Without it, those games get a clean title card.
        </div>
        {keySet ? (
          <div className="row" style={{ gap: 8 }}>
            <span className="pill green">Key saved</span>
            <button className="btn" onClick={() => void saveKey(null)}>
              Remove key
            </button>
          </div>
        ) : (
          <form
            className="row"
            style={{ gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              void saveKey(key);
            }}
          >
            <input type="password" placeholder="SteamGridDB API key" value={key} onChange={(e) => setKey(e.target.value)} style={{ width: 300 }} />
            <button className="btn" type="submit" disabled={!key.trim()}>
              Save key
            </button>
            <button className="btn" type="button" onClick={() => void window.shotcaller.openExternal('https://www.steamgriddb.com/profile/preferences/api')}>
              Get a key ↗
            </button>
          </form>
        )}
        {msg && (
          <div style={{ fontSize: 13, color: msg.ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>
        )}
      </div>
    </Section>
  );
}

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const settings = useSettings();
  const updateState = useUpdateState();

  useEffect(() => {
    void window.shotcaller.getAppInfo().then(setInfo);
  }, []);

  return (
    <>
      <PageHeader title="Settings" subtitle="Overlay, hotkeys, startup and updates. Changes save instantly." />

      <AccountSection />
      <StoresSection />
      <PopupSection />
      <OverlaySection />
      <HotkeysSection />
      {SHOW_CLAUDE_CONNECTION && <ClaudeSection />}
      <StartupSection info={info} />
      <PrivacySection delay={150} />

      <Section title="Update channel" subtitle="Which releases ShotCaller offers you." delay={180}>
        <ChoiceCards options={CHANNELS} value={settings?.channel} onPick={(channel) => update({ channel })} columns={2} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <UpdateStatus state={updateState} info={info} />
          <UpdateButton state={updateState} />
        </div>
      </Section>

      <section className="card enter" style={{ display: 'grid', gap: 6, maxWidth: 760, animationDelay: '240ms' }}>
        <div style={{ fontWeight: 700 }}>About</div>
        <div className="muted" style={{ fontSize: 13 }}>
          ShotCaller {info ? `v${info.version}` : ''} · MIT licensed · github.com/Battlebornplayz/ShotCaller
        </div>
      </section>
    </>
  );
}
