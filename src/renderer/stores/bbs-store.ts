/**
 * Zustand store for BBS browser state.
 */
import { create } from 'zustand';
import type {
  BBSMenu,
  Board,
  BoardSortDir,
  BoardSortKey,
  DatFetchResult,
  KotehanConfig,
  Res,
  SambaInfo,
  SubjectRecord,
  ThreadIndex,
} from '@shared/domain';
import { DatFetchStatus } from '@shared/domain';
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
  /** First visible response number at top of viewport (0 = unset). Used for accurate scroll restoration. */
  readonly scrollResNumber: number;
  /** Pixel offset from the top of scrollResNumber's virtual item to the viewport top (0 = item is at top). */
  readonly scrollResOffset: number;
  readonly kokomade: number;
  readonly displayRange: DisplayRange;
  /** Whether the post editor panel is open for this tab */
  readonly postEditorOpen: boolean;
  /** Initial message (e.g. quoted >>N) for the post editor */
  readonly postEditorInitialMessage: string;
  /** Whether the analysis panel is open for this tab */
  readonly analysisOpen: boolean;
  /** Whether the programmatic post panel is open for this tab */
  readonly progPostOpen: boolean;
  /** Whether the thread has DAT fallen (サーバーが HTTP 302 を返した) */
  readonly isDatFallen: boolean;
}

/** Tab state for board (category) tabs */
interface BoardTab {
  readonly id: string;
  readonly board: Board;
  readonly subjects: readonly SubjectRecord[];
  readonly threadIndices: readonly ThreadIndex[];
  readonly subjectLoading: boolean;
  readonly subjectError: string | null;
  /** Thread list filter keyword for this board tab */
  readonly filter: string;
  /** Thread list sort key for this board tab */
  readonly sortKey: BoardSortKey;
  /** Thread list sort direction for this board tab */
  readonly sortDir: BoardSortDir;
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

  // (Post editor state is stored per thread tab)

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
  updateTabScroll: (
    tabId: string,
    scrollTop: number,
    scrollResNumber?: number,
    scrollResOffset?: number,
  ) => void;
  updateTabKokomade: (tabId: string, kokomade: number) => void;
  updateTabDisplayRange: (tabId: string, displayRange: DisplayRange) => void;
  /** Per-tab post editor */
  toggleTabPostEditor: (tabId: string) => void;
  closeTabPostEditor: (tabId: string) => void;
  openTabPostEditorWithQuote: (tabId: string, resNumber: number) => void;
  /** Per-tab analysis panel */
  toggleTabAnalysis: (tabId: string) => void;
  /** Per-tab programmatic post panel */
  toggleTabProgPost: (tabId: string) => void;
  closeTabProgPost: (tabId: string) => void;
  /** Per-tab board filter / sort */
  updateBoardTabFilter: (tabId: string, filter: string) => void;
  updateBoardTabSort: (tabId: string, sortKey: BoardSortKey, sortDir: BoardSortDir) => void;
  saveTabs: () => Promise<void>;
  restoreTabs: (prefetchedTabs?: readonly SavedTab[], activeThreadTabId?: string) => Promise<void>;
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
  reorderBoardTabs: (fromIndex: number, toIndex: number) => void;
  reorderThreadTabs: (fromIndex: number, toIndex: number) => void;
  setStatusMessage: (message: string) => void;
  /** Whether the new thread creation editor is open (board-level, in ThreadList) */
  newThreadEditorOpen: boolean;
  openNewThreadEditor: () => void;
  closeNewThreadEditor: () => void;
  /** Pre-filled subject/message for next-thread creation (null = blank editor). */
  nextThreadDraft: { readonly subject: string; readonly message: string } | null;
  openNewThreadEditorWithDraft: (subject: string, message: string) => void;
  /** Navigate to the previous or next open thread tab (Slevo: SwitchToPreviousTab / SwitchToNextTab) */
  switchToAdjacentTab: (direction: 'prev' | 'next') => void;
}

const HIGHLIGHT_SETTINGS_KEY = 'vbbb-highlight-settings';
const BOARD_SORT_SETTINGS_KEY = 'vbbb-board-sort-settings';

const VALID_SORT_KEYS: ReadonlySet<string> = new Set([
  'index',
  'title',
  'count',
  'ikioi',
  'completionRate',
  'firstPostDate',
]);
const VALID_SORT_DIRS: ReadonlySet<string> = new Set(['asc', 'desc']);

type BoardSortRecord = Record<
  string,
  { readonly sortKey: BoardSortKey; readonly sortDir: BoardSortDir }
>;

function loadBoardSortSettings(): BoardSortRecord {
  try {
    const raw = localStorage.getItem(BOARD_SORT_SETTINGS_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as BoardSortRecord;
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveBoardSortSetting(
  boardUrl: string,
  sortKey: BoardSortKey,
  sortDir: BoardSortDir,
): void {
  try {
    const all = loadBoardSortSettings();
    const next: BoardSortRecord = { ...all, [boardUrl]: { sortKey, sortDir } };
    localStorage.setItem(BOARD_SORT_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

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
    return (
      hostname.includes('jbbs.shitaraba') ||
      hostname.includes('jbbs.livedoor') ||
      hostname.includes('machi.to')
    );
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
    } catch {
      /* ignore */
    }
    return [] as readonly Board[];
  })(),

  browsingHistory: [],

  postHistory: [],

  highlightSettings: loadHighlightSettings(),

  statusMessage: 'Ready',

  newThreadEditorOpen: false,
  nextThreadDraft: null,

  fetchMenu: async () => {
    set({ menuLoading: true, menuError: null, statusMessage: '板一覧を取得中...' });
    pushStatus('board', 'info', '板一覧を取得中...');
    try {
      const fetched = await getApi().invoke('bbs:fetch-menu');

      // Guard: do not overwrite a valid menu with an empty one.
      // This can happen when the server returns a CAPTCHA/error page
      // that produces zero categories after parsing.
      const current = get().menu;
      if (fetched.categories.length === 0 && current !== null && current.categories.length > 0) {
        pushStatus(
          'board',
          'warn',
          `板一覧取得結果が空 (0 カテゴリ) — 既存メニュー (${String(current.categories.length)} カテゴリ) を維持します`,
        );
        set({ menuLoading: false, statusMessage: '板一覧の取得結果が空のため既存データを維持' });
        return;
      }

      set({
        menu: fetched,
        menuLoading: false,
        statusMessage: `${String(fetched.categories.length)} カテゴリを読み込みました`,
      });
      pushStatus(
        'board',
        'success',
        `板一覧取得完了: ${String(fetched.categories.length)} カテゴリ`,
      );
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

    // Load persisted sort settings for this board
    const savedSortAll = loadBoardSortSettings();
    const savedSort = savedSortAll[boardTabId];
    const persistedSortKey: BoardSortKey =
      savedSort !== undefined && VALID_SORT_KEYS.has(savedSort.sortKey)
        ? savedSort.sortKey
        : 'index';
    const persistedSortDir: BoardSortDir =
      savedSort !== undefined && VALID_SORT_DIRS.has(savedSort.sortDir) ? savedSort.sortDir : 'asc';

    // Create new board tab
    const newTab: BoardTab = {
      id: boardTabId,
      board,
      subjects: [],
      threadIndices: [],
      subjectLoading: true,
      subjectError: null,
      filter: '',
      sortKey: persistedSortKey,
      sortDir: persistedSortDir,
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
            ? {
                ...t,
                subjects: result.threads,
                threadIndices: indices,
                subjectLoading: false,
                subjectError: null,
              }
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
      pushStatus(
        'board',
        'success',
        `${board.title}: ${String(result.threads.length)} スレッド取得`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({
        boardTabs: state.boardTabs.map((t) =>
          t.id === boardTabId ? { ...t, subjectLoading: false, subjectError: message } : t,
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
      let idxSource: 'memory' | 'disk' | 'none' = idx !== undefined ? 'memory' : 'none';

      // Fallback: read Folder.idx from disk. This covers the case where the
      // thread was previously closed (scrollTop persisted to Folder.idx) but
      // the in-memory threadIndices belongs to a different board or is stale.
      if (idx === undefined) {
        try {
          const diskIndices = await getApi().invoke('bbs:get-thread-index', boardUrl);
          idx = diskIndices.find((i) => i.fileName === datFileName);
          if (idx !== undefined) idxSource = 'disk';
        } catch {
          // ignore — proceed with defaults
        }
      }

      const kokomade = idx?.kokomade ?? -1;
      const scrollTop = idx?.scrollTop ?? 0;
      const scrollResNumber = idx?.scrollResNumber ?? 0;
      const scrollResOffset = idx?.scrollResOffset ?? 0;

      pushStatus(
        'thread',
        'info',
        `[kokomade] openThread: threadId=${threadId}, source=${idxSource}, kokomade=${String(kokomade)}, resCount=${String(result.responses.length)}`,
      );

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

      const isDatFallen =
        result.status === DatFetchStatus.Archived || result.status === DatFetchStatus.DatFallen;

      const newTab: ThreadTab = {
        id: tabId,
        boardUrl,
        threadId,
        title: resolvedTitle,
        responses: result.responses,
        scrollTop,
        scrollResNumber,
        scrollResOffset,
        kokomade,
        displayRange: 'all',
        postEditorOpen: false,
        postEditorInitialMessage: '',
        analysisOpen: false,
        progPostOpen: false,
        isDatFallen,
      };
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: tabId,
        statusMessage: `${resolvedTitle}: ${String(result.responses.length)} レス`,
      }));
      pushStatus(
        'thread',
        'success',
        `${resolvedTitle}: ${String(result.responses.length)} レス取得`,
      );

      void getApi().invoke('history:add', boardUrl, threadId, resolvedTitle);

      // Persist lastModified from DAT fetch to Folder.idx and update in-memory threadIndices
      if (result.lastModified !== null) {
        void getApi().invoke('bbs:update-thread-index', boardUrl, threadId, {
          lastModified: result.lastModified,
        });
        set((state) => {
          const updateIdx = (indices: readonly ThreadIndex[]): readonly ThreadIndex[] =>
            indices.map((i) =>
              i.fileName === datFileName ? { ...i, lastModified: result.lastModified } : i,
            );
          return {
            threadIndices: updateIdx(state.threadIndices),
            boardTabs: state.boardTabs.map((bt) =>
              bt.id === state.activeBoardTabId
                ? { ...bt, threadIndices: updateIdx(bt.threadIndices) }
                : bt,
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

    // Persist scrollTop, scrollResNumber and kokomade before closing
    if (closingTab !== undefined) {
      void getApi().invoke('bbs:update-thread-index', closingTab.boardUrl, closingTab.threadId, {
        scrollTop: closingTab.scrollTop,
        scrollResNumber: closingTab.scrollResNumber,
        scrollResOffset: closingTab.scrollResOffset,
        kokomade: closingTab.kokomade,
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

  updateTabScroll: (
    tabId: string,
    scrollTop: number,
    scrollResNumber?: number,
    scrollResOffset?: number,
  ) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              scrollTop,
              ...(scrollResNumber !== undefined ? { scrollResNumber } : {}),
              ...(scrollResOffset !== undefined ? { scrollResOffset } : {}),
            }
          : t,
      ),
    }));
  },

  updateTabKokomade: (tabId: string, kokomade: number) => {
    const tab = get().tabs.find((t) => t.id === tabId);

    // Skip if the value hasn't changed (avoid unnecessary state updates / IPC on scroll)
    if (tab !== undefined && tab.kokomade === kokomade) return;

    pushStatus(
      'thread',
      'info',
      `[kokomade] update: ${tab?.threadId ?? tabId} kokomade=${String(tab?.kokomade ?? -1)}->${String(kokomade)}`,
    );

    set((state) => {
      const updatedTabs = state.tabs.map((t) => (t.id === tabId ? { ...t, kokomade } : t));

      if (tab === undefined) {
        return { tabs: updatedTabs };
      }

      // Keep in-memory threadIndices in sync so that closing and
      // re-opening the same tab preserves the kokomade position.
      const datFileName = `${tab.threadId}.dat`;
      const updateIdx = (indices: readonly ThreadIndex[]): readonly ThreadIndex[] =>
        indices.map((i) => (i.fileName === datFileName ? { ...i, kokomade } : i));

      return {
        tabs: updatedTabs,
        threadIndices: updateIdx(state.threadIndices),
        boardTabs: state.boardTabs.map((bt) =>
          bt.id === state.activeBoardTabId
            ? { ...bt, threadIndices: updateIdx(bt.threadIndices) }
            : bt,
        ),
      };
    });

    // Also persist to Folder.idx
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
      scrollResNumber: t.scrollResNumber,
    }));
    await getApi().invoke('tab:save', savedTabs);

    // Also persist scrollTop, scrollResNumber and scrollResOffset to Folder.idx for each open tab
    for (const t of tabs) {
      if (t.scrollTop > 0 || t.scrollResNumber > 0) {
        void getApi().invoke('bbs:update-thread-index', t.boardUrl, t.threadId, {
          scrollTop: t.scrollTop,
          scrollResNumber: t.scrollResNumber,
          scrollResOffset: t.scrollResOffset,
        });
      }
    }
  },

  restoreTabs: async (prefetchedTabs?: readonly SavedTab[], activeThreadTabId?: string) => {
    try {
      const savedTabs = prefetchedTabs ?? (await getApi().invoke('tab:load'));
      pushStatus(
        'thread',
        'info',
        `[restoreTabs] tab.sav から ${String(savedTabs.length)} 件のタブを読み込み`,
      );
      for (const s of savedTabs) {
        pushStatus(
          'thread',
          'info',
          `[restoreTabs]   - ${s.title} (board=${s.boardUrl}, thread=${s.threadId})`,
        );
      }

      // Open all threads in parallel
      await Promise.all(
        savedTabs.map(async (saved) => {
          try {
            await get().openThread(saved.boardUrl, saved.threadId, saved.title);
            const { tabs } = get();
            const opened = tabs.find(
              (t) => t.boardUrl === saved.boardUrl && t.threadId === saved.threadId,
            );
            if (opened !== undefined) {
              pushStatus(
                'thread',
                'success',
                `[restoreTabs] 復元成功: ${saved.title} (${String(opened.responses.length)} レス)`,
              );
            } else {
              pushStatus(
                'thread',
                'error',
                `[restoreTabs] 復元失敗: openThread 後にタブが見つからない: ${saved.title}`,
              );
            }
          } catch (err) {
            pushStatus(
              'thread',
              'error',
              `[restoreTabs] 復元例外: ${saved.title}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }

          // Apply scrollTop/scrollResNumber from tab.sav (takes priority over Folder.idx
          // which may be stale if the tab was never explicitly closed).
          if (
            (saved.scrollTop !== undefined && saved.scrollTop > 0) ||
            (saved.scrollResNumber !== undefined && saved.scrollResNumber > 0)
          ) {
            const { tabs } = get();
            const opened = tabs.find(
              (t) => t.boardUrl === saved.boardUrl && t.threadId === saved.threadId,
            );
            if (opened !== undefined) {
              get().updateTabScroll(opened.id, saved.scrollTop ?? 0, saved.scrollResNumber);
            }
          }
        }),
      );

      // Re-sort tabs to match the saved order (parallel open is non-deterministic)
      const tabOrder = new Map(savedTabs.map((s, i) => [`${s.boardUrl}:${s.threadId}`, i]));
      set((state) => ({
        tabs: [...state.tabs].sort((a, b) => {
          const ai = tabOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
          const bi = tabOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
          return ai - bi;
        }),
      }));

      const finalTabs = get().tabs;
      pushStatus(
        'thread',
        'info',
        `[restoreTabs] 完了: ${String(finalTabs.length)}/${String(savedTabs.length)} タブ復元`,
      );

      // Restore active thread tab from the prefetched session data.
      // Previously this did a fresh session:load IPC call, but that was
      // racy: restoreSession (running in parallel) calls selectBoard which
      // overwrites session.json with only { selectedBoardUrl }, clobbering
      // the saved activeThreadTabId.  Using the caller-provided value
      // avoids this race condition.
      if (activeThreadTabId !== undefined) {
        const { tabs } = get();
        const target = tabs.find((t) => t.id === activeThreadTabId);
        if (target !== undefined) {
          set({ activeTabId: target.id });
          pushStatus('thread', 'info', `[restoreTabs] アクティブスレッドタブ復元: ${target.title}`);
        } else {
          pushStatus(
            'thread',
            'warn',
            `[restoreTabs] アクティブスレッドタブ "${activeThreadTabId}" が復元後のタブに見つからない`,
          );
        }
      }
    } catch (err) {
      pushStatus(
        'thread',
        'error',
        `[restoreTabs] 全体例外: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  },

  restoreSession: async (prefetchedSession?: SessionState) => {
    try {
      const session = prefetchedSession ?? (await getApi().invoke('session:load'));
      const { menu, externalBoards } = get();

      pushStatus('board', 'info', `[restoreSession] session.json 読み込み完了`);
      pushStatus(
        'board',
        'info',
        `[restoreSession]   selectedBoardUrl=${session.selectedBoardUrl ?? '(null)'}`,
      );
      pushStatus(
        'board',
        'info',
        `[restoreSession]   boardTabUrls=${session.boardTabUrls !== undefined ? JSON.stringify(session.boardTabUrls) : '(undefined)'}`,
      );
      pushStatus(
        'board',
        'info',
        `[restoreSession]   activeBoardTabId=${session.activeBoardTabId ?? '(undefined)'}`,
      );
      pushStatus(
        'board',
        'info',
        `[restoreSession]   menu=${menu !== null ? `${String(menu.categories.length)} categories` : '(null)'}`,
      );
      pushStatus(
        'board',
        'info',
        `[restoreSession]   externalBoards=${String(externalBoards.length)} 件: [${externalBoards.map((b) => b.url).join(', ')}]`,
      );

      if (menu === null) {
        pushStatus('board', 'warn', '[restoreSession] menu が null のため復元中断');
        return;
      }

      // Helper: find a Board from the menu or external boards by URL
      const findBoard = (url: string): Board | undefined => {
        for (const cat of menu.categories) {
          const b = cat.boards.find((board) => board.url === url);
          if (b !== undefined) {
            pushStatus(
              'board',
              'info',
              `[restoreSession] findBoard: "${url}" → メニュー "${cat.name}" で発見`,
            );
            return b;
          }
        }
        // Also search external boards (JBBS/Shitaraba, Machi BBS, etc.)
        const ext = externalBoards.find((b) => b.url === url);
        if (ext !== undefined) {
          pushStatus(
            'board',
            'info',
            `[restoreSession] findBoard: "${url}" → externalBoards で発見 (title="${ext.title}")`,
          );
          return ext;
        }
        pushStatus(
          'board',
          'error',
          `[restoreSession] findBoard: "${url}" → メニュー (${String(menu.categories.length)} cats) にも externalBoards (${String(externalBoards.length)} 件) にも見つからない`,
        );
        return undefined;
      };

      // Restore board tabs (F27) — all boards in parallel
      if (session.boardTabUrls !== undefined && session.boardTabUrls.length > 0) {
        const boardTabUrls = session.boardTabUrls;
        pushStatus(
          'board',
          'info',
          `[restoreSession] ${String(boardTabUrls.length)} 件の板タブを復元開始`,
        );
        const boards = boardTabUrls
          .map((url) => findBoard(url))
          .filter((b): b is Board => b !== undefined);
        pushStatus(
          'board',
          'info',
          `[restoreSession] findBoard で ${String(boards.length)}/${String(boardTabUrls.length)} 件が見つかった`,
        );

        await Promise.all(
          boards.map(async (board) => {
            try {
              await get().selectBoard(board);
              pushStatus(
                'board',
                'success',
                `[restoreSession] selectBoard 成功: ${board.title} (${board.url})`,
              );
            } catch (err) {
              pushStatus(
                'board',
                'error',
                `[restoreSession] selectBoard 失敗: ${board.title} (${board.url}): ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          }),
        );

        // Re-sort boardTabs to match the saved order
        const urlOrder = new Map(boardTabUrls.map((url, i) => [url, i]));
        set((state) => ({
          boardTabs: [...state.boardTabs].sort((a, b) => {
            const ai = urlOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
            const bi = urlOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
            return ai - bi;
          }),
        }));

        const finalBoardTabs = get().boardTabs;
        pushStatus(
          'board',
          'info',
          `[restoreSession] 板タブ復元完了: ${String(finalBoardTabs.length)} 件 [${finalBoardTabs.map((t) => t.board.title).join(', ')}]`,
        );

        // Restore active board tab
        if (session.activeBoardTabId !== undefined) {
          const { boardTabs } = get();
          const target = boardTabs.find((t) => t.id === session.activeBoardTabId);
          if (target !== undefined) {
            get().setActiveBoardTab(target.id);
            pushStatus(
              'board',
              'info',
              `[restoreSession] アクティブ板タブ復元: ${target.board.title}`,
            );
          } else {
            pushStatus(
              'board',
              'warn',
              `[restoreSession] アクティブ板タブ "${session.activeBoardTabId}" が復元後の板タブに見つからない`,
            );
          }
        }
      } else if (session.selectedBoardUrl !== null) {
        // Backward compatibility: restore single board
        pushStatus(
          'board',
          'info',
          `[restoreSession] 単一板復元モード: ${session.selectedBoardUrl}`,
        );
        const board = findBoard(session.selectedBoardUrl);
        if (board !== undefined) {
          await get().selectBoard(board);
        }
      } else {
        pushStatus('board', 'info', '[restoreSession] 復元対象の板タブなし');
      }
    } catch (err) {
      pushStatus(
        'board',
        'error',
        `[restoreSession] 全体例外: ${err instanceof Error ? err.message : String(err)}`,
      );
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
    try {
      localStorage.setItem('vbbb-external-boards', JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  },

  removeExternalBoard: (url: string) => {
    const { externalBoards } = get();
    const updated = externalBoards.filter((b) => b.url !== url);
    set({ externalBoards: updated });
    try {
      localStorage.setItem('vbbb-external-boards', JSON.stringify(updated));
    } catch {
      /* ignore */
    }
  },

  refreshSelectedBoard: async () => {
    const { selectedBoard } = get();
    if (selectedBoard === null) return;

    const boardTabId = selectedBoard.url;
    const boardTitle = selectedBoard.title;

    set((state) => ({
      boardTabs: state.boardTabs.map((t) =>
        t.id === boardTabId ? { ...t, subjectLoading: true, subjectError: null } : t,
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
            ? {
                ...t,
                subjects: result.threads,
                threadIndices: indices,
                subjectLoading: false,
                subjectError: null,
              }
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
      pushStatus(
        'board',
        'success',
        `${boardTitle}: ${String(result.threads.length)} スレッド (更新済み)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({
        boardTabs: state.boardTabs.map((t) =>
          t.id === boardTabId ? { ...t, subjectLoading: false, subjectError: message } : t,
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

      // ネットワークエラーや HTTP 4xx/5xx — 既存レスを保持してエラー表示
      if (result.status === DatFetchStatus.Error) {
        const errorMsg = result.errorMessage ?? 'Unknown error';
        set({ statusMessage: `スレ更新失敗: ${errorMsg}` });
        pushStatus('thread', 'error', `スレ更新失敗 (既存レス保持): ${errorMsg}`);
        return;
      }

      // DAT落ち (kako から取得成功)
      if (result.status === DatFetchStatus.Archived) {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, responses: result.responses, isDatFallen: true } : t,
          ),
          statusMessage: `${targetTab.title}: DAT落ち / 過去ログ取得 (${String(result.responses.length)} レス)`,
        }));
        pushStatus(
          'thread',
          'warn',
          `${targetTab.title}: DAT落ちを確認 (過去ログから ${String(result.responses.length)} レス取得)`,
        );
        return;
      }

      // DAT落ち (kako も見つからず — ローカルキャッシュまたは既存レスを保持)
      if (result.status === DatFetchStatus.DatFallen) {
        const preserved = result.responses.length > 0 ? result.responses : targetTab.responses;
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, responses: preserved, isDatFallen: true } : t,
          ),
          statusMessage: `${targetTab.title}: DAT落ち (${String(preserved.length)} レス)`,
        }));
        pushStatus(
          'thread',
          'warn',
          `${targetTab.title}: DAT落ちを確認 (過去ログなし・${String(preserved.length)} レス保持)`,
        );
        return;
      }

      set((state) => ({
        tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, responses: result.responses } : t)),
        statusMessage: `${targetTab.title}: ${String(result.responses.length)} レス (更新済み)`,
      }));
      pushStatus(
        'thread',
        'success',
        `${targetTab.title}: ${String(result.responses.length)} レス (更新済み)`,
      );

      // Persist lastModified from DAT fetch to Folder.idx and update in-memory threadIndices
      if (result.lastModified !== null) {
        const datFileName = `${targetTab.threadId}.dat`;
        void getApi().invoke('bbs:update-thread-index', targetTab.boardUrl, targetTab.threadId, {
          lastModified: result.lastModified,
        });
        set((state) => {
          const updateIdx = (indices: readonly ThreadIndex[]): readonly ThreadIndex[] =>
            indices.map((i) =>
              i.fileName === datFileName ? { ...i, lastModified: result.lastModified } : i,
            );
          return {
            threadIndices: updateIdx(state.threadIndices),
            boardTabs: state.boardTabs.map((bt) =>
              bt.id === state.activeBoardTabId
                ? { ...bt, threadIndices: updateIdx(bt.threadIndices) }
                : bt,
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

  toggleTabPostEditor: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              postEditorOpen: !t.postEditorOpen,
              postEditorInitialMessage: '',
              progPostOpen: false,
            }
          : t,
      ),
    }));
  },

  closeTabPostEditor: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId ? { ...t, postEditorOpen: false, postEditorInitialMessage: '' } : t,
      ),
    }));
  },

  openTabPostEditorWithQuote: (tabId: string, resNumber: number) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              postEditorOpen: true,
              postEditorInitialMessage: `>>${String(resNumber)}\n`,
              progPostOpen: false,
            }
          : t,
      ),
    }));
  },

  toggleTabAnalysis: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, analysisOpen: !t.analysisOpen } : t)),
    }));
  },

  toggleTabProgPost: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === tabId
          ? {
              ...t,
              progPostOpen: !t.progPostOpen,
              postEditorOpen: false,
              postEditorInitialMessage: '',
            }
          : t,
      ),
    }));
  },

  closeTabProgPost: (tabId: string) => {
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === tabId ? { ...t, progPostOpen: false } : t)),
    }));
  },

  updateBoardTabFilter: (tabId: string, filter: string) => {
    set((state) => ({
      boardTabs: state.boardTabs.map((t) => (t.id === tabId ? { ...t, filter } : t)),
    }));
  },

  updateBoardTabSort: (tabId: string, sortKey: BoardSortKey, sortDir: BoardSortDir) => {
    set((state) => ({
      boardTabs: state.boardTabs.map((t) => (t.id === tabId ? { ...t, sortKey, sortDir } : t)),
    }));
    // Persist sort settings keyed by boardUrl (tabId === boardUrl for board tabs)
    saveBoardSortSetting(tabId, sortKey, sortDir);
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

  openNewThreadEditor: () => {
    set({ newThreadEditorOpen: true });
  },

  closeNewThreadEditor: () => {
    set({ newThreadEditorOpen: false, nextThreadDraft: null });
  },

  openNewThreadEditorWithDraft: (subject: string, message: string) => {
    set({
      newThreadEditorOpen: true,
      nextThreadDraft: { subject, message },
    });
  },

  switchToAdjacentTab: (direction: 'prev' | 'next') => {
    const { tabs, activeTabId } = get();
    if (tabs.length === 0) return;
    const currentIndex = activeTabId !== null ? tabs.findIndex((t) => t.id === activeTabId) : -1;
    if (currentIndex < 0) return;
    const offset = direction === 'next' ? 1 : -1;
    const targetIndex = currentIndex + offset;
    if (targetIndex < 0 || targetIndex >= tabs.length) return;
    const target = tabs[targetIndex];
    if (target !== undefined) {
      set({ activeTabId: target.id });
    }
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
  // Include scrollResNumber so that scroll position updates are also persisted,
  // not only tab open/close events.
  const snapshot = state.tabs.map((t) => `${t.id}|${String(t.scrollResNumber)}`).join('\t');
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
