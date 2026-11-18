import { useCallback, useEffect, useRef, useState } from 'react';
import { useLibrary } from '../hooks/useLive';
import { Logo } from '../components/Logo';
import { TitleBar } from '../components/TitleBar';
import { GameRail } from './GameRail';
import { SectionNav, type Section, type SectionId } from './SectionNav';
import { HomePage, GamesPage, ProfilePage, FriendsPage, GamePage, SettingsPage, TimelinePage } from './pages';
import { AiChatDrawer, AiChatPanel } from '../components/AiChat';
import { PageHeader } from './pages';
import { CommandPalette } from './games/CommandPalette';
import { toast, Toasts } from './games/common';
import { ModulesPage } from '../modules/ModulesPage';
import { ModulesBanner } from '../modules/Placements';

export function ShellApp() {
  const [section, setSection] = useState<SectionId>('home');
  const [gameKey, setGameKey] = useState<string | null>(null);
  const library = useLibrary();

  const game = library?.games.find((g) => g.key === gameKey) ?? null;

  const sections: Section[] = [
    { id: 'home', label: 'Home' },
    { id: 'games', label: 'Games' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'profile', label: 'Profile' },
    { id: 'friends', label: 'Friends' },
    { id: 'ask', label: 'Ask AI' },
    { id: 'modules', label: 'Modules' },
    { id: 'settings', label: 'Settings' },
  ];

  const onSelectSection = useCallback((id: SectionId) => {
    setGameKey(null);
    setSection(id);
  }, []);

  const onSelectGame = useCallback((key: string | null) => {
    if (key === null) {
      setGameKey(null);
      setSection('home');
    } else {
      setGameKey(key);
    }
  }, []);

  // The tray's recent games can ask for a game page (e.g. when it couldn't start the game).
  useEffect(() => window.shotcaller.onQuickOpen((key) => onSelectGame(key)), [onSelectGame]);

  // "Added [game]" when a store installs something new while ShotCaller is open.
  const lastAdded = useRef<number | null>(null);
  useEffect(() => {
    const added = library?.justAdded;
    if (!added) return;
    if (lastAdded.current === null) {
      lastAdded.current = added.at; // already there when this window opened
      return;
    }
    if (added.at === lastAdded.current) return;
    lastAdded.current = added.at;
    const names = added.keys
      .map((k) => library.games.find((g) => g.key === k)?.name)
      .filter(Boolean) as string[];
    if (names.length)
      toast(
        names.length === 1
          ? `Added ${names[0]}`
          : `Added ${names.length} games: ${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`,
      );
  }, [library]);

  const isGames = !game && section === 'games';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TitleBar
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Logo size={18} /> ShotCaller
          </span>
        }
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <GameRail
          activeGameKey={gameKey}
          onSelectHome={() => onSelectGame(null)}
          onSelectGame={onSelectGame}
        />

        <SectionNav
          sections={game ? [] : sections}
          active={section}
          onSelect={onSelectSection}
          gameName={game?.name}
          onBack={() => setGameKey(null)}
          backLabel={sections.find((s) => s.id === section)?.label ?? 'Home'}
        />

        <main
          key={game ? `game-${game.key}` : section}
          className="enter"
          style={{ flex: 1, minWidth: 0, overflowY: isGames ? 'hidden' : 'auto', padding: '26px 30px' }}
        >
          {!(section === 'modules' && !game) && <ModulesBanner onOpen={() => onSelectSection('modules')} />}
          {game ? (
            <>
              <GamePage game={game} />
              {/* DbD has its own Ask AI tab. */}
              {game.moduleId !== 'dbd' && <AiChatDrawer page={game.name} />}
            </>
          ) : section === 'home' ? (
            <HomePage onOpenGame={onSelectGame} />
          ) : section === 'games' ? (
            <GamesPage onOpenGame={onSelectGame} />
          ) : section === 'timeline' ? (
            <TimelinePage onOpenGame={onSelectGame} />
          ) : section === 'profile' ? (
            <ProfilePage />
          ) : section === 'friends' ? (
            <FriendsPage />
          ) : section === 'ask' ? (
            <AskAiPage />
          ) : section === 'modules' ? (
            <ModulesPage onAskAi={() => onSelectSection('ask')} />
          ) : (
            <SettingsPage />
          )}
        </main>
      </div>

      <CommandPalette onOpenGame={onSelectGame} onSection={onSelectSection} />
      <Toasts />
    </div>
  );
}

function AskAiPage() {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <PageHeader
        title="Ask AI"
        subtitle="Ask about your games, achievements, Dead by Daylight and Fortnite. Uses the AI you picked in Settings."
      />
      <AiChatPanel page="Home" />
    </div>
  );
}
