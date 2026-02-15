/**
 * Zustand store for BBS browser state.
 */
import { create } from 'zustand';
import type { BBSMenu, Board, DatFetchResult, KotehanConfig, Res, SambaInfo, SubjectRecord, ThreadIndex } from '@shared/domain';
import type { FavNode, FavTree } from '@shared/favorite';
import type { NgRule } from '@shared/ng';

/** Tab state for viewing threads */
interface ThreadTab {
  readonly id: string;
  readonly boardUrl: string;
  readonly threadId: string;
  readonly title: string;
  readonly responses: readonly Res[];
}

interface BBSState {
  // Board tree
  menu: BBSMenu | null;
  menuLoading: boolean;
  menuError: string | null;

  // Selected board
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

  // Kotehan (per-board default name/mail)
  kotehan: KotehanConfig;

  // Samba timer
  sambaInfo: SambaInfo;

  // NG rules
  ngRules: readonly NgRule[];
  ngEditorOpen: boolean;

  // Favorites
  favorites: FavTree;
  favoritesOpen: boolean;

  // Status
  statusMessage: string;

  // Actions
  fetchMenu: () => Promise<void>;
  selectBoard: (board: Board) => Promise<void>;
  fetchKotehan: (boardUrl: string) => Promise<void>;
  saveKotehan: (boardUrl: string, config: KotehanConfig) => Promise<void>;
  fetchSambaInfo: (boardUrl: string) => Promise<void>;
  recordSambaTime: (boardUrl: string) => Promise<void>;
  fetchNgRules: () => Promise<void>;
  addNgRule: (rule: NgRule) => Promise<void>;
  removeNgRule: (ruleId: string) => Promise<void>;
  toggleNgEditor: () => void;
  fetchFavorites: () => Promise<void>;
  addFavorite: (node: FavNode) => Promise<void>;
  removeFavorite: (nodeId: string) => Promise<void>;
  saveFavorites: (tree: FavTree) => Promise<void>;
  toggleFavorites: () => void;
  openThread: (boardUrl: string, threadId: string, title: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  togglePostEditor: () => void;
  setStatusMessage: (message: string) => void;
}

function getApi(): Window['electronApi'] {
  return window.electronApi;
}

export const useBBSStore = create<BBSState>((set, get) => ({
  menu: null,
  menuLoading: false,
  menuError: null,

  selectedBoard: null,
  subjects: [],
  threadIndices: [],
  subjectLoading: false,
  subjectError: null,

  tabs: [],
  activeTabId: null,

  postEditorOpen: false,

  kotehan: { name: '', mail: '' },

  sambaInfo: { interval: 0, lastPostTime: null },

  ngRules: [],
  ngEditorOpen: false,

  favorites: { children: [] },
  favoritesOpen: false,

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
    set({
      selectedBoard: board,
      subjectLoading: true,
      subjectError: null,
      statusMessage: `${board.title} のスレッド一覧を取得中...`,
    });
    try {
      const [result, indices, kotehan, sambaInfo] = await Promise.all([
        getApi().invoke('bbs:fetch-subject', board.url),
        getApi().invoke('bbs:get-thread-index', board.url),
        getApi().invoke('bbs:get-kotehan', board.url),
        getApi().invoke('bbs:get-samba', board.url),
      ]);
      set({
        subjects: result.threads,
        threadIndices: indices,
        kotehan,
        sambaInfo,
        subjectLoading: false,
        statusMessage: `${board.title}: ${String(result.threads.length)} スレッド`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ subjectLoading: false, subjectError: message, statusMessage: 'スレッド一覧の取得に失敗しました' });
    }
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
    set((state) => ({ ngEditorOpen: !state.ngEditorOpen }));
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
    const { tabs } = get();
    const existingTab = tabs.find((t) => t.threadId === threadId && t.boardUrl === boardUrl);
    if (existingTab !== undefined) {
      set({ activeTabId: existingTab.id });
      return;
    }

    const tabId = `${boardUrl}:${threadId}`;
    set({ statusMessage: `${title} を読み込み中...` });

    try {
      const result: DatFetchResult = await getApi().invoke('bbs:fetch-dat', boardUrl, threadId);
      const newTab: ThreadTab = {
        id: tabId,
        boardUrl,
        threadId,
        title,
        responses: result.responses,
      };
      set((state) => ({
        tabs: [...state.tabs, newTab],
        activeTabId: tabId,
        statusMessage: `${title}: ${String(result.responses.length)} レス`,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ statusMessage: `読み込み失敗: ${message}` });
    }
  },

  closeTab: (tabId: string) => {
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

  togglePostEditor: () => {
    set((state) => ({ postEditorOpen: !state.postEditorOpen }));
  },

  setStatusMessage: (message: string) => {
    set({ statusMessage: message });
  },
}));
