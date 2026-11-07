import { useState } from 'react';
import { useLibrary } from '../hooks/useLive';
import { Logo } from '../components/Logo';
import { TitleBar } from '../components/TitleBar';
import { GameRail } from './GameRail';
import { SectionNav, type Section, type SectionId } from './SectionNav';
import { HomePage, LibraryPage, ProfilePage, FriendsPage, GamePage, SettingsPage } from './pages';

export function ShellApp() {
  const [section, setSection] = useState<SectionId>('home');
  const [gameKey, setGameKey] = useState<string | null>(null);
  const library = useLibrary();

  const game = library?.games.find((g) => g.key === gameKey) ?? null;

  const sections: Section[] = [
    { id: 'home', label: 'Home' },
    { id: 'library', label: 'Library' },
    { id: 'profile', label: 'Profile' },
    { id: 'friends', label: 'Friends' },
    { id: 'settings', label: 'Settings' },
  ];

  const onSelectSection = (id: SectionId) => {
    setGameKey(null);
    setSection(id);
  };

  const onSelectGame = (key: string | null) => {
    if (key === null) {
      setGameKey(null);
      setSection('home');
    } else {
      setGameKey(key);
    }
  };

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
        <GameRail activeGameKey={gameKey} onSelectHome={() => onSelectGame(null)} onSelectGame={onSelectGame} />

        <SectionNav
          sections={game ? [] : sections}
          active={section}
          onSelect={onSelectSection}
          gameName={game?.name}
        />

        <main key={game ? `game-${game.key}` : section} className="enter" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '26px 30px' }}>
          {game ? (
            <GamePage game={game} />
          ) : section === 'home' ? (
            <HomePage onOpenGame={onSelectGame} />
          ) : section === 'library' ? (
            <LibraryPage onOpenGame={onSelectGame} />
          ) : section === 'profile' ? (
            <ProfilePage />
          ) : section === 'friends' ? (
            <FriendsPage />
          ) : (
            <SettingsPage />
          )}
        </main>
      </div>
    </div>
  );
}
