import type { LibraryGame } from '../../shared/types';
import { ModuleIcon, ModuleView, liveModules, useModules } from './ModuleView';

/** Where AI modules show besides the Modules page (M-Q10): game pages, built-in add-ons and Home cards. */

/** On a game's page: modules for that game, and add-ons for its built-in module (M-Q7). */
export function GameModules({ game }: { game: LibraryGame }) {
  const state = useModules();
  const mods = liveModules(state).filter(
    (m) => m.doc.places.includes('page') && ((m.doc.game?.key && m.doc.game.key === game.key) || (game.moduleId && m.doc.addOnFor === game.moduleId)),
  );
  if (!mods.length) return null;
  return (
    <div style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
      {mods.map((m) => (
        <section key={m.doc.id} className="card enter" style={{ ['--tier' as string]: m.doc.color }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
            <ModuleIcon doc={m.doc} size={30} />
            <div style={{ fontWeight: 800, fontSize: 16 }}>{m.doc.name}</div>
            <span className="pill muted" style={{ marginLeft: 'auto' }}>
              Your module
            </span>
          </div>
          <ModuleView key={m.version} id={m.doc.id} doc={m.doc} />
        </section>
      ))}
    </div>
  );
}

/** Home cards. */
export function HomeModuleCards({ onOpenGame }: { onOpenGame: (key: string) => void }) {
  const state = useModules();
  const mods = liveModules(state).filter((m) => m.doc.places.includes('home'));
  return (
    <>
      {mods.map((m) => (
        <div key={m.doc.id} className="card enter" style={{ ['--tier' as string]: m.doc.color, display: 'grid', gap: 10, alignContent: 'start', gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ModuleIcon doc={m.doc} size={26} />
            <div style={{ fontWeight: 800, flex: 1, minWidth: 0 }}>{m.doc.name}</div>
            {m.doc.game?.key && (
              <button className="btn small" onClick={() => onOpenGame(m.doc.game!.key!)}>
                Open
              </button>
            )}
          </div>
          <ModuleView key={m.version} id={m.doc.id} doc={m.doc} as="home" />
        </div>
      ))}
    </>
  );
}

/** A banner on every page while the AI has a change waiting or a question (so Apply is never missed). */
export function ModulesBanner({ onOpen }: { onOpen: () => void }) {
  const state = useModules();
  const waiting = state?.proposals.filter((p) => !p.draft) ?? [];
  const asks = state?.questions ?? [];
  if (!waiting.length && !asks.length) return null;
  return (
    <div className="card enter" style={{ ['--tier' as string]: 'var(--accent)', display: 'flex', gap: 12, alignItems: 'center', padding: '10px 16px', marginBottom: 14 }}>
      <span className="dot-live" />
      <div style={{ flex: 1, fontSize: 14 }}>
        {asks.length ? `The AI asks: ${asks[0].question}` : waiting.length === 1 ? `The AI made a change to look at: ${waiting[0].summary}` : `The AI has ${waiting.length} changes for you to look at.`}
      </div>
      <button className="btn small primary" onClick={onOpen}>
        {asks.length ? 'Answer' : 'Look at it'}
      </button>
    </div>
  );
}
