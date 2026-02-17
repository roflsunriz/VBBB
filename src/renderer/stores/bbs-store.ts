/**
 * Zustand store for BBS browser state.
 */
import { create } from 'zustand';
import type { BBSMenu, Board, DatFetchResult, KotehanConfig, Res, SambaInfo, SubjectRecord, ThreadIndex } from '@shared/domain';
import type { FavNode, FavTree } from '@shared/favorite';
import type { BrowsingHistoryEntry, DisplayRange, SavedTab, SessionState } from '@shared/history';
import type { NgRule } from '@shared/ng';
import type { PostHistoryEntry } from '@shared/post-history';
import type { HighlightSettings } from '@shared/settings';
import { decodeHtmlEntities } from '@shared/html-entities';
import { DEFAULT_HIGHLIGHT_SETTINGS } from '@shared/settings';
import type { StatusLogCategory, StatusLogLevel } from '@shared/status-log';
import { useStatusLogStore } from './status-log-store';

/** Tab state for viewing threads */
interface ThreadTab {
  readonly id: string;
  readonly boardUrl: string;
  readonly threadId: string;
  readonly title: string;
  readonly responses: readonly Res[];
  readonly scrollTop: number;
  readonly kokomade: number;
  readonly displayRange: DisplayRange;
}

/** Tab state for board (category) tabs */
interface BoardTab {
  readonly id: string;
  readonly board: Board;
  readonly subjects: readonly SubjectRecord[];
  readonly threadIndices: readonly ThreadIndex[];
  readonly subjectLoading: boolean;
  readonly subjectError: string | null;
}

interface BBSState {
  // Board tree
  menu: BBSMenu | null;
  menuLoading: boolean;
  menuError: string | null;

  // Board tabs
  boardTabs: readonly BoardTab[];
  activeBoardTabId: string | null;

  // Selected board (derived from active board tab for backward compatibility)
  selectedBoard: Board | null;
  subjects: readonly SubjectRecord[];
  threadIndices: readonly ThreadIndex[];
  subjectLoading: boolean;
  subjectError: string | null;

  // Tabs
  tabs: readonly ThreadTab[];
  activeTabId: string | null;

  // Post editor
  postEditorOpen: boolean;
  postEditorInitialMessage: string;

  // Kotehan (per-board default name/mail)
  kotehan: KotehanConfig;

  // Samba timer
  sambaInfo: SambaInfo;

  // NG rules
  ngRules: readonly NgRule[];
  ngEditorOpen: boolean;
  ngEditorInitialToken: string;
  ngEditorInitialBoardId: string;
  ngEditorInitialThreadId: string;

  // Favorites
  favorites: FavTree;
  favoritesOpen: boolean;

  // External boards (F20)
  externalBoards: readonly Board[];

  // Browsing history
  browsingHistory: readonly BrowsingHistoryEntry[];

  // Post history (for highlight)
  postHistory: readonly PostHistoryEntry[];

  // Highlight settings
  highlightSettings: HighlightSettings;

  // Status
  statusMessage: string;

  // Actions
  fetchMenu: () => Promise<void>;
  selectBoard: (board: Board) => Promise<void>;
  closeBoardTab: (tabId: string) => void;
  setActiveBoardTab: (tabId: string) => void;
  fetchKotehan: (boardUrl: string) => Promise<void>;
  saveKotehan: (boardUrl: string, config: KotehanConfig) => Promise<void>;
  fetchSambaInfo: (boardUrl: string) => Promise<void>;
  recordSambaTime: (boardUrl: string) => Promise<void>;
  fetchNgRules: () => Promise<void>;
  addNgRule: (rule: NgRule) => Promise<void>;
  removeNgRule: (ruleId: string) => Promise<void>;
  toggleNgEditor: () => void;
  openNgEditorWithToken: (token: string, boardId?: string, threadId?: string) => void;
  fetchFavorites: () => Promise<void>;
  addFavorite: (node: FavNode) => Promise<void>;
  removeFavorite: (nodeId: string) => Promise<void>;
  saveFavorites: (tree: FavTree) => Promise<void>;
  toggleFavorites: () => void;
  openThread: (boardUrl: string, threadId: string, title: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabScroll: (tabId: string, scrollTop: number) => void;
  updateTabKokomade: (tabId: string, kokomade: number) => void;
  updateTabDisplayRange: (tabId: string, displayRange: DisplayRange) => void;
  saveTabs: () => Promise<void>;
  restoreTabs: (prefetchedTabs?: readonly SavedTab[]) => Promise<void>;
  restoreSession: (prefetchedSession?: SessionState) => Promise<void>;
  loadBrowsingHistory: () => Promise<void>;
  clearBrowsingHistory: () => Promise<void>;
  addExternalBoard: (board: Board) => void;
  removeExternalBoard: (url: string) => void;
  refreshSelectedBoard: () => Promise<void>;
  refreshThreadTab: (tabId: string) => Promise<void>;
  refreshActiveThread: () => Promise<void>;
  loadPostHistory: () => Promise<void>;
  setHighlightSettings: (settings: HighlightSettings) => void;
  togglePostEditor: () => void;
  closePostEditor: () => void;
  openPostEditorWithQuote: (resNumber: number) => void;
  reorderBoardTabs: (fromIndex: number, toIndex: number) => void;
  reorderThreadTabs: (fromIndex: number, toIndex: number) => void;
  setStatusMessage: (message: string) => void;
}

const HIGHLIGHT_SETTINGS_KEY = 'vbbb-highlight-settings';

function loadHighlightSettings(): HighlightSettings {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_SETTINGS_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'highlightOwnPosts' in parsed &&
        'highlightRepliesToOwn' in parsed &&
        typeof (parsed as Record<string, unknown>)['highlightOwnPosts'] === 'boolean' &&
        typeof (parsed as Record<string, unknown>)['highlightRepliesToOwn'] === 'boolean'
      ) {
        return parsed as HighlightSettings;
      }
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_HIGHLIGHT_SETTINGS;
}

function getApi(): Window['electronApi'] {
  return window.electronApi;
}

/** Guards against concurrent openThread calls for the same thread */
const pendingThreadOpens = new Set<string>();

// decodeHtmlEntities is imported from @shared/html-entities

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPlaceholderTitle(title: string, threadId: string): boolean {
  const normalized = title.trim();
  if (normalized.length === 0) return true;
  if (/^\d{9,}$/.test(normalized)) return true;

  const cleanThreadId = threadId.trim();
  if (cleanThreadId.length === 0) return false;
  const escapedThreadId = escapeRegExp(cleanThreadId);
  const slugPattern = '[A-Za-z0-9._-]+';
  const machinePatterns = [
    new RegExp(`^${slugPattern}/${slugPattern}\\s*-\\s*${escapedThreadId}$`),
    new RegExp(`^${slugPattern}\\s*-\\s*${escapedThreadId}$`),
    new RegExp(`^${slugPattern}/${escapedThreadId}$`),
  ];
  return machinePatterns.some((pattern) => pattern.test(normalized));
}

/** Shorthand to push a status log entry from store actions */
function pushStatus(category: StatusLogCategory, level: StatusLogLevel, message: string): void {
  useStatusLogStore.getState().pushLog(category, level, message);
}

function isExternalBoardUrl(boardUrl: string): boolean {
  try {
    const hostname = new URL(boardUrl).hostname.toLowerCase();
    return hostname.includes('jbbs.shitaraba') ||
      hostname.includes('jbbs.livedoor') ||
      hostname.includes('machi.to');
  } catch {
    return false;
  }
}

export const useBBSStore = create<BBSState>((set, get) => ({
  menu: null,
  menuLoading: false,
  menuError: null,

  boardTabs: [],
  activeBoardTabId: null,

  selectedBoard: null,
  subjects: [],
  threadIndices: [],
  subjectLoading: false,
  subjectError: null,

  tabs: [],
  activeTabId: null,

  postEditorOpen: false,
  postEditorInitialMessage: '',

  kotehan: { name: '', mail: '' },

  sambaInfo: { interval: 0, lastPostTime: null },

  ngRules: [],
  ngEditorOpen: false,
  ngEditorInitialToken: '',
  ngEditorInitialBoardId: '',
  ngEditorInitialThreadId: '',

  favorites: { children: [] },
  favoritesOpen: false,

  externalBoards: (() => {
    try {
      const stored = localStorage.getItem('vbbb-external-boards');
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed as readonly Board[];
      }
    } catch { /* ignore */ }
    return [] as readonly Board[];
  })(),

  browsingHistory: [],

  postHistory: [],

  highlightSettings: loadHighlightSettings(),

  statusMessage: 'Ready',

  fetchMenu: async () => {
    set({ menuLoading: true, menuError: null, statusMessage: '板一覧を取得中...' });
    pushStatus('board', 'info', '板一覧を取得中...');
    try {
      const menu = await getApi().invoke('bbs:fetch-menu');
      set({ menu, menuLoading: false, statusMessage: `${String(menu.categories.length)} カテゴリを読み込みました` });
      pushStatus('board', 'success', `板一覧取得完了: ${String(menu.categories.length)} カテゴリ`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ menuLoading: false, menuError: message, statusMessage: '板一覧の取得に失敗しました' });
      pushStatus('board', 'error', `板一覧取得失敗: ${message}`);
    }
  },

  selectBoard: async (board: Board) => {
    const boardTabId = board.url;
    const maybeResolveExternalBoardTitle = async (targetBoardUrl: string): Promise<void> => {
      if (!isExternalBoardUrl(targetBoardUrl)) return;
      try {
        const resolvedTitle = await getApi().invoke('bbs:resolve-board-title', targetBoardUrl);
        if (resolvedTitle === null || resolvedTitle.trim().length === 0) return;

        set((state) => ({
          boardTabs: state.boardTabs.map((tab) =>
            tab.board.url === targetBoardUrl
              ? { ...tab, board: { ...tab.board, title: resolvedTitle } }
              : tab,
          ),
          selectedBoard:
            state.selectedBoard !== null && state.selectedBoard.url === targetBoardUrl
              ? { ...state.selectedBoard, title: resolvedTitle }
              : state.selectedBoard,
          externalBoards: state.externalBoards.map((externalBoard) =>
            externalBoard.url === targetBoardUrl
              ? { ...externalBoard, title: resolvedTitle }
              : externalBoard,
          ),
        }));

        try {
          localStorage.setItem('vbbb-external-boards', JSON.stringify(get().externalBoards));
        } catch {
          // Ignore storage errors
        }
      } catch {
        // Ignore title resolution errors
      }
    };

    // F20: Auto-add external boards to the external category
    if (isExternalBoardUrl(board.url)) {
      get().addExternalBoard(board);
    }

    // Check if board tab already exists
    const { boardTabs } = get();
    const existing = boardTabs.find((t) => t.id === boardTabId);
    if (existing !== undefined) {
      // Switch to existing tab and update derived state
      set({
        activeBoardTabId: boardTabId,
        selectedBoard: existing.board,
        subjects: existing.subjects,
        threadIndices: existing.threadIndices,
        subjectLoading: existing.subjectLoading,
        subjectError: existing.subjectError,
      });
      // Refresh kotehan/samba for this board
      void get().fetchKotehan(board.url);
      void get().fetchSambaInfo(board.url);
      void maybeResolveExternalBoardTitle(board.url);
      return;
    }

    // Create new board tab
    const newTab: BoardTab = {
      id: boardTabId,
      board,
      subjects: [],
      threadIndices: [],
      subjectLoading: true,
      subjectError: null,
    };
    set((state) => ({
      boardTabs: [...state.boardTabs, newTab],
      activeBoardTabId: boardTabId,
      selectedBoard: board,
      subjects: [],
      threadIndices: [],
      subjectLoading: true,
      subjectError: null,
      statusMessage: `${board.title} のスレッド一覧を取得中...`,
    }));
    pushStatus('board', 'info', `${board.title} のスレッド一覧を取得中...`);
    void maybeResolveExternalBoardTitle(board.url);

    // Persist selected board for session restore
    void getApi().invoke('session:save', { selectedBoardUrl: board.url });

    try {
      const [result, indices, kotehan, sambaInfo] = await Promise.all([
        getApi().invoke('bbs:fetch-subject', board.url),
        getApi().invoke('bbs:get-thread-index', board.url),
        getApi().invoke('bbs:get-kotehan', board.url),
        getApi().invoke('bbs:get-samba', board.url),
      ]);

      set((state) => ({
        boardTabs: state.boardTabs.map((t) =>
          t.id === boardTabId
            ? { ...t, subjects: result.threads, threadIndices: indices, subjectLoading: false, subjectError: null }
            : t,
        ),
        // Update derived state only if this is still the active tab
        ...(state.activeBoardTabId === boardTabId
          ? {
              subjects: result.threads,
              threadIndices: indices,
              kotehan,
              sambaInfo,
              subjectLoading: false,
            }
          : {}),
        statusMessage: `${board.title}: ${String(result.threads.length)} スレッド`,
      }));
      pushStatus('board', 'success', `${board.title}: ${String(result.threads.length)} スレッド取得`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({
        boardTabs: state.boardTabs.map((t) =>
          t.id === boardTabId
            ? { ...t, subjectLoading: false, subjectError: message }
            : t,
        ),
        ...(state.activeBoardTabId === boardTabId
          ? { subjectLoading: false, subjectError: message }
          : {}),
        statusMessage: 'スレッド一覧の取得に失敗しました',
      }));
      pushStatus('board', 'error', `${board.title} スレッド一覧取得失敗: ${message}`);
    }
  },

  closeBoardTab: (tabId: string) => {
    set((state) => {
      const newTabs = state.boardTabs.filter((t) => t.id !== tabId);
      let newActiveId = state.activeBoardTabId;
      if (state.activeBoardTabId === tabId) {
        const last = newTabs[newTabs.length - 1];
        newActiveId = last?.id ?? null;
      }
      const activeTab = newTabs.find((t) => t.id === newActiveId);
      return {
        boardTabs: newTabs,
        activeBoardTabId: newActiveId,
        selectedBoard: activeTab?.board ?? null,
        subjects: activeTab?.subjects ?? [],
        threadIndices: activeTab?.threadIndices ?? [],
        subjectLoading: activeTab?.subjectLoading ?? false,
        subjectError: activeTab?.subjectError ?? null,
      };
    });
  },

  setActiveBoardTab: (tabId: string) => {
    const { boardTabs } = get();
    const tab = boardTabs.find((t) => t.id === tabId);
    if (tab === undefined) return;
    set({
      activeBoardTabId: tabId,
      selectedBoard: tab.board,
      subjects: tab.subjects,
      threadIndices: tab.threadIndices,
      subjectLoading: tab.subjectLoading,
      subjectError: tab.subjectError,
    });
    // Refresh kotehan/samba for the switched board
    void get().fetchKotehan(tab.board.url);
    void get().fetchSambaInfo(tab.board.url);
  },

  fetchKotehan: async (boardUrl: string) => {
    try {
      const kotehan = await getApi().invoke('bbs:get-kotehan', boardUrl);
      set({ kotehan });
    } catch {
      // Silently fall back to default
    }
  },

  saveKotehan: async (boardUrl: string, config: KotehanConfig) => {
    try {
      await getApi().invoke('bbs:set-kotehan', boardUrl, config);
      set({ kotehan: config });
    } catch {
      // Silently ignore save errors
    }
  },

  fetchSambaInfo: async (boardUrl: string) => {
    try {
      const sambaInfo = await getApi().invoke('bbs:get-samba', boardUrl);
      set({ sambaInfo });
    } catch {
      // Silently fall back to default
    }
  },

  recordSambaTime: async (boardUrl: string) => {
    try {
      await getApi().invoke('bbs:record-samba', boardUrl);
      // Update local state with new post time
      set((state) => ({
        sambaInfo: { ...state.sambaInfo, lastPostTime: new Date().toISOString() },
      }));
    } catch {
      // Silently ignore
    }
  },

  fetchNgRules: async () => {
    try {
      const ngRules = await getApi().invoke('ng:get-rules');
      set({ ngRules });
    } catch {
      // Silently fall back
    }
  },

  addNgRule: async (rule: NgRule) => {
    try {
      await getApi().invoke('ng:add-rule', rule);
      set((state) => ({ ngRules: [...state.ngRules, rule] }));
    } catch {
      // Silently ignore
    }
  },

  removeNgRule: async (ruleId: string) => {
    try {
      await getApi().invoke('ng:remove-rule', ruleId);
      set((state) => ({ ngRules: state.ngRules.filter((r) => r.id !== ruleId) }));
    } catch {
      // Silently ignore
    }
  },

  toggleNgEditor: () => {
    set((state) => ({
      ngEditorOpen: !state.ngEditorOpen,
      ngEditorInitialToken: '',
      ngEditorInitialBoardId: '',
      ngEditorInitialThreadId: '',
    }));
  },

  openNgEditorWithToken: (token: string, boardId?: string, threadId?: string) => {
    set({
      ngEditorOpen: true,
      ngEditorInitialToken: token,
      ngEditorInitialBoardId: boardId ?? '',
      ngEditorInitialThreadId: threadId ?? '',
    });
  },

  fetchFavorites: async () => {
    try {
      const favorites = await getApi().invoke('fav:load');
      set({ favorites });
    } catch {
      // Silently fall back
    }
  },

  addFavorite: async (node: FavNode) => {
    try {
      await getApi().invoke('fav:add', node);
      set((state) => ({
        favorites: { children: [...state.favorites.children, node] },
      }));
    } catch {
      // Silently ignore
    }
  },

  removeFavorite: async (nodeId: string) => {
    try {
      await getApi().invoke('fav:remove', nodeId);
      // Reload from server to get properly cleaned tree
      const favorites = await getApi().invoke('fav:load');
      set({ favorites });
    } catch {
      // Silently ignore
    }
  },

  saveFavorites: async (tree: FavTree) => {
    try {
      await getApi().invoke('fav:save', tree);
      set({ favorites: tree });
    } catch {
      // Silently ignore
    }
  },

  toggleFavorites: () => {
    set((state) => ({ favoritesOpen: !state.favoritesOpen }));
  },

  openThread: async (boardUrl: string, threadId: string, title: string) => {
    const tabId = `${boardUrl}:${threadId}`;

    const { tabs } = get();
    const existingTab = tabs.find((t) => t.id === tabId);
    if (existingTab !== undefined) {
      set({ activeTabId: existingTab.id });
      return;
    }

    if (pendingThreadOpens.has(tabId)) {
      return;
    }
    pendingThreadOpens.add(tabId);

    const loadingTitle = title.trim().length > 0 ? title : threadId;
    set({ statusMessage: `${loadingTitle} を読み込み中...` });
    pushStatus('thread', 'info', `${loadingTitle} を読み込み中...`);

    try {
      const result: DatFetchResult = await getApi().invoke('bbs:fetch-dat', boardUrl, threadId);

      const datFileName = `${threadId}.dat`;

      // Try in-memory threadIndices first (fast path for same-board tabs)
      let idx = get().threadIndices.find((i) => i.fileName === datFileName);

      // Fallback: read Folder.idx from disk. This covers the case where the
      // thread was previously closed (scrollTop persisted to Folder.idx) but
      // the in-memory threadIndices belongs to a different board or is stale.
      if (idx === undefined) {
        try {
          const diskIndices = await getApi().invoke('bbs:get-thread-index', boardUrl);
          idx = diskIndices.find((i) => i.fileName === datFileName);
        } catch {
          // ignore — proceed with defaults
        }
      }

      const kokomade = idx?.kokomade ?? -1;
      const scrollTop = idx?.scrollTop ?? 0;

      // If the incoming title is mechanical/placeholder, resolve from DAT #1 title.
      let resolvedTitle = title;
      if (isPlaceholderTitle(resolvedTitle, threadId) && result.responses.length > 0) {
        const firstRes = result.responses[0];
        if (firstRes !== undefined && firstRes.title.trim().length > 0) {
          resolvedTitle = decodeHtmlEntities(firstRes.title);
        }
      }
      if (resolvedTitle.trim().length === 0) {
        resolvedTitle = threadId;
      }

      const newTab: ThreadTab = {
        id: tabId,
        boardUrl,
        threadId,
        title: resolvedTitle,
        responses: result.responses,
        scrollTop,
        kokomade,
        displayRange: 'all',
      };
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: tabId,
        statusMessage: `${resolvedTitle}: ${String(result.responses.length)} レス`,
      }));
      pushStatus('thread', 'success', `${resolvedTitle}: ${String(result.responses.length)} レス取得`);

      void getApi().invoke('history:add', boardUrl, threadId, resolvedTitle);

      // Persist lastModified from DAT fetch to Folder.idx and update in-memory threadIndices
      if (result.lastModified !== null) {
        void getApi().invoke('bbs:update-thread-index', boardUrl, threadId, { lastModified: result.lastModified });
        set((state) => {
          const updateIdx = (indices: readonly ThreadIndex[]): readonly ThreadIndex[] =>
            indices.map((i) => i.fileName === datFileName ? { ...i, lastModified: result.lastModified } : i);
          return {
            threadIndices: updateIdx(state.threadIndices),
            boardTabs: state.boardTabs.map((bt) =>
              bt.id === state.activeBoardTabId ? { ...bt, threadIndices: updateIdx(bt.threadIndices) } : bt,
            ),
          };
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ statusMessage: `読み込み失敗: ${message}` });
      pushStatus('thread', 'error', `スレッド読み込み失敗: ${message}`);
    } finally {
      pendingThreadOpens.delete(tabId);
    }
  },

  closeTab: (tabId: string) => {
    const { tabs } = get();
    const closingTab = tabs.find((t) => t.id === tabId);

    // Persist scrollTop before closing
    if (closingTab !== undefined) {
      void getApi().invoke('bbs:update-thread-index', closingTab.boardUrl, closingTab.threadId, {
        scrollTop: closingTab.scrollTop,
      });
    }

    set((state) => {
      const newTabs = state.tabs.filter((t) => t.id !== tabId);
      let newActiveId = state.activeTabId;
      if (state.activeTabId === tabId) {
        newActiveId = newTabs.length > 0 ? (newTabs[newTabs.length - 1]?.id ?? null) : null;
      }
      return { tabs: newTabs, activeTabId: newActiveId };
    });
  },

  setActiveTab: (tabId: string) => {
    set({ activeTabId: tabId });
  },

  updateTabScroll: (tabId: string, scrollTop: number) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, scrollTop } : t)),
    }));
  },

  updateTabKokomade: (tabId: string, kokomade: number) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, kokomade } : t)),
    }));
    // Also persist to Folder.idx
    const tab = get().tabs.find((t) => t.id === tabId);
    if (tab !== undefined) {
      void getApi().invoke('bbs:update-thread-index', tab.boardUrl, tab.threadId, { kokomade });
    }
  },

  updateTabDisplayRange: (tabId: string, displayRange: DisplayRange) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, displayRange } : t)),
    }));
  },

  saveTabs: async () => {
    const { tabs } = get();
    const savedTabs = tabs.map((t) => ({
      boardUrl: t.boardUrl,
      threadId: t.threadId,
      title: t.title,
      scrollTop: t.scrollTop,
    }));
    await getApi().invoke('tab:save', savedTabs);

    // Also persist scrollTop to Folder.idx for each open tab
    for (const t of tabs) {
      if (t.scrollTop > 0) {
        void getApi().invoke('bbs:update-thread-index', t.boardUrl, t.threadId, {
          scrollTop: t.scrollTop,
        });
      }
    }
  },

  restoreTabs: async (prefetchedTabs?: readonly SavedTab[]) => {
    try {
      const savedTabs = prefetchedTabs ?? await getApi().invoke('tab:load');

      // Open all threads in parallel
      await Promise.all(savedTabs.map(async (saved) => {
        await get().openThread(saved.boardUrl, saved.threadId, saved.title);

        // Apply scrollTop from tab.sav (takes priority over Folder.idx
        // which may be stale if the tab was never explicitly closed).
        if (saved.scrollTop !== undefined && saved.scrollTop > 0) {
          const { tabs } = get();
          const opened = tabs.find(
            (t) => t.boardUrl === saved.boardUrl && t.threadId === saved.threadId,
          );
          if (opened !== undefined) {
            get().updateTabScroll(opened.id, saved.scrollTop);
          }
        }
      }));

      // Re-sort tabs to match the saved order (parallel open is non-deterministic)
      const tabOrder = new Map(savedTabs.map((s, i) => [`${s.boardUrl}:${s.threadId}`, i]));
      set((state) => ({
        tabs: [...state.tabs].sort((a, b) => {
          const ai = tabOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bi = tabOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return ai - bi;
        }),
      }));

      // Restore active thread tab from session
      const session = await getApi().invoke('session:load');
      if (session.activeThreadTabId !== undefined) {
        const { tabs } = get();
        const target = tabs.find((t) => t.id === session.activeThreadTabId);
        if (target !== undefined) {
          set({ activeTabId: target.id });
        }
      }
    } catch {
      // Silently ignore restore errors
    }
  },

  restoreSession: async (prefetchedSession?: SessionState) => {
    try {
      const session = prefetchedSession ?? await getApi().invoke('session:load');
      const { menu } = get();
      if (menu === null) return;

      // Helper: find a Board from the menu by URL
      const findBoard = (url: string): Board | undefined => {
        for (const cat of menu.categories) {
          const b = cat.boards.find((board) => board.url === url);
          if (b !== undefined) return b;
        }
        return undefined;
      };

      // Restore board tabs (F27) — all boards in parallel
      if (session.boardTabUrls !== undefined && session.boardTabUrls.length > 0) {
        const boardTabUrls = session.boardTabUrls;
        const boards = boardTabUrls
          .map((url) => findBoard(url))
          .filter((b): b is Board => b !== undefined);
        await Promise.all(boards.map((board) => get().selectBoard(board)));

        // Re-sort boardTabs to match the saved order
        const urlOrder = new Map(boardTabUrls.map((url, i) => [url, i]));
        set((state) => ({
          boardTabs: [...state.boardTabs].sort((a, b) => {
            const ai = urlOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
            const bi = urlOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
            return ai - bi;
          }),
        }));

        // Restore active board tab
        if (session.activeBoardTabId !== undefined) {
          const { boardTabs } = get();
          const target = boardTabs.find((t) => t.id === session.activeBoardTabId);
          if (target !== undefined) {
            get().setActiveBoardTab(target.id);
          }
        }
      } else if (session.selectedBoardUrl !== null) {
        // Backward compatibility: restore single board
        const board = findBoard(session.selectedBoardUrl);
        if (board !== undefined) {
          await get().selectBoard(board);
        }
      }
    } catch {
      // Silently ignore session restore errors
    }
  },

  loadBrowsingHistory: async () => {
    try {
      const history = await getApi().invoke('history:load');
      set({ browsingHistory: history });
    } catch {
      // Silently ignore
    }
  },

  clearBrowsingHistory: async () => {
    try {
      await getApi().invoke('history:clear');
      set({ browsingHistory: [] });
    } catch {
      // Silently ignore
    }
  },

  addExternalBoard: (board: Board) => {
    const { externalBoards } = get();
    if (externalBoards.some((b) => b.url === board.url)) return;
    const updated = [...externalBoards, board];
    set({ externalBoards: updated });
    try { localStorage.setItem('vbbb-external-boards', JSON.stringify(updated)); } catch { /* ignore */ }
  },

  removeExternalBoard: (url: string) => {
    const { externalBoards } = get();
    const updated = externalBoards.filter((b) => b.url !== url);
    set({ externalBoards: updated });
    try { localStorage.setItem('vbbb-external-boards', JSON.stringify(updated)); } catch { /* ignore */ }
  },

  refreshSelectedBoard: async () => {
    const { selectedBoard } = get();
    if (selectedBoard === null) return;

    const boardTabId = selectedBoard.url;
    const boardTitle = selectedBoard.title;

    set((state) => ({
      boardTabs: state.boardTabs.map((t) =>
        t.id === boardTabId
          ? { ...t, subjectLoading: true, subjectError: null }
          : t,
      ),
      ...(state.activeBoardTabId === boardTabId
        ? { subjectLoading: true, subjectError: null }
        : {}),
      statusMessage: `${boardTitle} のスレッド一覧を更新中...`,
    }));
    pushStatus('board', 'info', `${boardTitle} のスレッド一覧を更新中...`);

    try {
      const [result, indices, kotehan, sambaInfo] = await Promise.all([
        getApi().invoke('bbs:fetch-subject', selectedBoard.url),
        getApi().invoke('bbs:get-thread-index', selectedBoard.url),
        getApi().invoke('bbs:get-kotehan', selectedBoard.url),
        getApi().invoke('bbs:get-samba', selectedBoard.url),
      ]);

      set((state) => ({
        boardTabs: state.boardTabs.map((t) =>
          t.id === boardTabId
            ? { ...t, subjects: result.threads, threadIndices: indices, subjectLoading: false, subjectError: null }
            : t,
        ),
        ...(state.activeBoardTabId === boardTabId
          ? {
              subjects: result.threads,
              threadIndices: indices,
              kotehan,
              sambaInfo,
              subjectLoading: false,
              subjectError: null,
            }
          : {}),
        statusMessage: `${boardTitle}: ${String(result.threads.length)} スレッド (更新済み)`,
      }));
      pushStatus('board', 'success', `${boardTitle}: ${String(result.threads.length)} スレッド (更新済み)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({
        boardTabs: state.boardTabs.map((t) =>
          t.id === boardTabId
            ? { ...t, subjectLoading: false, subjectError: message }
            : t,
        ),
        ...(state.activeBoardTabId === boardTabId
          ? { subjectLoading: false, subjectError: message }
          : {}),
        statusMessage: `スレッド一覧更新失敗: ${message}`,
      }));
      pushStatus('board', 'error', `${boardTitle} スレッド一覧更新失敗: ${message}`);
    }
  },

  refreshThreadTab: async (tabId: string) => {
    const { tabs } = get();
    const targetTab = tabs.find((t) => t.id === tabId);
    if (targetTab === undefined) return;

    pushStatus('thread', 'info', `${targetTab.title} を更新中...`);
    try {
      const result = await getApi().invoke('bbs:fetch-dat', targetTab.boardUrl, targetTab.threadId);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId ? { ...t, responses: result.responses } : t,
        ),
        statusMessage: `${targetTab.title}: ${String(result.responses.length)} レス (更新済み)`,
      }));
      pushStatus('thread', 'success', `${targetTab.title}: ${String(result.responses.length)} レス (更新済み)`);

      // Persist lastModified from DAT fetch to Folder.idx and update in-memory threadIndices
      if (result.lastModified !== null) {
        const datFileName = `${targetTab.threadId}.dat`;
        void getApi().invoke('bbs:update-thread-index', targetTab.boardUrl, targetTab.threadId, { lastModified: result.lastModified });
        set((state) => {
          const updateIdx = (indices: readonly ThreadIndex[]): readonly ThreadIndex[] =>
            indices.map((i) => i.fileName === datFileName ? { ...i, lastModified: result.lastModified } : i);
          return {
            threadIndices: updateIdx(state.threadIndices),
            boardTabs: state.boardTabs.map((bt) =>
              bt.id === state.activeBoardTabId ? { ...bt, threadIndices: updateIdx(bt.threadIndices) } : bt,
            ),
          };
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ statusMessage: `スレ更新失敗: ${message}` });
      pushStatus('thread', 'error', `スレ更新失敗: ${message}`);
    }
  },

  loadPostHistory: async () => {
    try {
      const history = await getApi().invoke('post:load-history');
      set({ postHistory: history });
    } catch {
      // Silently ignore
    }
  },

  setHighlightSettings: (settings: HighlightSettings) => {
    set({ highlightSettings: settings });
    try {
      localStorage.setItem(HIGHLIGHT_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Silently ignore storage errors
    }
  },

  refreshActiveThread: async () => {
    const { activeTabId } = get();
    if (activeTabId === null) return;
    await get().refreshThreadTab(activeTabId);
  },

  togglePostEditor: () => {
    set((state) => ({ postEditorOpen: !state.postEditorOpen, postEditorInitialMessage: '' }));
  },

  closePostEditor: () => {
    set({ postEditorOpen: false, postEditorInitialMessage: '' });
  },

  openPostEditorWithQuote: (resNumber: number) => {
    set({ postEditorOpen: true, postEditorInitialMessage: `>>${String(resNumber)}\n` });
  },

  reorderBoardTabs: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const arr = [...state.boardTabs];
      const item = arr[fromIndex];
      if (item === undefined) return state;
      arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return { boardTabs: arr };
    });
  },

  reorderThreadTabs: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const arr = [...state.tabs];
      const item = arr[fromIndex];
      if (item === undefined) return state;
      arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return { tabs: arr };
    });
  },

  setStatusMessage: (message: string) => {
    set({ statusMessage: message });
  },
}));

// ---------------------------------------------------------------------------
// Debounced auto-save: persist tab list whenever tabs are added/removed/reordered.
// This ensures tab.sav is always reasonably up-to-date, so even if the
// synchronous beforeunload save fails, at most a few hundred ms of changes
// are lost (instead of the entire session).
// ---------------------------------------------------------------------------
const TAB_AUTO_SAVE_DELAY_MS = 500;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let prevTabIdSnapshot = '';

useBBSStore.subscribe((state) => {
  const snapshot = state.tabs.map((t) => t.id).join('\t');
  if (snapshot === prevTabIdSnapshot) return;
  prevTabIdSnapshot = snapshot;

  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    void useBBSStore.getState().saveTabs();
  }, TAB_AUTO_SAVE_DELAY_MS);
});
