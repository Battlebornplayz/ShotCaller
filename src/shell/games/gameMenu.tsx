import { useState } from 'react';
import type { GameCollection, LibraryGame } from '../../../shared/types';
import { PopMenu, TextPrompt, play, toast, type MenuItem } from './common';

const api = () => window.shotcaller;

/** Right-click menu for a game card: Play, favourite, collections, Hide, Tools. */
export function useGameMenu(collections: GameCollection[]) {
  const [menu, setMenu] = useState<{ x: number; y: number; game: LibraryGame } | null>(null);
  const [newFor, setNewFor] = useState<LibraryGame | null>(null);

  const open = (e: React.MouseEvent, game: LibraryGame) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, game });
  };

  const items = (g: LibraryGame): MenuItem[] => [
    g.installed ? { label: 'Play', onClick: () => void play(g) } : { label: 'Install', onClick: () => void api().installGame(g.key).then((r) => !r.ok && toast(r.error ?? '', 'error')) },
    { separator: true, label: '' },
    { label: g.pinned ? 'Remove from favourites' : 'Add to favourites', onClick: () => void api().setGamePinned(g.key, !g.pinned) },
    { heading: true, label: 'Collections' },
    ...collections.map((c) => {
      const inIt = c.keys.includes(g.key);
      return { label: c.name, checked: inIt, onClick: () => void api().collection({ op: 'set', id: c.id, key: g.key, inIt: !inIt }) };
    }),
    { label: 'New collection…', onClick: () => setNewFor(g) },
    { separator: true, label: '' },
    { label: g.isTool ? 'Move to games' : 'Move to Tools', onClick: () => void api().setGameTool(g.key, !g.isTool) },
    { label: g.hidden ? 'Show again' : 'Hide', onClick: () => void api().setGameHidden(g.key, !g.hidden) },
  ];

  const node = (
    <>
      {menu && <PopMenu x={menu.x} y={menu.y} items={items(menu.game)} onClose={() => setMenu(null)} />}
      {newFor && (
        <TextPrompt
          title="New collection"
          placeholder="e.g. Play with friends"
          okLabel="Create"
          onDone={(name) => {
            const g = newFor;
            setNewFor(null);
            if (name?.trim()) void api().collection({ op: 'create', name, addKey: g.key });
          }}
        />
      )}
    </>
  );
  return { open, node };
}
