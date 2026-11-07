import { useState } from 'react';
import { games } from '../../games';
import { Logo } from '../components/Logo';
import { TitleBar } from '../components/TitleBar';
import { GameRail } from './GameRail';
import { SectionNav, type Section, type SectionId } from './SectionNav';
import { HomePage, LibraryPage, ProfilePage, FriendsPage, GamePage, SettingsPage } from './pages';

export function ShellApp() {
  const [section, setSection] = useState<SectionId>('home');
  const [gameId, setGameId] = useState<string | null>(null);

  const game = games.find((g) => g.id === gameId) ?? null;

  const sections: Section[] = [
    { id: 'home', label: 'Home' },
    { id: 'library', label: 'Library' },
    { id: 'profile', label: 'Profile' },
    { id: 'friends', label: 'Friends' },
    { id: 'settings', label: 'Settings' },
  ];

  const onSelectSection = (id: SectionId) => {
    setGameId(null);
    setSection(id);
  };

  const onSelectGame = (id: string | null) => {
    if (id === null) {
      setGameId(null);
      setSection('home');
    } else {
      setGameId(id);
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
        <GameRail activeGameId={gameId} onSelectHome={() => onSelectGame(null)} onSelectGame={onSelectGame} />

        <SectionNav
          sections={game ? [] : sections}
          active={section}
          onSelect={onSelectSection}
          gameName={game?.name}
        />

        <main key={game ? `game-${game.id}` : section} className="enter" style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '26px 30px' }}>
          {game ? (
            <GamePage game={game} />
          ) : section === 'home' ? (
            <HomePage />
          ) : section === 'library' ? (
            <LibraryPage />
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
