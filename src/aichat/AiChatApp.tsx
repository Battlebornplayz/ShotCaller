import { AiChatPanel } from '../components/AiChat';
import { TitleBar } from '../components/TitleBar';

/** The small Ask AI window for a second monitor (Phase D2). */
export function AiChatApp() {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TitleBar title="ShotCaller · Ask AI" canMaximize={false} />
      <div style={{ flex: 1, minHeight: 0, padding: '0 10px 10px' }}>
        <AiChatPanel compact />
      </div>
    </div>
  );
}
