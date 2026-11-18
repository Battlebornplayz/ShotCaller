import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BUILT_IN_NAMES,
  diffModules,
  MODULE_TEMPLATES,
  PERMISSION_TEXT,
  allBlocks,
  type AiLogEntry,
  type ImportPreview,
  type ModuleChange,
  type ModuleDoc,
  type ModuleProposal,
  type ModuleQuestion,
  type ModulePermissions,
  type StoredModule,
} from '../../shared/modules';
import { useLibrary, useSettings } from '../hooks/useLive';
import { PageHeader } from '../shell/pages';
import { toast } from '../shell/games/common';
import { ModuleIcon, ModuleView, SingleBlock, useModules } from './ModuleView';

/**
 * The Modules page (Phase M1): the player's AI-made modules, the changes the AI wants to make (look, then Apply),
 * history with restore, what each module may do, sharing, import, backups, safe mode and the AI's log.
 */

const api = () => window.shotcaller;
const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)} />;
}

function gameLabel(doc: ModuleDoc): string {
  if (doc.addOnFor) return `Add-on for ${BUILT_IN_NAMES[doc.addOnFor]}`;
  return doc.game?.name || 'Any game';
}

export function ModulesPage({ onAskAi }: { onAskAi: () => void }) {
  const state = useModules();
  const settings = useSettings();
  const [open, setOpen] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const aiOn = !!settings?.mcp.modules;

  if (!state) return <div className="muted">Loading…</div>;
  const opened = state.modules.find((m) => m.doc.id === open);
  const reviewing = state.proposals.find((p) => p.id === review);
  if (reviewing) return <ReviewChange p={reviewing} current={state.modules.find((m) => m.doc.id === reviewing.moduleId) ?? null} onClose={() => setReview(null)} />;
  if (opened) return <ModuleDetail m={opened} onBack={() => setOpen(null)} onAskAi={onAskAi} waiting={state.proposals.find((p) => p.moduleId === opened.doc.id) ?? null} onReview={setReview} />;

  const asking = state.proposals.filter((p) => !p.draft);
  const drafts = state.proposals.filter((p) => p.draft);
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 980 }}>
      <PageHeader
        title="Modules"
        subtitle="Your own pages for any game, made with the AI. Nothing changes until you click Apply."
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setImporting(true)}>
              Add from a friend
            </button>
          </div>
        }
      />

      {!aiOn && (
        <section className="card enter" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Let the AI make modules</div>
            <div className="muted" style={{ fontSize: 13 }}>
              Turn this on, then ask in the chat (or in Claude Code / Antigravity): “Make me a module for Elden Ring with boss tips and a checklist”. You see every change before it’s used.
            </div>
          </div>
          <button className="btn primary" onClick={() => void api().updateSettings({ mcp: { modules: true } })}>
            Turn on
          </button>
        </section>
      )}
      {aiOn && !state.modules.length && !state.proposals.length && (
        <section className="card enter" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Make your first module</div>
            <div className="muted" style={{ fontSize: 13 }}>Ask the AI: “Suggest a module for one of my games”. It looks at what you play and asks before it starts.</div>
          </div>
          <button className="btn primary" onClick={onAskAi}>
            Ask AI
          </button>
        </section>
      )}

      {state.safeMode && (
        <section className="card enter" style={{ ['--tier' as string]: 'var(--gold)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>Safe mode is on</div>
            <div className="muted" style={{ fontSize: 13 }}>Every AI module is off. Their files and your data are kept.</div>
          </div>
          <button className="btn" onClick={() => void api().setModulesSafeMode(false)}>
            Turn safe mode off
          </button>
        </section>
      )}

      {state.questions.map((q) => (
        <QuestionCard key={q.id} q={q} />
      ))}

      {asking.length > 0 && (
        <section style={{ display: 'grid', gap: 10 }}>
          <div className="section-label">Waiting for you</div>
          {asking.map((p) => (
            <ProposalCard key={p.id} p={p} current={state.modules.find((m) => m.doc.id === p.moduleId) ?? null} onReview={() => setReview(p.id)} />
          ))}
        </section>
      )}

      <section style={{ display: 'grid', gap: 10 }}>
        <div className="section-label">Your modules</div>
        {state.modules.length === 0 && <div className="muted" style={{ fontSize: 13 }}>None yet.</div>}
        {state.modules.map((m) => (
          <ModuleRow key={m.doc.id} m={m} safeMode={state.safeMode} onOpen={() => setOpen(m.doc.id)} onAskAi={onAskAi} />
        ))}
      </section>

      {drafts.length > 0 && (
        <section style={{ display: 'grid', gap: 10 }}>
          <div className="section-label">Drafts</div>
          {drafts.map((p) => (
            <ProposalCard key={p.id} p={p} current={state.modules.find((m) => m.doc.id === p.moduleId) ?? null} onReview={() => setReview(p.id)} />
          ))}
        </section>
      )}

      <TemplatePicker onMade={(id) => setOpen(id)} />
      <SafetyCard safeMode={state.safeMode} />
      <AiLogCard />
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The AI's questions (G2)

function QuestionCard({ q }: { q: ModuleQuestion }) {
  return (
    <section className="card enter" style={{ ['--tier' as string]: 'var(--accent)', display: 'grid', gap: 10 }}>
      <div className="section-label">The AI asks</div>
      <div style={{ fontWeight: 700 }}>{q.question}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {q.choices.map((c, i) => (
          <button key={c} className={`btn${i === 0 ? ' primary' : ''}`} onClick={() => void api().answerModuleQuestion(q.id, c)}>
            {c}
          </button>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Waiting changes

const KIND_TEXT: Record<ModuleProposal['kind'], string> = { create: 'New module', edit: 'Changes', restore: 'Go back to an older version', delete: 'Delete module' };

function ProposalCard({ p, current, onReview }: { p: ModuleProposal; current: StoredModule | null; onReview: () => void }) {
  const changes = useMemo(() => diffModules(p.kind === 'create' ? null : (current?.doc ?? null), p.doc), [p, current]);
  const errors = p.problems.filter((x) => x.level === 'error');
  const doc = p.doc ?? current?.doc;
  const apply = async () => {
    const r = await api().applyModuleChange(p.id);
    toast(r.ok ? `Applied: ${p.summary}` : r.error, r.ok ? 'info' : 'error');
  };
  return (
    <section className="card enter" style={{ ['--tier' as string]: errors.length ? 'var(--red)' : (doc?.color ?? 'var(--accent)'), display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {doc && <ModuleIcon doc={doc} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800 }}>
            {doc?.name ?? p.moduleId} <span className="pill muted">{KIND_TEXT[p.kind]}</span> {p.draft && <span className="pill gold">Draft</span>}
          </div>
          <div className="muted" style={{ fontSize: 13 }}>
            {p.summary} · {when(p.at)} · from {p.by === 'chat' ? 'the ShotCaller chat' : 'an AI app'}
          </div>
        </div>
        <button className="btn" onClick={onReview}>
          Look at it
        </button>
        <button className="btn primary" disabled={errors.length > 0} onClick={() => void apply()} title={errors.length ? 'Fix the mistakes first (ask the AI)' : undefined}>
          Apply
        </button>
        <button className="btn" onClick={() => void api().discardModuleChange(p.id)}>
          Discard
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {changes.slice(0, 12).map((c, i) => (
          <span key={i} className={`pill ${c.kind === 'added' ? 'green' : c.kind === 'removed' ? '' : 'gold'}`} style={c.kind === 'removed' ? { background: 'rgba(255,107,122,0.14)', color: 'var(--red)' } : undefined}>
            {c.kind === 'added' ? '+' : c.kind === 'removed' ? '−' : '~'} {c.label}
          </span>
        ))}
        {changes.length > 12 && <span className="pill muted">+{changes.length - 12} more</span>}
      </div>
      {errors.length > 0 && (
        <div style={{ color: 'var(--red)', fontSize: 13 }}>
          {errors.length} mistake{errors.length > 1 ? 's' : ''} to fix before it can be applied: {errors[0].where}: {errors[0].message} Ask the AI to fix it.
        </div>
      )}
    </section>
  );
}

/** Side-by-side review (A4): each changed piece before and after, and the whole module as it would look. */
function ReviewChange({ p, current, onClose }: { p: ModuleProposal; current: StoredModule | null; onClose: () => void }) {
  const before = p.kind === 'create' ? null : (current?.doc ?? null);
  const changes = useMemo(() => diffModules(before, p.doc), [before, p.doc]);
  const [whole, setWhole] = useState(p.kind === 'create');
  const errors = p.problems.filter((x) => x.level === 'error');
  const apply = async () => {
    const r = await api().applyModuleChange(p.id);
    toast(r.ok ? `Applied: ${p.summary}` : r.error, r.ok ? 'info' : 'error');
    if (r.ok) onClose();
  };
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 1180 }}>
      <PageHeader
        title={`${KIND_TEXT[p.kind]}: ${(p.doc ?? current?.doc)?.name ?? p.moduleId}`}
        subtitle={p.summary}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>
              ← Back
            </button>
            <button className="btn" onClick={() => (void api().discardModuleChange(p.id), onClose())}>
              Discard
            </button>
            <button className="btn primary" disabled={errors.length > 0} onClick={() => void apply()}>
              Apply
            </button>
          </div>
        }
      />
      {p.problems.length > 0 && (
        <section className="card" style={{ ['--tier' as string]: errors.length ? 'var(--red)' : 'var(--gold)', display: 'grid', gap: 4 }}>
          <div className="section-label">Mistake checker</div>
          {p.problems.map((x, i) => (
            <div key={i} style={{ fontSize: 13, color: x.level === 'error' ? 'var(--red)' : 'var(--gold)' }}>
              {x.level === 'error' ? 'Mistake' : 'Tip'} · {x.where}: {x.message}
            </div>
          ))}
        </section>
      )}
      {p.kind !== 'create' && p.doc && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn small${!whole ? ' primary' : ''}`} onClick={() => setWhole(false)}>
            Changed pieces
          </button>
          <button className={`btn small${whole ? ' primary' : ''}`} onClick={() => setWhole(true)}>
            Whole module after
          </button>
        </div>
      )}
      {p.kind === 'delete' ? (
        <section className="card" style={{ ['--tier' as string]: 'var(--red)' }}>
          The module goes to a bin folder in ShotCaller’s data, so it can be put back by hand. Your notes in it go with it.
        </section>
      ) : whole && p.doc ? (
        <section className="card" style={{ ['--tier' as string]: p.doc.color }}>
          <ModuleView id={p.moduleId} doc={p.doc} preview={{ storage: {}, running: false }} />
        </section>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {changes.map((c, i) => (
            <ChangeRow key={i} c={c} before={before} after={p.doc} id={p.moduleId} />
          ))}
          {!changes.length && <div className="muted">No differences.</div>}
        </div>
      )}
    </div>
  );
}

function ChangeRow({ c, before, after, id }: { c: ModuleChange; before: ModuleDoc | null; after: ModuleDoc | null; id: string }) {
  const side = (title: string, content: ReactNode) => (
    <div style={{ minWidth: 0 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
        {title}
      </div>
      {content}
    </div>
  );
  return (
    <section className={`card mod-diff-${c.kind}`} style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 700 }}>
        <span className={`pill ${c.kind === 'added' ? 'green' : c.kind === 'changed' ? 'gold' : ''}`}>{c.kind === 'added' ? 'New' : c.kind === 'removed' ? 'Removed' : 'Changed'}</span> {c.label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
        {c.blockId ? (
          <>
            {side('Before', before && c.kind !== 'added' ? <SingleBlock id={id} doc={before} blockId={c.blockId} /> : <div className="muted">—</div>)}
            {side('After', after && c.kind !== 'removed' ? <SingleBlock id={id} doc={after} blockId={c.blockId} /> : <div className="muted">—</div>)}
          </>
        ) : (
          <>
            {side('Before', <code className="mod-code" style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{c.before ?? '—'}</code>)}
            {side('After', <code className="mod-code" style={{ whiteSpace: 'pre-wrap', display: 'block' }}>{c.after ?? '—'}</code>)}
          </>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// The module list

function ModuleRow({ m, safeMode, onOpen, onAskAi }: { m: StoredModule; safeMode: boolean; onOpen: () => void; onAskAi: () => void }) {
  const fix = async () => {
    const r = await api().askAiToFixModule(m.doc.id);
    if (r.ok) onAskAi();
    else toast(r.error, 'error');
  };
  return (
    <section className="card enter" style={{ ['--tier' as string]: m.broken ? 'var(--red)' : m.doc.color, display: 'grid', gap: 8, opacity: safeMode ? 0.6 : 1 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <ModuleIcon doc={m.doc} />
        <button onClick={onOpen} style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: 0 }}>
          <div style={{ fontWeight: 800 }}>
            {m.doc.name} {m.doc.locked && <span className="pill muted">Locked</span>} {m.shared && <span className="pill muted">From {m.shared.author}</span>}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {gameLabel(m.doc)} · version {m.version} · {m.history.at(-1)?.summary ?? ''} · by {m.doc.author}
          </div>
        </button>
        <button className="btn small" onClick={onOpen}>
          Open
        </button>
        <Toggle label={`${m.doc.name} on`} checked={m.enabled} onChange={(v) => void api().setModuleEnabled(m.doc.id, v)} />
      </div>
      {m.broken && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--red)', flex: 1 }}>Turned off because it broke: {m.broken.error}</span>
          <button className="btn small primary" onClick={() => void fix()}>
            Ask AI to fix
          </button>
          <button className="btn small" onClick={() => void api().setModuleEnabled(m.doc.id, true)}>
            Try again
          </button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// One module: open it, options, history, permissions, sharing, errors, data

function ModuleDetail({ m, onBack, onAskAi, waiting, onReview }: { m: StoredModule; onBack: () => void; onAskAi: () => void; waiting: ModuleProposal | null; onReview: (id: string) => void }) {
  const [tab, setTab] = useState<'use' | 'history' | 'share' | 'can' | 'errors'>('use');
  return (
    <div style={{ display: 'grid', gap: 14, maxWidth: 1100 }}>
      <PageHeader
        title={m.doc.name}
        subtitle={`${gameLabel(m.doc)} · version ${m.version} · by ${m.doc.author}${m.doc.description ? ` · ${m.doc.description}` : ''}`}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn" onClick={onBack}>
              ← All modules
            </button>
            <Toggle label={`${m.doc.name} on`} checked={m.enabled} onChange={(v) => void api().setModuleEnabled(m.doc.id, v)} />
          </div>
        }
      />
      {waiting && (
        <section className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1 }}>The AI has a change waiting: {waiting.summary}</div>
          <button className="btn primary" onClick={() => onReview(waiting.id)}>
            Look at it
          </button>
        </section>
      )}
      <div className="mod-tabs" style={{ ['--tier' as string]: m.doc.color }}>
        {(
          [
            ['use', 'Module'],
            ['history', 'History'],
            ['can', 'What it can do'],
            ['share', 'Share'],
            ['errors', 'Errors and data'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'use' &&
        (m.broken ? (
          <section className="card" style={{ ['--tier' as string]: 'var(--red)', display: 'grid', gap: 8 }}>
            <div>It was turned off because it broke: {m.broken.error}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => void api().askAiToFixModule(m.doc.id).then((r) => (r.ok ? onAskAi() : toast(r.error, 'error')))}>
                Ask AI to fix
              </button>
              <button className="btn" onClick={() => void api().setModuleEnabled(m.doc.id, true)}>
                Try again
              </button>
            </div>
          </section>
        ) : (
          <section className="card" style={{ ['--tier' as string]: m.doc.color }}>
            <ModuleView key={m.version} id={m.doc.id} doc={m.doc} />
          </section>
        ))}
      {tab === 'history' && <HistoryTab m={m} />}
      {tab === 'can' && <PermissionsTab m={m} />}
      {tab === 'share' && <ShareTab m={m} />}
      {tab === 'errors' && <ErrorsTab m={m} onGone={onBack} />}
    </div>
  );
}

function HistoryTab({ m }: { m: StoredModule }) {
  const [look, setLook] = useState<{ v: number; doc: ModuleDoc } | null>(null);
  const restore = async (v: number) => {
    const r = await api().restoreModuleVersion(m.doc.id, v);
    toast(r.ok ? `Back to version ${v}` : r.error, r.ok ? 'info' : 'error');
    setLook(null);
  };
  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div className="section-label" style={{ flex: 1 }}>
          Every version
        </div>
        <button className="btn small" disabled={m.version < 2} onClick={() => void api().undoModule(m.doc.id).then((r) => toast(r.ok ? 'Undone' : r.error, r.ok ? 'info' : 'error'))}>
          Undo last change
        </button>
      </div>
      {[...m.history].reverse().map((h) => (
        <div key={h.version} className="tile" style={{ padding: '8px 12px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="pill muted">v{h.version}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{h.summary}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {when(h.at)} · {h.by === 'ai' ? 'by the AI' : h.by === 'you' ? 'by you' : h.by === 'import' ? 'from a share' : 'from a template'}
            </div>
          </div>
          {h.version === m.version ? (
            <span className="pill green">Now</span>
          ) : (
            <>
              <button className="btn small" onClick={() => void api().getModuleVersion(m.doc.id, h.version).then((doc) => doc && setLook({ v: h.version, doc }))}>
                Look
              </button>
              <button className="btn small" onClick={() => void restore(h.version)}>
                Restore
              </button>
            </>
          )}
        </div>
      ))}
      {look && (
        <div className="card" style={{ ['--tier' as string]: look.doc.color, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, flex: 1 }}>Version {look.v}</div>
            <button className="btn small primary" onClick={() => void restore(look.v)}>
              Restore this
            </button>
            <button className="btn small" style={{ marginLeft: 6 }} onClick={() => setLook(null)}>
              Close
            </button>
          </div>
          <ModuleView id={m.doc.id} doc={look.doc} preview={{ storage: {}, running: false }} />
        </div>
      )}
    </section>
  );
}

function PermissionsTab({ m }: { m: StoredModule }) {
  const set = (k: keyof ModulePermissions, v: boolean) => void api().setModulePermissions(m.doc.id, { [k]: v });
  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <div className="muted" style={{ fontSize: 13 }}>Turn off anything you don’t want it to do. Blocks that need it show a short note instead.</div>
      {(Object.keys(PERMISSION_TEXT) as (keyof ModulePermissions)[]).map((k) => (
        <div key={k} className="row">
          <div style={{ fontWeight: 600 }}>{PERMISSION_TEXT[k]}</div>
          <Toggle label={PERMISSION_TEXT[k]} checked={m.doc.permissions[k]} onChange={(v) => set(k, v)} />
        </div>
      ))}
      <div className="muted" style={{ fontSize: 12 }}>
        It shows: {m.doc.places.map((p) => (p === 'page' ? 'on its game page and here' : p === 'home' ? 'as a Home card' : 'on your second monitor while the game runs')).join(', ') || 'nowhere'}. AI modules can never read a game’s memory or change your files.
      </div>
    </section>
  );
}

function ShareTab({ m }: { m: StoredModule }) {
  const [locked, setLocked] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  if (m.doc.locked) return <section className="card muted">This module was shared with you locked, so it can’t be shared on.</section>;
  const copy = async () => {
    const r = await api().moduleShareCode(m.doc.id, locked);
    if (!r.ok) return toast(r.error, 'error');
    setCode(r.code);
    await navigator.clipboard.writeText(r.code);
    toast('Share code copied');
  };
  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <div className="muted" style={{ fontSize: 13 }}>
        Send it to a friend: they open Modules → Add from a friend, see what it does, and install it. If you share it again later, their copy updates and keeps their notes. Your name ({m.doc.author}) goes with it.
      </div>
      <div className="row">
        <div>
          <div style={{ fontWeight: 600 }}>Share locked</div>
          <div className="muted" style={{ fontSize: 12 }}>They can use it but not change it.</div>
        </div>
        <Toggle label="Share locked" checked={locked} onChange={setLocked} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn primary" onClick={() => void copy()}>
          Copy share code
        </button>
        <button className="btn" onClick={() => void api().moduleShareFile(m.doc.id, locked).then((r) => r.ok && toast('Saved'))}>
          Save as a file
        </button>
      </div>
      {code && <textarea readOnly value={code} rows={3} style={{ width: '100%', fontSize: 11 }} onFocus={(e) => e.target.select()} />}
    </section>
  );
}

function ErrorsTab({ m, onGone }: { m: StoredModule; onGone: () => void }) {
  const [errors, setErrors] = useState<{ at: number; error: string }[] | null>(null);
  const [assets, setAssets] = useState<{ name: string; bytes: number }[]>([]);
  const [confirm, setConfirm] = useState<'reset' | 'delete' | null>(null);
  useEffect(() => {
    void api().getModuleErrors(m.doc.id).then(setErrors);
    void api().getModuleAssets(m.doc.id).then(setAssets);
  }, [m.doc.id, m.version]);
  const blocks = allBlocks(m.doc).length;
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card" style={{ display: 'grid', gap: 6 }}>
        <div className="section-label">Error log</div>
        {errors?.length ? (
          errors.slice(0, 20).map((e, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              <span className="muted">{when(e.at)}</span> · {e.error}
            </div>
          ))
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>No errors.</div>
        )}
      </section>
      <section className="card" style={{ display: 'grid', gap: 10 }}>
        <div className="section-label">Data</div>
        <div className="muted" style={{ fontSize: 13 }}>
          {m.doc.pages.length} page{m.doc.pages.length === 1 ? '' : 's'}, {blocks} blocks, {assets.length} picture{assets.length === 1 ? '' : 's'} ({Math.round(assets.reduce((n, a) => n + a.bytes, 0) / 1000)} KB).
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {confirm === 'reset' ? (
            <>
              <span style={{ alignSelf: 'center', fontSize: 13 }}>Clear your ticks, notes and journal in it?</span>
              <button className="btn" onClick={() => (void api().resetModuleStorage(m.doc.id), setConfirm(null), toast('Data cleared'))} style={{ color: 'var(--red)' }}>
                Yes, clear
              </button>
              <button className="btn" onClick={() => setConfirm(null)}>
                Keep
              </button>
            </>
          ) : confirm === 'delete' ? (
            <>
              <span style={{ alignSelf: 'center', fontSize: 13 }}>Delete this module? It goes to a bin folder.</span>
              <button className="btn" onClick={() => (void api().deleteModule(m.doc.id), onGone())} style={{ color: 'var(--red)' }}>
                Yes, delete
              </button>
              <button className="btn" onClick={() => setConfirm(null)}>
                Keep
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setConfirm('reset')}>
                Reset its data
              </button>
              <button className="btn" onClick={() => setConfirm('delete')} style={{ color: 'var(--red)' }}>
                Delete module
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Templates, safety, AI log

function TemplatePicker({ onMade }: { onMade: (id: string) => void }) {
  const library = useLibrary();
  const [t, setT] = useState(MODULE_TEMPLATES[0].id);
  const [game, setGame] = useState('');
  const games = (library?.games ?? []).filter((g) => !g.hidden && !g.isTool).sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0));
  return (
    <section className="card" style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 700 }}>Start from a template</div>
      <div className="muted" style={{ fontSize: 13 }}>Make one yourself without the AI, then fill it in or ask the AI to.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {MODULE_TEMPLATES.map((x) => (
          <button key={x.id} className="tile" onClick={() => setT(x.id)} style={{ padding: '10px 12px', textAlign: 'left', borderColor: t === x.id ? 'var(--accent)' : undefined }}>
            <div style={{ fontWeight: 700 }}>{x.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{x.what}</div>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={game} onChange={(e) => setGame(e.target.value)} style={{ flex: 1 }}>
          <option value="">No game</option>
          {games.map((g) => (
            <option key={g.key} value={g.key}>
              {g.name}
            </option>
          ))}
        </select>
        <button className="btn primary" onClick={() => void api().createModuleFromTemplate(t, game || null).then((r) => (r.ok ? onMade(r.id) : toast(r.error, 'error')))}>
          Make it
        </button>
      </div>
    </section>
  );
}

function SafetyCard({ safeMode }: { safeMode: boolean }) {
  return (
    <section className="card" style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontWeight: 700 }}>Safety and backups</div>
      <div className="row">
        <div>
          <div style={{ fontWeight: 600 }}>Safe mode</div>
          <div className="muted" style={{ fontSize: 12 }}>Turns every AI module off at once (nothing is deleted). Use it if something looks wrong.</div>
        </div>
        <Toggle label="Safe mode" checked={safeMode} onChange={(v) => void api().setModulesSafeMode(v)} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => void api().backupModules().then((r) => r.ok && toast(`Backed up ${r.count} module${r.count === 1 ? '' : 's'}`))}>
          Back up all modules
        </button>
        <button className="btn" onClick={() => void api().restoreModulesBackup().then((r) => (r.ok ? toast(`Restored ${r.count}`) : r.error && toast(r.error, 'error')))}>
          Restore a backup
        </button>
      </div>
    </section>
  );
}

function AiLogCard() {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<AiLogEntry[]>([]);
  const state = useModules();
  useEffect(() => {
    if (open) void api().getModulesAiLog().then(setLog);
  }, [open, state]);
  return (
    <section className="card" style={{ display: 'grid', gap: 8 }}>
      <button onClick={() => setOpen((o) => !o)} style={{ textAlign: 'left', padding: 0, fontWeight: 700 }}>
        {open ? '▾' : '▸'} What the AI did
      </button>
      {open &&
        (log.length ? (
          log.slice(0, 60).map((e, i) => (
            <div key={i} style={{ fontSize: 13 }}>
              <span className="muted">{when(e.at)}</span> · {e.module ? <strong>{e.module}</strong> : null} {e.text} <span className="muted">({e.tool.replace('modules_', '')}, {e.by === 'chat' ? 'chat' : 'AI app'})</span>
            </div>
          ))
        ) : (
          <div className="muted" style={{ fontSize: 13 }}>Nothing yet.</div>
        ))}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Import: look first (M-Q16)

function ImportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const look = async (fromFile: boolean) => {
    setError(null);
    const r = await api().previewModuleImport(fromFile ? null : text);
    if (!r) return;
    if (!r.ok) setError(r.error);
    else setPreview(r);
  };
  const install = async (asCopy: boolean) => {
    if (!preview) return;
    const r = await api().installModuleImport(preview.token, asCopy);
    if (!r.ok) setError(r.error);
    else {
      toast(`Added ${preview.doc.name}`);
      onClose();
    }
  };
  const perms = preview ? (Object.keys(PERMISSION_TEXT) as (keyof ModulePermissions)[]).filter((k) => preview.doc.permissions[k]) : [];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,6,15,0.7)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ width: 'min(620px, 92vw)', display: 'grid', gap: 12, maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Add a module from a friend</div>
        {!preview ? (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the share code (starts with SCM1.)" rows={4} style={{ width: '100%' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" disabled={!text.trim()} onClick={() => void look(false)}>
                Look at it
              </button>
              <button className="btn" onClick={() => void look(true)}>
                Open a file
              </button>
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <ModuleIcon doc={preview.doc} />
              <div>
                <div style={{ fontWeight: 800 }}>{preview.doc.name}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  By {preview.author} · {gameLabel(preview.doc)} · their version {preview.sharedVersion}
                </div>
              </div>
            </div>
            {preview.doc.description && <div style={{ fontSize: 13 }}>{preview.doc.description}</div>}
            <div className="tile" style={{ padding: 12, display: 'grid', gap: 6 }}>
              <div className="section-label">What it can do</div>
              {perms.length ? perms.map((k) => <div key={k}>• {PERMISSION_TEXT[k]}</div>) : <div>• Nothing special: no internet, no access to your games or achievements.</div>}
              <div>
                • Shows {preview.doc.places.map((p) => (p === 'page' ? 'as a page' : p === 'home' ? 'on Home' : 'on your second monitor')).join(', ') || 'nowhere'}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {preview.doc.pages.length} page{preview.doc.pages.length === 1 ? '' : 's'}, {allBlocks(preview.doc).length} blocks, {preview.assets.length} picture{preview.assets.length === 1 ? '' : 's'} ({Math.round(preview.assets.reduce((n, a) => n + a.bytes, 0) / 1000)} KB).{' '}
                {preview.doc.locked ? 'Shared locked: you can use it but not change it.' : ''} Modules are pages only: they can’t run programs or touch your files.
              </div>
            </div>
            {preview.existing && (
              <div style={{ fontSize: 13, color: 'var(--gold)' }}>
                You already have “{preview.existing.name}” (your version {preview.existing.version}). Installing updates it and keeps your notes and ticks; or add it as a separate copy.
              </div>
            )}
            <section className="card" style={{ ['--tier' as string]: preview.doc.color, maxHeight: 320, overflowY: 'auto' }}>
              <ModuleView id={preview.doc.id} doc={preview.doc} preview={{ storage: {}, running: false }} />
            </section>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => void install(false)}>
                {preview.existing ? 'Update my copy' : 'Install'}
              </button>
              {preview.existing && (
                <button className="btn" onClick={() => void install(true)}>
                  Add as a copy
                </button>
              )}
              <button className="btn" style={{ marginLeft: 'auto' }} onClick={() => setPreview(null)}>
                Back
              </button>
            </div>
          </>
        )}
        {error && <div style={{ color: 'var(--red)', fontSize: 13 }}>{error}</div>}
      </div>
    </div>
  );
}
