/**
 * Zustand store for BBS browser state.
 */
import { create } from 'zustand';
import type { BBSMenu, Board, DatFetchResult, KotehanConfig, Res, SambaInfo, SubjectRecord, ThreadIndex } from '@shared/domain';
import type { FavNode, FavTree } from '@shared/favorite';
import type { BrowsingHistoryEntry, DisplayRange } from '@shared/history';
import type { NgRule } from '@shared/ng';
import type { PostHistoryEntry } from '@shared/post-history';
import type { HighlightSettings } from '@shared/settings';
import { DEFAULT_HIGHLIGHT_SETTINGS } from '@shared/settings';

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
  restoreTabs: () => Promise<void>;
  restoreSession: () => Promise<void>;
  loadBrowsingHistory: () => Promise<void>;
  refreshActiveThread: () => Promise<void>;
  loadPostHistory: () => Promise<void>;
  setHighlightSettings: (settings: HighlightSettings) => void;
  togglePostEditor: () => void;
  closePostEditor: () => void;
  openPostEditorWithQuote: (resNumber: number) => void;
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

  browsingHistory: [],

  postHistory: [],

  highlightSettings: loadHighlightSettings(),

  statusMessage: 'Ready',

  fetchMenu: async () => {
    set({ menuLoading: true, menuError: null, statusMessage: '板一覧を取得中...' });
    try {
      const menu = await getApi().invoke('bbs:fetch-menu');
      set({ menu, menuLoading: false, statusMessage: `${String(menu.categories.length)} カテゴリを読み込みました` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ menuLoading: false, menuError: message, statusMessage: '板一覧の取得に失敗しました' });
    }
  },

  selectBoard: async (board: Board) => {
    const boardTabId = board.url;

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

    set({ statusMessage: `${title} を読み込み中...` });

    try {
      const result: DatFetchResult = await getApi().invoke('bbs:fetch-dat', boardUrl, threadId);

      const { threadIndices } = get();
      const idx = threadIndices.find((i) => i.fileName === `${threadId}.dat`);
      const kokomade = idx?.kokomade ?? -1;
      const scrollTop = idx?.scrollTop ?? 0;

      const newTab: ThreadTab = {
        id: tabId,
        boardUrl,
        threadId,
        title,
        responses: result.responses,
        scrollTop,
        kokomade,
        displayRange: 'all',
      };
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: tabId,
        statusMessage: `${title}: ${String(result.responses.length)} レス`,
      }));

      void getApi().invoke('history:add', boardUrl, threadId, title);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ statusMessage: `読み込み失敗: ${message}` });
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
    }));
    await getApi().invoke('tab:save', savedTabs);
  },

  restoreTabs: async () => {
    try {
      const savedTabs = await getApi().invoke('tab:load');
      for (const tab of savedTabs) {
        await get().openThread(tab.boardUrl, tab.threadId, tab.title);
      }
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

  restoreSession: async () => {
    try {
      const session = await getApi().invoke('session:load');
      if (session.selectedBoardUrl !== null) {
        const { menu } = get();
        if (menu !== null) {
          for (const cat of menu.categories) {
            const board = cat.boards.find((b) => b.url === session.selectedBoardUrl);
            if (board !== undefined) {
              await get().selectBoard(board);
              return;
            }
          }
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
    const { tabs, activeTabId } = get();
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (activeTab === undefined) return;

    try {
      const result = await getApi().invoke('bbs:fetch-dat', activeTab.boardUrl, activeTab.threadId);
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === activeTab.id ? { ...t, responses: result.responses } : t,
        ),
        statusMessage: `${activeTab.title}: ${String(result.responses.length)} レス (更新済み)`,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ statusMessage: `スレ更新失敗: ${message}` });
    }
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

  setStatusMessage: (message: string) => {
    set({ statusMessage: message });
  },
}));
