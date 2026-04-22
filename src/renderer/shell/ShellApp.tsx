/**
 * Shell application — the main UI chrome.
 * Renders toolbar, left pane, board/thread tab bars, status bar.
 * Content areas (board tab content, thread tab content) are rendered by
 * separate WebContentsViews positioned over placeholder regions.
 */
import { lazy, Suspense, useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  mdiScriptText,
  mdiViewSequential,
} from '@mdi/js';
import { useShellStore } from './stores/shell-store';
import { BoardTree } from '../components/board-tree/BoardTree';
import { StatusConsole } from '../components/status-console/StatusConsole';
import { MdiIcon } from '../components/common/MdiIcon';
import { ResizeHandle } from '../components/common/ResizeHandle';
import {
  type ThemeName,
  ThemeSelector,
  getStoredTheme,
  applyTheme,
} from '../components/settings/ThemeSelector';
import { useDragReorder } from '../hooks/use-drag-reorder';
import { useTabOrientation } from '../hooks/use-tab-orientation';
import type { ContentBounds, ThreadTabMeta, BoardTabMeta, ModalWindowType } from '@shared/view-ipc';
import type { FavItem, FavNode } from '@shared/favorite';
import type { NativeContextMenuItem } from '@shared/ipc';
import type { RoundItemEntry, RoundBoardEntry } from '@shared/round';
import { BoardType } from '@shared/domain';
import { buildResPermalink, detectBoardTypeByHost } from '@shared/url-parser';
import { boundedLevenshtein } from '../utils/levenshtein';
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

type LeftPaneTab = 'boards' | 'favorites' | 'search' | 'history';

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
  const favorites = useShellStore((s) => s.favorites);
  const addFavorite = useShellStore((s) => s.addFavorite);
  const removeFavorite = useShellStore((s) => s.removeFavorite);

  const [leftTab, setLeftTab] = useState<LeftPaneTab>('boards');
  const [theme, setTheme] = useState<ThemeName>(getStoredTheme);
  const [roundTimerEnabled, setRoundTimerEnabled] = useState(false);

  const [leftWidth, setLeftWidth] = useState(() =>
    loadPaneWidth(STORAGE_KEY_LEFT, LEFT_PANE_DEFAULT),
  );
  const [centerWidth, setCenterWidth] = useState(() =>
    loadPaneWidth(STORAGE_KEY_CENTER, CENTER_PANE_DEFAULT),
  );

  // Tab orientations
  const [isVerticalBoardTabs, toggleBoardTabOrientation] = useTabOrientation(
    'vbbb-board-tab-orientation',
  );
  const [isVerticalThreadTabs, toggleThreadTabOrientation] = useTabOrientation(
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
  useEffect(() => {
    setLeftTabRef.current = setLeftTab;
  }, [setLeftTab]);

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
      const [menuResult, favResult, ngResult, , timerConfig] = await Promise.all([
        fetchMenu(),
        fetchFavorites(),
        fetchNgRules(),
        loadPostHistory(),
        api.invoke('round:get-timer'),
      ]);
      setRoundTimerEnabled(timerConfig.enabled);

      // Inject fetched data directly into bbs-store for shared components (no second IPC call)
      const bbsUpdate: Record<string, unknown> = { menuLoading: false };
      if (menuResult !== null && menuResult.categories.length > 0) {
        bbsUpdate['menu'] = menuResult;
      }
      if (favResult !== null) {
        bbsUpdate['favorites'] = favResult;
      }
      if (ngResult !== null) {
        bbsUpdate['ngRules'] = ngResult;
      }
      useBBSStore.setState(bbsUpdate);

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
            case 'refresh-boards': {
              const menu = await useShellStore.getState().fetchMenu();
              if (menu !== null && menu.categories.length > 0) {
                useBBSStore.setState({ menu, menuLoading: false });
              }
              break;
            }
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
              void api.invoke('modal:open', action.modal as ModalWindowType);
              break;
            case 'toggle-ng':
              void api.invoke('modal:open', 'ng');
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

  const handleRefreshBoards = useCallback(() => {
    void fetchMenu().then((menu) => {
      if (menu !== null && menu.categories.length > 0) {
        useBBSStore.setState({ menu, menuLoading: false });
      }
    });
  }, [fetchMenu]);

  const openModal = useCallback((type: ModalWindowType) => {
    void window.electronApi.invoke('modal:open', type);
  }, []);

  // Listen for modal:closed push events
  useEffect(() => {
    const unsubscribe = window.electronApi.on('modal:closed', (...args: unknown[]) => {
      const data = args[0] as { modalType: ModalWindowType };
      if (data.modalType === 'round') {
        void window.electronApi.invoke('round:get-timer').then((cfg) => {
          setRoundTimerEnabled(cfg.enabled);
        });
      }
    });
    return unsubscribe;
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

  // ---- Thread tab context menu (native) ----
  const favoriteUrlToId = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (nodes: readonly FavNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'item' && node.type === 'thread') {
          map.set(node.url, node.id);
        }
        if (node.kind === 'folder') {
          walk(node.children);
        }
      }
    };
    walk(favorites.children);
    return map;
  }, [favorites]);

  const handleThreadTabContextMenu = useCallback(
    (e: React.MouseEvent, tab: ThreadTabMeta) => {
      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        const api = window.electronApi;
        const threadUrl = `${tab.boardUrl}dat/${tab.threadId}.dat`;
        const threadPageUrl = buildResPermalink(tab.boardUrl, tab.threadId, 1).replace(/1$/, '');

        let isRoundItem = false;
        try {
          const roundItems = await api.invoke('round:get-items');
          const fileName = `${tab.threadId}.dat`;
          isRoundItem = roundItems.some(
            (item: RoundItemEntry) => item.url === tab.boardUrl && item.fileName === fileName,
          );
        } catch {
          /* ignore */
        }

        const isFavorite = favoriteUrlToId.has(threadUrl);

        const relatedItems: NativeContextMenuItem[] = [];
        const relatedTitleById = new Map<string, string>();
        try {
          const threshold = relatedThreadSimilarity / 100;
          const result = await api.invoke('bbs:fetch-subject', tab.boardUrl);
          const currentFileName = `${tab.threadId}.dat`;
          const baseTitle = tab.title.toLowerCase().replace(/\s+/g, '').replace(/★+/g, '');
          if (baseTitle.length > 0) {
            const matches: { threadId: string; title: string; similarity: number }[] = [];
            for (const s of result.threads) {
              if (s.fileName === currentFileName) continue;
              const normalized = s.title.toLowerCase().replace(/\s+/g, '').replace(/★+/g, '');
              if (normalized.length === 0) continue;
              const maxLen = Math.max(baseTitle.length, normalized.length);
              const maxDist = Math.floor(maxLen * (1 - threshold));
              const dist = boundedLevenshtein(baseTitle, normalized, maxDist);
              if (dist !== null) {
                const sim = 1 - dist / maxLen;
                if (sim >= threshold) {
                  matches.push({
                    threadId: s.fileName.replace('.dat', ''),
                    title: s.title,
                    similarity: sim,
                  });
                }
              }
            }
            matches.sort((a, b) => b.similarity - a.similarity);
            for (const m of matches.slice(0, 12)) {
              const actionId = `related:${m.threadId}`;
              relatedTitleById.set(actionId, m.title);
              relatedItems.push({
                id: actionId,
                label: `${m.title} (${String(Math.round(m.similarity * 100))}%)`,
              });
            }
          }
        } catch {
          /* ignore */
        }
        if (relatedItems.length === 0) {
          relatedItems.push({ id: 'related:none', label: '関連スレッドなし', enabled: false });
        }

        const items: NativeContextMenuItem[] = [
          { id: 'refresh', label: '更新' },
          { id: 'toggle-round', label: isRoundItem ? '巡回から削除' : '巡回に追加' },
          {
            id: 'copy',
            label: 'コピー',
            submenu: [
              { id: 'copy-url', label: 'スレッドのURLをコピー' },
              { id: 'copy-title-url', label: 'タイトル+URLをコピー' },
            ],
          },
          { id: 'related', label: '関連スレッド', submenu: relatedItems },
          { id: 'open-external', label: '外部ブラウザで開く' },
          { id: 'sep', label: '', type: 'separator' },
          { id: 'toggle-fav', label: isFavorite ? 'お気に入りから削除' : 'お気に入りに追加' },
        ];

        const action = await api.invoke('shell:popup-context-menu', items);
        if (action === null) return;

        switch (action) {
          case 'refresh':
            setActiveTab(tab.id);
            void api.invoke('view:switch-thread-tab', tab.id);
            break;
          case 'toggle-round': {
            const fileName = `${tab.threadId}.dat`;
            if (isRoundItem) {
              void api.invoke('round:remove-item', tab.boardUrl, fileName);
            } else {
              void api.invoke('round:add-item', {
                url: tab.boardUrl,
                boardTitle: '',
                fileName,
                threadTitle: tab.title,
                roundName: '',
              } satisfies RoundItemEntry);
            }
            break;
          }
          case 'copy-url':
            void navigator.clipboard.writeText(threadPageUrl);
            break;
          case 'copy-title-url':
            void navigator.clipboard.writeText(`${tab.title}\n${threadPageUrl}`);
            break;
          case 'open-external':
            void api.invoke('shell:open-external', threadPageUrl);
            break;
          case 'toggle-fav': {
            const existingFavId = favoriteUrlToId.get(threadUrl);
            if (existingFavId !== undefined) {
              void removeFavorite(existingFavId);
            } else {
              let boardType: BoardType;
              try {
                boardType = detectBoardTypeByHost(new URL(tab.boardUrl).hostname);
              } catch {
                boardType = BoardType.Type2ch;
              }
              void addFavorite({
                id: `fav-${tab.threadId}-${String(Date.now())}`,
                kind: 'item',
                type: 'thread',
                boardType,
                url: threadUrl,
                title: tab.title,
              } satisfies FavItem);
            }
            break;
          }
          default:
            if (action.startsWith('related:')) {
              const relThreadId = action.slice('related:'.length);
              const relTitle = relatedTitleById.get(action) ?? '';
              void api.invoke('view:create-thread-tab', tab.boardUrl, relThreadId, relTitle);
            }
        }
      })();
    },
    [favoriteUrlToId, relatedThreadSimilarity, setActiveTab, addFavorite, removeFavorite],
  );

  // ---- Board tab context menu (native) ----
  const handleBoardTabContextMenu = useCallback(
    (e: React.MouseEvent, tab: BoardTabMeta) => {
      e.preventDefault();
      e.stopPropagation();

      void (async () => {
        const api = window.electronApi;

        let isRoundBoard = false;
        try {
          const roundBoards = await api.invoke('round:get-boards');
          isRoundBoard = roundBoards.some((board: RoundBoardEntry) => board.url === tab.boardUrl);
        } catch {
          /* ignore */
        }

        const items: NativeContextMenuItem[] = [
          { id: 'refresh', label: '更新' },
          { id: 'add-fav', label: 'お気に入りに追加' },
          { id: 'toggle-round', label: isRoundBoard ? '巡回から削除' : '巡回に追加' },
        ];

        const action = await api.invoke('shell:popup-context-menu', items);
        if (action === null) return;

        switch (action) {
          case 'refresh':
            setActiveBoardTab(tab.id);
            break;
          case 'add-fav': {
            let boardType: BoardType;
            try {
              boardType = detectBoardTypeByHost(new URL(tab.boardUrl).hostname);
            } catch {
              boardType = BoardType.Type2ch;
            }
            void addFavorite({
              id: `fav-board-${String(Date.now())}`,
              kind: 'item',
              type: 'board',
              boardType,
              url: tab.boardUrl,
              title: tab.title,
            } satisfies FavItem);
            break;
          }
          case 'toggle-round':
            if (isRoundBoard) {
              void api.invoke('round:remove-board', tab.boardUrl);
            } else {
              void api.invoke('round:add-board', {
                url: tab.boardUrl,
                boardTitle: tab.title,
                roundName: '',
              } satisfies RoundBoardEntry);
            }
            break;
        }
      })();
    },
    [setActiveBoardTab, addFavorite],
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
          onClick={() => {
            openModal('add-board');
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="外部掲示板を追加 (したらば/まちBBS)"
        >
          <MdiIcon path={mdiLinkPlus} size={14} />
          外部板追加
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        <button
          type="button"
          onClick={() => {
            openModal('auth');
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="認証設定"
        >
          <MdiIcon path={mdiAccountKey} size={14} />
          認証
        </button>
        <button
          type="button"
          onClick={() => {
            openModal('proxy');
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="プロキシ設定"
        >
          <MdiIcon path={mdiShieldLock} size={14} />
          プロキシ
        </button>
        <button
          type="button"
          onClick={() => {
            openModal('round');
          }}
          className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${roundTimerEnabled ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'} hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]`}
          title={roundTimerEnabled ? '巡回リスト (自動巡回 ON)' : '巡回リスト'}
        >
          <MdiIcon path={mdiSync} size={14} />
          巡回{roundTimerEnabled ? ' ON' : ''}
        </button>
        <button
          type="button"
          onClick={() => {
            openModal('cookie-manager');
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="Cookie/UA管理"
        >
          <MdiIcon path={mdiCookie} size={14} />
          Cookie/UA
        </button>
        <button
          type="button"
          onClick={() => {
            openModal('console');
          }}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="診断コンソール"
        >
          <MdiIcon path={mdiConsoleLine} size={14} />
          コンソール
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        <button
          type="button"
          onClick={() => {
            openModal('dsl-editor');
          }}
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
          onClick={() => {
            openModal('about');
          }}
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
        <div
          className={`flex shrink-0 ${isVerticalBoardTabs === 'vertical' ? 'flex-row' : 'flex-col'}`}
          style={{ width: centerWidth }}
        >
          {/* Board tab bar */}
          {boardTabs.length > 0 && (
            <div
              className={
                isVerticalBoardTabs === 'vertical'
                  ? 'flex w-28 shrink-0 flex-col border-r border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]'
                  : 'flex h-7 items-center border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]'
              }
            >
              <div
                className={
                  isVerticalBoardTabs === 'vertical'
                    ? 'flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-1'
                    : 'flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1'
                }
              >
                {boardTabs.map((bt, i) => (
                  <div
                    key={bt.id}
                    className={`group flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs ${
                      isVerticalBoardTabs === 'vertical' ? 'w-full' : 'max-w-40'
                    } ${
                      bt.id === activeBoardTabId
                        ? 'bg-[var(--color-bg-active)] font-medium text-[var(--color-text-primary)]'
                        : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
                    } ${boardDragSourceIndex === i ? 'opacity-50' : ''}`}
                    onClick={() => {
                      setActiveBoardTab(bt.id);
                    }}
                    onContextMenu={(e) => {
                      handleBoardTabContextMenu(e, bt);
                    }}
                    {...getBoardTabDragProps(i)}
                  >
                    <span className="min-w-0 flex-1 truncate">{bt.title}</span>
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
                className={
                  isVerticalBoardTabs === 'vertical'
                    ? 'shrink-0 self-center rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
                    : 'mr-1 shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
                }
                title={isVerticalBoardTabs === 'vertical' ? 'タブを横に表示' : 'タブを縦に表示'}
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
        <div
          className={`flex min-w-0 flex-1 ${isVerticalThreadTabs === 'vertical' ? 'flex-row' : 'flex-col'}`}
        >
          {/* Thread tab bar */}
          <div
            className={
              isVerticalThreadTabs === 'vertical'
                ? 'flex w-32 shrink-0 flex-col border-r border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]'
                : 'flex h-8 items-center border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]'
            }
          >
            <div
              className={
                isVerticalThreadTabs === 'vertical'
                  ? 'flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 py-1'
                  : 'flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1'
              }
            >
              {threadTabs.map((tab, i) => (
                <div
                  key={tab.id}
                  className={`group flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs ${
                    isVerticalThreadTabs === 'vertical' ? 'w-full' : 'max-w-48'
                  } ${
                    tab.id === activeThreadTabId
                      ? 'bg-[var(--color-bg-active)] font-medium text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
                  } ${threadDragSourceIndex === i ? 'opacity-50' : ''}`}
                  onClick={() => {
                    setActiveTab(tab.id);
                  }}
                  onContextMenu={(e) => {
                    handleThreadTabContextMenu(e, tab);
                  }}
                  {...getThreadTabDragProps(i)}
                >
                  <span className="min-w-0 flex-1 truncate">{tab.title}</span>
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
              className={
                isVerticalThreadTabs === 'vertical'
                  ? 'shrink-0 self-center rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
                  : 'mr-1 shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
              }
              title={isVerticalThreadTabs === 'vertical' ? 'タブを横に表示' : 'タブを縦に表示'}
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
    </div>
  );
}
