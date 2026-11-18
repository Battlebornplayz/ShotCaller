import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { AI_INSTALL_HELP, AI_PROVIDER_NAMES, type AiChatMessage, type AiProvider } from '../../shared/ai';
import { useAiChat, useSettings } from '../hooks/useLive';

/**
 * The Ask AI chat panel (Phase D2): in the DbD hub and, compact, in the second-monitor window. The conversation
 * lives in the main process, so both show the same chat.
 */

const SUGGESTIONS: Record<string, string[]> = {
  'Dead by Daylight': [
    'What changed in DbD since I last played?',
    'Make me a survivor build against Nurse',
    'Which killer perks got buffed recently?',
  ],
  Fortnite: ['How did my last 10 matches go?', 'What’s in the item shop today?'],
  'Skillshot City': ['How are my recent matches going?', 'Which skills should I aim for?'],
  any: [
    'Which achievement am I closest to?',
    'What haven’t I played in a while?',
    'What changed in Dead by Daylight since I last played?',
  ],
};

export function AiInstallHelp({ provider, onCheck }: { provider: AiProvider; onCheck: () => void }) {
  const h = AI_INSTALL_HELP[provider];
  const [copied, setCopied] = useState(false);
  const small = { padding: '5px 12px', fontSize: 12.5 };
  return (
    <div className="tile" style={{ padding: '12px 14px', display: 'grid', gap: 8 }}>
      <div style={{ fontWeight: 600 }}>Install {AI_PROVIDER_NAMES[provider]}</div>
      <div className="muted" style={{ fontSize: 12.5 }}>
        Open PowerShell and paste this (the official installer):
      </div>
      <code
        style={{
          fontSize: 12,
          padding: '6px 8px',
          borderRadius: 6,
          background: 'rgba(0,0,0,.25)',
          userSelect: 'all',
          wordBreak: 'break-all',
        }}
      >
        {h.install}
      </code>
      <div className="muted" style={{ fontSize: 12.5 }}>
        {h.signIn}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          className="btn"
          style={small}
          onClick={() =>
            void navigator.clipboard.writeText(h.install).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="btn" style={small} onClick={() => void window.shotcaller.openExternal(h.page)}>
          Help page
        </button>
        <button className="btn" style={small} onClick={onCheck}>
          I’ve installed it
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// A little Markdown: paragraphs, "- " lists, numbered lists, **bold**, *italic*, `code`. Built as React
// elements (never HTML), so nothing the AI writes can run in the page.

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<b key={k++}>{t.slice(2, -2)}</b>);
    else if (t.startsWith('`')) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else out.push(<i key={k++}>{t.slice(1, -1)}</i>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length)
      blocks.push(
        <p key={blocks.length}>
          {para.map((l, i) => (
            <Fragment key={i}>
              {i > 0 && <br />}
              {inline(l)}
            </Fragment>
          ))}
        </p>,
      );
    para = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    }
    list = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^#{1,6}\s+/, '').trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || num) {
      flushPara();
      const ordered = !!num;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? num)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="ai-md">{blocks}</div>;
}

// ---------------------------------------------------------------------------------------------

function Message({ m, busyLast }: { m: AiChatMessage; busyLast: boolean }) {
  if (m.role === 'notice') return <div className="ai-notice">{m.text}</div>;
  if (m.role === 'user') return <div className="ai-msg ai-user">{m.text}</div>;
  return (
    <div className="ai-msg ai-bot">
      {!!m.tools?.length && (
        <div className="ai-tools">
          {m.tools.map((t) => (
            <span
              key={t.id}
              className={`ai-tool${t.error ? ' err' : ''}${t.done ? '' : ' running'}`}
              title={t.name}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
      {m.text ? <Markdown text={m.text} /> : busyLast ? <div className="ai-typing">Thinking…</div> : null}
    </div>
  );
}

export function AiChatPanel({
  compact = false,
  page,
  onOpenBuilds,
}: {
  compact?: boolean;
  /** Where the chat is ("Dead by Daylight", "Home"...): told to the AI and picks the suggestions. */
  page?: string;
  onOpenBuilds?: () => void;
}) {
  const chat = useAiChat();
  const settings = useSettings();
  const [draft, setDraft] = useState('');
  /** The install help was closed for this error. */
  const [installClosedFor, setInstallClosedFor] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const m = settings?.mcp;

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [chat?.messages]);

  if (!chat || !m) return <div className="card muted">Loading…</div>;

  if (!m.chat)
    return (
      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 650, fontSize: 16 }}>Ask AI</div>
        <div className="muted" style={{ fontSize: 13.5 }}>
          Ask about perks, killers and what changed, and have the AI make builds for you. Free: it uses Claude
          Code or Antigravity signed in on this PC, with no API key. It can only use ShotCaller’s tools.
        </div>
        <div>
          <button
            className="btn primary"
            onClick={() => void window.shotcaller.updateSettings({ mcp: { chat: true } })}
          >
            Turn on Ask AI
          </button>
        </div>
      </section>
    );

  const send = (text: string) => {
    const t = text.trim();
    if (!t || chat.busy) return;
    setDraft('');
    void window.shotcaller.sendAiChat(t, page);
  };
  const last = chat.messages[chat.messages.length - 1];
  const needsInstall = chat.fix === 'install' && installClosedFor !== chat.error;

  return (
    <section className={`card ai-chat${compact ? ' compact' : ''}`}>
      <div className="ai-head">
        <div style={{ fontWeight: 650 }}>Ask AI</div>
        <span className="pill muted" title="Change it in Settings → Ask AI">
          {AI_PROVIDER_NAMES[m.provider]}
        </span>
        {!m.allowActions && (
          <span
            className="pill gold"
            title="Turn on “Let the AI change things” in Settings → Ask AI to let it save builds"
          >
            Read only
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!compact && (
            <button
              className="btn"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => void window.shotcaller.showAiChatWindow()}
              title="Open this chat in its own small window (second monitor)"
            >
              Pop out
            </button>
          )}
          <button
            className="btn"
            style={{ padding: '4px 10px', fontSize: 12 }}
            disabled={!chat.messages.length}
            onClick={() => void window.shotcaller.resetAiChat()}
          >
            New chat
          </button>
        </div>
      </div>

      <div className="ai-log">
        {!chat.messages.length && (
          <div className="ai-empty">
            <div className="muted" style={{ fontSize: 13 }}>
              Try:
            </div>
            {(SUGGESTIONS[page ?? ''] ?? SUGGESTIONS.any).map((s) => (
              <button key={s} className="ai-suggest" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {chat.messages.map((msg) => (
          <Message key={msg.id} m={msg} busyLast={chat.busy && msg === last} />
        ))}
        {chat.changedBuilds.length > 0 && onOpenBuilds && !chat.busy && (
          <div className="ai-notice">
            {chat.changedBuilds.length === 1
              ? 'A build was saved'
              : `${chat.changedBuilds.length} builds were saved`}{' '}
            to your Builds.{' '}
            <button className="link" onClick={onOpenBuilds}>
              Open Builds
            </button>
          </div>
        )}
        <div ref={end} />
      </div>

      {chat.error && (
        <div className="ai-error">
          <div>{chat.error}</div>
          {chat.fix === 'sign-in' && (
            <button
              className="btn"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => void window.shotcaller.signInAi(m.provider)}
            >
              Sign in
            </button>
          )}
          {chat.fix === 'turn-on' && (
            <button
              className="btn"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => void window.shotcaller.updateSettings({ mcp: { chat: true } })}
            >
              Turn on
            </button>
          )}
        </div>
      )}
      {needsInstall && (
        <AiInstallHelp
          provider={m.provider}
          onCheck={() => void window.shotcaller.checkAiClis().then(() => setInstallClosedFor(chat.error))}
        />
      )}

      <div className="ai-input">
        <textarea
          rows={compact ? 2 : 2}
          value={draft}
          placeholder={chat.busy ? 'Working…' : 'Ask about your games…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
        />
        {chat.busy ? (
          <button className="btn" onClick={() => void window.shotcaller.stopAiChat()}>
            Stop
          </button>
        ) : (
          <button className="btn primary" disabled={!draft.trim()} onClick={() => send(draft)}>
            Send
          </button>
        )}
      </div>
    </section>
  );
}

/** "Ask AI" button on every game page: opens the chat in a panel at the side. Only while the chat is turned on. */
export function AiChatDrawer({ page }: { page: string }) {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  if (!settings?.mcp.chat) return null;
  return (
    <>
      {open && (
        <div className="ai-drawer">
          <AiChatPanel compact page={page} />
        </div>
      )}
      <button className="btn primary ai-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Close chat' : 'Ask AI'}
      </button>
    </>
  );
}
