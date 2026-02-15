/**
 * Zustand store for BBS browser state.
 */
import { create } from 'zustand';
import type { BBSMenu, Board, DatFetchResult, Res, SubjectRecord, ThreadIndex } from '@shared/domain';

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

  // Status
  statusMessage: string;

  // Actions
  fetchMenu: () => Promise<void>;
  selectBoard: (board: Board) => Promise<void>;
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
      const result = await getApi().invoke('bbs:fetch-subject', board.url);
      const indices = await getApi().invoke('bbs:get-thread-index', board.url);
      set({
        subjects: result.threads,
        threadIndices: indices,
        subjectLoading: false,
        statusMessage: `${board.title}: ${String(result.threads.length)} スレッド`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ subjectLoading: false, subjectError: message, statusMessage: 'スレッド一覧の取得に失敗しました' });
    }
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
