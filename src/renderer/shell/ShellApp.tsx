/**
 * Shell application — the main UI chrome.
 * Renders toolbar, left pane, board/thread tab bars, status bar.
 * Content areas (board tab content, thread tab content) are rendered by
 * separate WebContentsViews positioned over placeholder regions.
 */
import { lazy, Suspense, useState, useCallback, useEffect, useRef } from 'react';
import {
  mdiBulletinBoard,
  mdiStar,
  mdiMagnify,
  mdiRefresh,
  mdiAccountKey,
  mdiShieldLock,
  mdiSync,
  mdiLoading,
  mdiInformation,
  mdiClose,
  mdiCookie,
  mdiConsoleLine,
  mdiLinkPlus,
  mdiHistory,
  mdiGithub,
  mdiScriptText,
  mdiViewSequential,
} from '@mdi/js';
import { useShellStore } from './stores/shell-store';
import { BoardTree } from '../components/board-tree/BoardTree';
import { StatusConsole } from '../components/status-console/StatusConsole';
import { MdiIcon } from '../components/common/MdiIcon';
import { Modal } from '../components/common/Modal';
import { ResizeHandle } from '../components/common/ResizeHandle';
import {
  type ThemeName,
  ThemeSelector,
  getStoredTheme,
  applyTheme,
} from '../components/settings/ThemeSelector';
import { useDragReorder } from '../hooks/use-drag-reorder';
import { useTabOrientation } from '../hooks/use-tab-orientation';
import type { ContentBounds } from '@shared/view-ipc';
import { useBBSStore } from '../stores/bbs-store';

const FavoriteTree = lazy(() =>
  import('../components/favorite-tree/FavoriteTree').then((m) => ({ default: m.FavoriteTree })),
);
const SearchPanel = lazy(() =>
  import('../components/search/SearchPanel').then((m) => ({ default: m.SearchPanel })),
);
const HistoryPanel = lazy(() =>
  import('../components/history/HistoryPanel').then((m) => ({ default: m.HistoryPanel })),
);

const NgEditor = lazy(() =>
  import('../components/ng-editor/NgEditor').then((m) => ({ default: m.NgEditor })),
);
const AuthPanel = lazy(() =>
  import('../components/auth/AuthPanel').then((m) => ({ default: m.AuthPanel })),
);
const ProxySettings = lazy(() =>
  import('../components/settings/ProxySettings').then((m) => ({ default: m.ProxySettings })),
);
const RoundPanel = lazy(() =>
  import('../components/round/RoundPanel').then((m) => ({ default: m.RoundPanel })),
);
const CookieManager = lazy(() =>
  import('../components/settings/CookieManager').then((m) => ({ default: m.CookieManager })),
);
const ConsoleModal = lazy(() =>
  import('../components/console/ConsoleModal').then((m) => ({ default: m.ConsoleModal })),
);
const AddBoardDialog = lazy(() =>
  import('../components/board-tree/AddBoardDialog').then((m) => ({ default: m.AddBoardDialog })),
);
const UpdateDialog = lazy(() =>
  import('../components/update/UpdateDialog').then((m) => ({ default: m.UpdateDialog })),
);
const DslEditor = lazy(() =>
  import('../components/dsl-editor/DslEditor').then((m) => ({ default: m.DslEditor })),
);

type LeftPaneTab = 'boards' | 'favorites' | 'search' | 'history';
type ModalType =
  | 'auth'
  | 'proxy'
  | 'round'
  | 'ng'
  | 'about'
  | 'cookie-manager'
  | 'console'
  | 'add-board'
  | 'update'
  | 'dsl-editor'
  | null;

const LEFT_PANE_MIN = 160;
const LEFT_PANE_MAX = 500;
const LEFT_PANE_DEFAULT = 256;
const CENTER_PANE_MIN = 200;
const CENTER_PANE_DEFAULT = 400;
const STORAGE_KEY_LEFT = 'vbbb-left-pane-width';
const STORAGE_KEY_CENTER = 'vbbb-center-pane-width';
const _TOOLBAR_HEIGHT = 36;
const _BOARD_TAB_BAR_HEIGHT = 28;
const _THREAD_TAB_BAR_HEIGHT = 32;
const _STATUS_BAR_HEIGHT = 24;
const _RESIZE_HANDLE_WIDTH = 4;

function loadPaneWidth(key: string, defaultVal: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {
    /* ignore */
  }
  return defaultVal;
}

export function ShellApp(): React.JSX.Element {
  const statusMessage = useShellStore((s) => s.statusMessage);
  const menuLoading = useShellStore((s) => s.menuLoading);
  const fetchMenu = useShellStore((s) => s.fetchMenu);
  const fetchFavorites = useShellStore((s) => s.fetchFavorites);
  const fetchNgRules = useShellStore((s) => s.fetchNgRules);
  const loadPostHistory = useShellStore((s) => s.loadPostHistory);
  const relatedThreadSimilarity = useShellStore((s) => s.relatedThreadSimilarity);
  const setRelatedThreadSimilarity = useShellStore((s) => s.setRelatedThreadSimilarity);

  // Tab registry
  const boardTabs = useShellStore((s) => s.boardTabs);
  const activeBoardTabId = useShellStore((s) => s.activeBoardTabId);
  const threadTabs = useShellStore((s) => s.threadTabs);
  const activeThreadTabId = useShellStore((s) => s.activeThreadTabId);
  const setActiveBoardTab = useShellStore((s) => s.setActiveBoardTab);
  const closeBoardTab = useShellStore((s) => s.closeBoardTab);
  const setActiveTab = useShellStore((s) => s.setActiveTab);
  const closeTab = useShellStore((s) => s.closeTab);
  const reorderBoardTabs = useShellStore((s) => s.reorderBoardTabs);
  const reorderThreadTabs = useShellStore((s) => s.reorderThreadTabs);
  const updateTabRegistry = useShellStore((s) => s.updateTabRegistry);

  const [leftTab, setLeftTab] = useState<LeftPaneTab>('boards');
  const [theme, setTheme] = useState<ThemeName>(getStoredTheme);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [roundTimerEnabled, setRoundTimerEnabled] = useState(false);

  const [leftWidth, setLeftWidth] = useState(() =>
    loadPaneWidth(STORAGE_KEY_LEFT, LEFT_PANE_DEFAULT),
  );
  const [centerWidth, setCenterWidth] = useState(() =>
    loadPaneWidth(STORAGE_KEY_CENTER, CENTER_PANE_DEFAULT),
  );

  // Tab orientations
  const [_isVerticalBoardTabs, toggleBoardTabOrientation] = useTabOrientation(
    'vbbb-board-tab-orientation',
  );
  const [_isVerticalThreadTabs, toggleThreadTabOrientation] = useTabOrientation(
    'vbbb-thread-tab-orientation',
  );

  // Board tab drag reorder
  const { getDragProps: getBoardTabDragProps, dragSourceIndex: boardDragSourceIndex } =
    useDragReorder({ itemCount: boardTabs.length, onReorder: reorderBoardTabs });
  // Thread tab drag reorder
  const { getDragProps: getThreadTabDragProps, dragSourceIndex: threadDragSourceIndex } =
    useDragReorder({ itemCount: threadTabs.length, onReorder: reorderThreadTabs });

  // Refs for stale closure avoidance
  const setLeftTabRef = useRef(setLeftTab);
  const setActiveModalRef = useRef(setActiveModal);
  useEffect(() => {
    setLeftTabRef.current = setLeftTab;
  }, [setLeftTab]);
  useEffect(() => {
    setActiveModalRef.current = setActiveModal;
  }, [setActiveModal]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Report layout bounds to main process whenever pane sizes change
  const boardTabAreaRef = useRef<HTMLDivElement>(null);
  const threadTabAreaRef = useRef<HTMLDivElement>(null);

  const reportLayout = useCallback(() => {
    const boardEl = boardTabAreaRef.current;
    const threadEl = threadTabAreaRef.current;
    if (boardEl === null || threadEl === null) return;

    const boardRect = boardEl.getBoundingClientRect();
    const threadRect = threadEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio;

    const bounds: ContentBounds = {
      boardTabArea: {
        x: Math.round(boardRect.x * dpr),
        y: Math.round(boardRect.y * dpr),
        width: Math.round(boardRect.width * dpr),
        height: Math.round(boardRect.height * dpr),
      },
      threadTabArea: {
        x: Math.round(threadRect.x * dpr),
        y: Math.round(threadRect.y * dpr),
        width: Math.round(threadRect.width * dpr),
        height: Math.round(threadRect.height * dpr),
      },
    };
    void window.electronApi.invoke('view:layout-update', bounds);
  }, []);

  useEffect(() => {
    reportLayout();
  }, [leftWidth, centerWidth, reportLayout]);

  useEffect(() => {
    const observer = new ResizeObserver(reportLayout);
    if (boardTabAreaRef.current !== null) observer.observe(boardTabAreaRef.current);
    if (threadTabAreaRef.current !== null) observer.observe(threadTabAreaRef.current);
    return () => {
      observer.disconnect();
    };
  }, [reportLayout]);

  // Subscribe to tab registry updates from main
  useEffect(() => {
    const unsubscribe = window.electronApi.on('view:tab-registry-updated', (...args: unknown[]) => {
      const registry = args[0] as {
        boardTabs: readonly { id: string; title: string; boardUrl: string }[];
        activeBoardTabId: string | null;
        threadTabs: readonly {
          id: string;
          title: string;
          boardUrl: string;
          threadId: string;
        }[];
        activeThreadTabId: string | null;
      };
      updateTabRegistry(registry);
    });
    return unsubscribe;
  }, [updateTabRegistry]);

  // Patch useBBSStore so shared components (BoardTree, FavoriteTree, etc.)
  // route tab operations through IPC to the ViewManager.
  useEffect(() => {
    useBBSStore.setState({
      selectBoard: async (board) => {
        await window.electronApi.invoke(
          'view:create-board-tab',
          board.url,
          board.title,
          board.boardType,
        );
      },
      openThread: async (boardUrl, threadId, title) => {
        await window.electronApi.invoke('view:create-thread-tab', boardUrl, threadId, title);
      },
    } as Partial<ReturnType<typeof useBBSStore.getState>>);
  }, []);

  // Auto-initialize
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const api = window.electronApi;

    const init = async (): Promise<void> => {
      const [, , , , timerConfig] = await Promise.all([
        fetchMenu(),
        fetchFavorites(),
        fetchNgRules(),
        loadPostHistory(),
        api.invoke('round:get-timer'),
      ]);
      setRoundTimerEnabled(timerConfig.enabled);

      // Also initialize useBBSStore menu/favorites/ng for shared components
      void useBBSStore.getState().fetchMenu();
      void useBBSStore.getState().fetchFavorites();
      void useBBSStore.getState().fetchNgRules();

      // Load initial tab registry
      const registry = await api.invoke('view:get-tab-registry');
      updateTabRegistry(registry);
    };
    void init();
  }, [fetchMenu, fetchFavorites, fetchNgRules, loadPostHistory, updateTabRegistry]);

  // Subscribe to round:completed
  useEffect(() => {
    const unsubscribe = window.electronApi.on('round:completed', () => {
      // The board/thread tab views handle their own refresh
    });
    return unsubscribe;
  }, []);

  // Menu action long-poll
  useEffect(() => {
    if (typeof window.electronApi === 'undefined') return;

    const api = window.electronApi;
    let cancelled = false;

    const pollMenuAction = async (): Promise<void> => {
      while (!cancelled) {
        try {
          const action = await api.invoke('menu:wait-action');
          if (cancelled) break;

          switch (action.type) {
            case 'refresh-boards':
              void useShellStore.getState().fetchMenu();
              break;
            case 'switch-tab':
              if (
                action.tab === 'boards' ||
                action.tab === 'favorites' ||
                action.tab === 'search' ||
                action.tab === 'history'
              ) {
                setLeftTabRef.current(action.tab);
              }
              break;
            case 'open-modal':
              if (
                action.modal === 'auth' ||
                action.modal === 'proxy' ||
                action.modal === 'round' ||
                action.modal === 'ng' ||
                action.modal === 'about' ||
                action.modal === 'cookie-manager' ||
                action.modal === 'console' ||
                action.modal === 'update' ||
                action.modal === 'dsl-editor'
              ) {
                setActiveModalRef.current(action.modal);
              }
              break;
            case 'toggle-ng':
              setActiveModalRef.current((prev) => (prev === 'ng' ? null : 'ng'));
              break;
            case 'set-related-thread-similarity':
              useShellStore.getState().setRelatedThreadSimilarity(action.value);
              break;
          }
        } catch {
          if (!cancelled) {
            await new Promise<void>((r) => {
              setTimeout(r, 1000);
            });
          }
        }
      }
    };
    void pollMenuAction();
    return () => {
      cancelled = true;
    };
  }, []);

  // beforeunload — save tabs/session
  useEffect(() => {
    const handleBeforeUnload = (): void => {
      // Tab state is managed by main process now via ViewManager
      // Session state is saved by main process on window close
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const handleThemeChange = useCallback((newTheme: ThemeName) => {
    setTheme(newTheme);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);
  const closeRoundModal = useCallback(() => {
    setActiveModal(null);
    void window.electronApi.invoke('round:get-timer').then((cfg) => {
      setRoundTimerEnabled(cfg.enabled);
    });
  }, []);

  const handleRefreshBoards = useCallback(() => {
    void fetchMenu();
  }, [fetchMenu]);

  const openAuth = useCallback(() => {
    setActiveModal('auth');
  }, []);
  const openProxy = useCallback(() => {
    setActiveModal('proxy');
  }, []);
  const openRound = useCallback(() => {
    setActiveModal('round');
  }, []);
  const openCookieManager = useCallback(() => {
    setActiveModal('cookie-manager');
  }, []);
  const openConsole = useCallback(() => {
    setActiveModal('console');
  }, []);
  const openAbout = useCallback(() => {
    setActiveModal('about');
  }, []);
  const openAddBoard = useCallback(() => {
    setActiveModal('add-board');
  }, []);
  const openDslEditor = useCallback(() => {
    setActiveModal('dsl-editor');
  }, []);

  const handleLeftResize = useCallback((delta: number) => {
    setLeftWidth((w) => Math.max(LEFT_PANE_MIN, Math.min(LEFT_PANE_MAX, w + delta)));
  }, []);
  const handleLeftResizeEnd = useCallback(() => {
    setLeftWidth((w) => {
      localStorage.setItem(STORAGE_KEY_LEFT, String(w));
      return w;
    });
    reportLayout();
  }, [reportLayout]);
  const handleCenterResize = useCallback((delta: number) => {
    setCenterWidth((w) => Math.max(CENTER_PANE_MIN, w + delta));
  }, []);
  const handleCenterResizeEnd = useCallback(() => {
    setCenterWidth((w) => {
      localStorage.setItem(STORAGE_KEY_CENTER, String(w));
      return w;
    });
    reportLayout();
  }, [reportLayout]);

  const handleCloseBoardTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      closeBoardTab(tabId);
    },
    [closeBoardTab],
  );

  const handleCloseThreadTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      closeTab(tabId);
    },
    [closeTab],
  );

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      {/* Toolbar */}
      <header className="flex h-9 shrink-0 items-center gap-1 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2">
        <button
          type="button"
          onClick={handleRefreshBoards}
          disabled={menuLoading}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          title="板一覧を更新 (Ctrl+R)"
        >
          <MdiIcon
            path={menuLoading ? mdiLoading : mdiRefresh}
            size={14}
            className={menuLoading ? 'animate-spin' : ''}
          />
          板一覧更新
        </button>

        <button
          type="button"
          onClick={openAddBoard}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="外部掲示板を追加 (したらば/まちBBS)"
        >
          <MdiIcon path={mdiLinkPlus} size={14} />
          外部板追加
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        <button
          type="button"
          onClick={openAuth}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="認証設定"
        >
          <MdiIcon path={mdiAccountKey} size={14} />
          認証
        </button>
        <button
          type="button"
          onClick={openProxy}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="プロキシ設定"
        >
          <MdiIcon path={mdiShieldLock} size={14} />
          プロキシ
        </button>
        <button
          type="button"
          onClick={openRound}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${roundTimerEnabled ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'} hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]`}
          title={roundTimerEnabled ? '巡回リスト (自動巡回 ON)' : '巡回リスト'}
        >
          <MdiIcon path={mdiSync} size={14} />
          巡回{roundTimerEnabled ? ' ON' : ''}
        </button>
        <button
          type="button"
          onClick={openCookieManager}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="Cookie/UA管理"
        >
          <MdiIcon path={mdiCookie} size={14} />
          Cookie/UA
        </button>
        <button
          type="button"
          onClick={openConsole}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="診断コンソール"
        >
          <MdiIcon path={mdiConsoleLine} size={14} />
          コンソール
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        <button
          type="button"
          onClick={openDslEditor}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="DSLエディタ"
        >
          <MdiIcon path={mdiScriptText} size={14} />
          DSL
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        <label className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
          関連閾値
          <select
            value={String(relatedThreadSimilarity)}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (!Number.isFinite(value)) return;
              setRelatedThreadSimilarity(value);
            }}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1 py-0.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
            title="関連スレッド類似度の閾値 (%)"
          >
            {[40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map((v) => (
              <option key={v} value={String(v)}>
                {v}%
              </option>
            ))}
          </select>
        </label>

        <div className="flex-1" />

        <button
          type="button"
          onClick={openAbout}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="VBBBについて"
        >
          <MdiIcon path={mdiInformation} size={14} />
        </button>
      </header>

      {/* Main 3-pane layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left pane */}
        <aside className="flex h-full shrink-0 flex-col" style={{ width: leftWidth }}>
          <div className="flex h-8 shrink-0 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            {(['boards', 'favorites', 'search', 'history'] as const).map((tab) => {
              const icons = {
                boards: mdiBulletinBoard,
                favorites: mdiStar,
                search: mdiMagnify,
                history: mdiHistory,
              };
              const labels = {
                boards: '板一覧',
                favorites: 'お気に入り',
                search: '検索',
                history: '履歴',
              };
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setLeftTab(tab);
                  }}
                  className={`flex flex-1 items-center justify-center gap-1 text-xs ${
                    leftTab === tab
                      ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)]'
                      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                  }`}
                >
                  <MdiIcon path={icons[tab]} size={12} />
                  {labels[tab]}
                </button>
              );
            })}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {leftTab === 'boards' && <BoardTree />}
            {leftTab === 'favorites' && (
              <Suspense fallback={null}>
                <FavoriteTree />
              </Suspense>
            )}
            {leftTab === 'search' && (
              <Suspense fallback={null}>
                <SearchPanel />
              </Suspense>
            )}
            {leftTab === 'history' && (
              <Suspense fallback={null}>
                <HistoryPanel />
              </Suspense>
            )}
          </div>
          <StatusConsole />
        </aside>

        <ResizeHandle onResize={handleLeftResize} onResizeEnd={handleLeftResizeEnd} />

        {/* Center pane: Board tab bar + content placeholder */}
        <div className="flex shrink-0 flex-col" style={{ width: centerWidth }}>
          {/* Board tab bar */}
          {boardTabs.length > 0 && (
            <div className="flex h-7 items-center border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
              <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
                {boardTabs.map((bt, i) => (
                  <div
                    key={bt.id}
                    className={`group flex max-w-40 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs ${
                      bt.id === activeBoardTabId
                        ? 'bg-[var(--color-bg-active)] font-medium text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
                    } ${boardDragSourceIndex === i ? 'opacity-50' : ''}`}
                    onClick={() => {
                      setActiveBoardTab(bt.id);
                    }}
                    {...getBoardTabDragProps(i)}
                  >
                    <span className="truncate">{bt.title}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        handleCloseBoardTab(e, bt.id);
                      }}
                      className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 hover:bg-[var(--color-bg-tertiary)] group-hover:opacity-100"
                      aria-label="板タブを閉じる"
                    >
                      <MdiIcon path={mdiClose} size={9} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={toggleBoardTabOrientation}
                className="mr-1 shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                title="タブを縦に表示"
              >
                <MdiIcon path={mdiViewSequential} size={12} />
              </button>
            </div>
          )}
          {/* Board tab content placeholder — WebContentsView is positioned here */}
          <div ref={boardTabAreaRef} className="min-h-0 flex-1 bg-[var(--color-bg-primary)]" />
        </div>

        <ResizeHandle onResize={handleCenterResize} onResizeEnd={handleCenterResizeEnd} />

        {/* Right pane: Thread tab bar + content placeholder */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Thread tab bar */}
          <div className="flex h-8 items-center border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
            <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
              {threadTabs.map((tab, i) => (
                <div
                  key={tab.id}
                  className={`group flex max-w-48 cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs ${
                    tab.id === activeThreadTabId
                      ? 'bg-[var(--color-bg-active)] font-medium text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
                  } ${threadDragSourceIndex === i ? 'opacity-50' : ''}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                  }}
                  {...getThreadTabDragProps(i)}
                >
                  <span className="truncate">{tab.title}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      handleCloseThreadTab(e, tab.id);
                    }}
                    className="ml-0.5 shrink-0 rounded p-0.5 opacity-0 hover:bg-[var(--color-bg-tertiary)] group-hover:opacity-100"
                    aria-label="スレタブを閉じる"
                  >
                    <MdiIcon path={mdiClose} size={9} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleThreadTabOrientation}
              className="mr-1 shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              title="タブを縦に表示"
            >
              <MdiIcon path={mdiViewSequential} size={12} />
            </button>
          </div>
          {/* Thread tab content placeholder — WebContentsView is positioned here */}
          <div ref={threadTabAreaRef} className="min-h-0 flex-1 bg-[var(--color-bg-primary)]" />
        </div>
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-4">
        <span className="text-xs text-[var(--color-text-muted)]">{statusMessage}</span>
        <ThemeSelector currentTheme={theme} onThemeChange={handleThemeChange} />
      </footer>

      {/* Modals */}
      <Modal
        open={activeModal === 'auth'}
        onClose={closeModal}
        resizable
        initialWidth={500}
        initialHeight={400}
      >
        <Suspense fallback={null}>
          <AuthPanel onClose={closeModal} />
        </Suspense>
      </Modal>
      <Modal
        open={activeModal === 'proxy'}
        onClose={closeModal}
        resizable
        initialWidth={520}
        initialHeight={480}
      >
        <Suspense fallback={null}>
          <ProxySettings onClose={closeModal} />
        </Suspense>
      </Modal>
      <Modal open={activeModal === 'ng'} onClose={closeModal} width="max-w-2xl">
        <div className="max-h-[70vh] overflow-hidden rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <Suspense fallback={null}>
            <NgEditor onClose={closeModal} />
          </Suspense>
        </div>
      </Modal>
      <Modal
        open={activeModal === 'round'}
        onClose={closeRoundModal}
        resizable
        initialWidth={480}
        initialHeight={500}
      >
        <div className="h-full overflow-hidden rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <Suspense fallback={null}>
            <RoundPanel onClose={closeRoundModal} />
          </Suspense>
        </div>
      </Modal>
      <Modal
        open={activeModal === 'cookie-manager'}
        onClose={closeModal}
        resizable
        initialWidth={600}
        initialHeight={500}
      >
        <Suspense fallback={null}>
          <CookieManager onClose={closeModal} />
        </Suspense>
      </Modal>
      <Modal
        open={activeModal === 'console'}
        onClose={closeModal}
        resizable
        initialWidth={900}
        initialHeight={600}
      >
        <Suspense fallback={null}>
          <ConsoleModal onClose={closeModal} />
        </Suspense>
      </Modal>
      <Modal open={activeModal === 'add-board'} onClose={closeModal} width="max-w-lg">
        <Suspense fallback={null}>
          <AddBoardDialog onClose={closeModal} />
        </Suspense>
      </Modal>
      <Modal open={activeModal === 'update'} onClose={closeModal} width="max-w-sm">
        <Suspense fallback={null}>
          <UpdateDialog onClose={closeModal} />
        </Suspense>
      </Modal>
      <Modal
        open={activeModal === 'dsl-editor'}
        onClose={closeModal}
        resizable
        initialWidth={800}
        initialHeight={600}
      >
        <Suspense fallback={null}>
          <DslEditor onClose={closeModal} />
        </Suspense>
      </Modal>
      <Modal open={activeModal === 'about'} onClose={closeModal} width="max-w-sm">
        <div className="flex flex-col items-center gap-3 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] p-6">
          <MdiIcon path={mdiBulletinBoard} size={48} className="text-[var(--color-accent)]" />
          <h2 className="text-lg font-bold text-[var(--color-text-primary)]">VBBB</h2>
          <p className="text-center text-sm font-medium text-[var(--color-text-secondary)]">
            Versatile BBS Browser
          </p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">v{__APP_VERSION__}</p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            2ch/5ch互換BBSブラウザ
          </p>
          <p className="text-center text-xs text-[var(--color-text-muted)]">
            Electron + React + TypeScript
          </p>
          <button
            type="button"
            onClick={() => {
              void window.electronApi.invoke(
                'shell:open-external',
                'https://github.com/roflsunriz/VBBB',
              );
            }}
            className="flex items-center gap-1 rounded border border-[var(--color-border-primary)] px-3 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          >
            <MdiIcon path={mdiGithub} size={14} />
            https://github.com/roflsunriz/VBBB
          </button>
          <button
            type="button"
            onClick={closeModal}
            className="flex items-center gap-1 rounded bg-[var(--color-accent)] px-4 py-1.5 text-xs text-white hover:opacity-90"
          >
            <MdiIcon path={mdiClose} size={12} />
            閉じる
          </button>
        </div>
      </Modal>
    </div>
  );
}
