import { useState, useCallback, useEffect } from 'react';
import { mdiBulletinBoard, mdiStar } from '@mdi/js';
import { useBBSStore } from './stores/bbs-store';
import { BoardTree } from './components/board-tree/BoardTree';
import { FavoriteTree } from './components/favorite-tree/FavoriteTree';
import { ThreadList } from './components/thread-list/ThreadList';
import { ThreadView } from './components/thread-view/ThreadView';
import { MdiIcon } from './components/common/MdiIcon';
import { type ThemeName, ThemeSelector, getStoredTheme, applyTheme } from './components/settings/ThemeSelector';

type LeftPaneTab = 'boards' | 'favorites';

export function App(): React.JSX.Element {
  const statusMessage = useBBSStore((s) => s.statusMessage);
  const [leftTab, setLeftTab] = useState<LeftPaneTab>('boards');
  const [theme, setTheme] = useState<ThemeName>(getStoredTheme);

  // Apply theme on mount and change
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleThemeChange = useCallback((newTheme: ThemeName) => {
    setTheme(newTheme);
  }, []);

  const switchToBoards = useCallback(() => { setLeftTab('boards'); }, []);
  const switchToFavorites = useCallback(() => { setLeftTab('favorites'); }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      {/* Main 3-pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left pane: Board Tree / Favorites */}
        <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--color-border-primary)]">
          {/* Left pane tabs */}
          <div className="flex h-8 shrink-0 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <button
              type="button"
              onClick={switchToBoards}
              className={`flex flex-1 items-center justify-center gap-1 text-xs ${
                leftTab === 'boards'
                  ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <MdiIcon path={mdiBulletinBoard} size={12} />
              板一覧
            </button>
            <button
              type="button"
              onClick={switchToFavorites}
              className={`flex flex-1 items-center justify-center gap-1 text-xs ${
                leftTab === 'favorites'
                  ? 'border-b-2 border-[var(--color-warning)] text-[var(--color-warning)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
              }`}
            >
              <MdiIcon path={mdiStar} size={12} />
              お気に入り
            </button>
          </div>
          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {leftTab === 'boards' ? <BoardTree /> : <FavoriteTree />}
          </div>
        </aside>

        {/* Center: Thread List */}
        <ThreadList />

        {/* Right: Thread View */}
        <ThreadView />
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4">
        <span className="text-xs text-[var(--color-text-muted)]">{statusMessage}</span>
        <ThemeSelector currentTheme={theme} onThemeChange={handleThemeChange} />
      </footer>
    </div>
  );
}
