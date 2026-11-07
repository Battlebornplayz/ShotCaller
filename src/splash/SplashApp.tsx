import { useEffect, useState } from 'react';
import { Logo } from '../components/Logo';
import { PatchNotesBody } from '../components/PatchNotes';
import { TitleBar } from '../components/TitleBar';
import { useUpdateState } from '../hooks/useUpdateState';
import type { AppInfo, PatchNote, Settings, UpdateState } from '../../shared/types';

function shortError(message: string): string {
  return message.length > 140 ? `${message.slice(0, 140)}…` : message;
}

function StatusLine({ state }: { state: UpdateState }) {
  switch (state.status) {
    case 'checking':
      return (
        <div className="muted fade" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="spinner" /> Checking for updates…
        </div>
      );
    case 'up-to-date':
      return (
        <span className="pill green fade">✓ You're on the latest version</span>
      );
    case 'available':
      return (
        <span className="pill fade">Version {state.version} is available</span>
      );
    case 'downloading':
      return (
        <div className="fade" style={{ display: 'grid', gap: 6 }}>
          <div className="muted" style={{ fontSize: 12 }}>
            Downloading {state.version} · {state.percent}%
          </div>
          <div className="progress">
            <span style={{ width: `${state.percent}%` }} />
          </div>
        </div>
      );
    case 'downloaded':
      return (
        <span className="pill gold fade">Version {state.version} is ready — restart to apply</span>
      );
    case 'dev':
      return <span className="pill muted fade">Development build — updates are disabled</span>;
    case 'error':
      return (
        <span className="fade" style={{ color: 'var(--red)', fontSize: 12 }}>
          Couldn't check for updates: {shortError(state.message)}
        </span>
      );
    default:
      return null;
  }
}

export function SplashApp() {
  const update = useUpdateState();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [notes, setNotes] = useState<PatchNote[] | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    void window.shotcaller.getAppInfo().then(setInfo);
    void window.shotcaller.getSettings().then(setSettings);
    void window.shotcaller.getPatchNotes().then((result) => {
      if (result.ok) setNotes(result.notes);
      else setNotesError(result.error);
    });
  }, []);

  const updateAvailable = update.status === 'available';
  const downloading = update.status === 'downloading';
  const downloaded = update.status === 'downloaded';
  const channelLabel = settings?.channel === 'beta' ? 'Beta channel' : 'Stable';
  const current = notes?.[selected];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TitleBar canMaximize={false} />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Hero + actions */}
        <section
          className="enter"
          style={{
            width: 300,
            padding: '8px 26px 26px',
            display: 'flex',
            flexDirection: 'column',
            background:
              'radial-gradient(120% 80% at 0% 0%, rgba(79,140,255,0.22), transparent 60%), var(--sidebar)',
            borderRight: '1px solid var(--border)',
          }}
        >
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
            <Logo size={56} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.02em' }}>ShotCaller</div>
              <div className="muted" style={{ fontSize: 12 }}>
                Your game hub, every game
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
            <span className="pill">v{info?.version ?? '…'}</span>
            <span className="pill muted">{channelLabel}</span>
          </div>

          <div style={{ marginTop: 'auto', display: 'grid', gap: 12 }}>
            <div style={{ minHeight: 24 }}>
              <StatusLine state={update} />
            </div>

            {updateAvailable && (
              <button className="btn primary" style={{ padding: '14px 18px' }} onClick={() => void window.shotcaller.downloadUpdate()}>
                Update to latest version
              </button>
            )}

            {downloading && (
              <button className="btn" disabled>
                Downloading update…
              </button>
            )}

            {downloaded && (
              <button className="btn primary" style={{ padding: '14px 18px', animation: 'glow-pulse 2s infinite' }} onClick={() => void window.shotcaller.installUpdate()}>
                Restart to apply update
              </button>
            )}

            <button
              className={updateAvailable || downloading || downloaded ? 'btn' : 'btn primary big'}
              style={updateAvailable || downloading || downloaded ? undefined : { width: '100%' }}
              onClick={() => void window.shotcaller.enterApp()}
            >
              Play
            </button>

            {(update.status === 'up-to-date' || update.status === 'error' || update.status === 'available') && (
              <button className="muted" style={{ fontSize: 12, padding: 4 }} onClick={() => void window.shotcaller.checkForUpdates()}>
                Check again
              </button>
            )}
          </div>
        </section>

        {/* Patch notes */}
        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', padding: '8px 26px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Patch notes</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              from GitHub releases
            </span>
          </div>

          {notes && notes.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {notes.map((note, i) => (
                <button
                  key={note.version}
                  className={`pill ${i === selected ? '' : 'muted'}`}
                  style={{ cursor: 'pointer', border: i === selected ? '1px solid var(--accent)' : '1px solid transparent' }}
                  onClick={() => setSelected(i)}
                >
                  v{note.version}
                  {note.prerelease ? ' · beta' : ''}
                </button>
              ))}
            </div>
          )}

          <div
            className="card fade"
            key={current?.version ?? 'empty'}
            style={{ marginTop: 14, flex: 1, minHeight: 0, overflowY: 'auto', userSelect: 'text' }}
          >
            {!notes && !notesError && <div className="muted">Loading patch notes…</div>}
            {notesError && (
              <div className="muted">
                Patch notes unavailable right now. ({shortError(notesError)})
              </div>
            )}
            {notes && notes.length === 0 && <div className="muted">No releases published yet.</div>}
            {current && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{current.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {new Date(current.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <PatchNotesBody body={current.body} />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
