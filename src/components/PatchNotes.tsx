import { Fragment, type ReactElement } from 'react';

/**
 * Tiny Markdown subset for release bodies: headings, bullets, paragraphs, bold.
 * Text is rendered as React text nodes, so nothing is injected as HTML.
 */
function renderInline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} style={{ color: 'var(--text)' }}>
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

export function PatchNotesBody({ body }: { body: string }) {
  const lines = body.replace(/\r/g, '').split('\n');
  const blocks: ReactElement[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} style={{ margin: '6px 0 10px', paddingLeft: 18 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {renderInline(b)}
            </li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (/^#{1,6}\s/.test(line)) {
      flush();
      blocks.push(
        <div key={`h-${blocks.length}`} style={{ fontWeight: 700, margin: '12px 0 4px', color: 'var(--text)' }}>
          {renderInline(line.replace(/^#{1,6}\s+/, ''))}
        </div>,
      );
    } else if (/^[-*]\s/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ''));
    } else {
      flush();
      blocks.push(
        <p key={`p-${blocks.length}`} style={{ margin: '4px 0' }}>
          {renderInline(line)}
        </p>,
      );
    }
  }
  flush();

  if (blocks.length === 0) {
    return <p className="muted">No patch notes for this release.</p>;
  }
  return <div style={{ color: 'var(--muted)' }}>{blocks}</div>;
}
