import type { ReactNode } from 'react';

interface TitleBarProps {
  title?: ReactNode;
  showControls?: boolean;
  canMaximize?: boolean;
}

export function TitleBar({ title, showControls = true, canMaximize = true }: TitleBarProps) {
  return (
    <div className="drag-region" style={{ display: 'flex', alignItems: 'center', height: 36, paddingLeft: 12, flex: 'none' }}>
      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{title}</div>
      {showControls && (
        <div className="window-controls">
          <button aria-label="Minimize" onClick={() => void window.shotcaller.windowControl('minimize')}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
          {canMaximize && (
            <button aria-label="Maximize" onClick={() => void window.shotcaller.windowControl('maximize')}>
              <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.6" y="0.6" width="8.8" height="8.8" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
            </button>
          )}
          <button className="close" aria-label="Close" onClick={() => void window.shotcaller.windowControl('close')}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.2" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
