/**
 * Zustand store for a Board Tab renderer process.
 * Each board tab runs in its own WebContentsView with its own instance of this store.
 * Manages: subjects, threadIndices, filter, sort for one board.
 */
import { create } from 'zustand';
import type { Board, BoardSortDir, BoardSortKey, SubjectRecord, ThreadIndex } from '@shared/domain';
import type { NgRule } from '@shared/ng';
import type { FavTree } from '@shared/favorite';
import type { BoardTabInitData } from '@shared/view-ipc';

function getApi(): Window['electronApi'] {
  return window.electronApi;
}

const BOARD_SORT_SETTINGS_KEY = 'vbbb-board-sort-settings';

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

interface BoardTabState {
  tabId: string | null;
  board: Board | null;
  subjects: readonly SubjectRecord[];
  threadIndices: readonly ThreadIndex[];
  subjectLoading: boolean;
  subjectError: string | null;
  filter: string;
  sortKey: BoardSortKey;
  sortDir: BoardSortDir;

  ngRules: readonly NgRule[];
  favorites: FavTree;

  newThreadEditorOpen: boolean;

  // Actions
  initialize: (initData: BoardTabInitData) => Promise<void>;
  fetchSubjects: () => Promise<void>;
  setFilter: (filter: string) => void;
  setSort: (sortKey: BoardSortKey, sortDir: BoardSortDir) => void;
  openThread: (boardUrl: string, threadId: string, title: string) => void;
  setNgRules: (rules: readonly NgRule[]) => void;
  setFavorites: (tree: FavTree) => void;
  openNewThreadEditor: () => void;
  closeNewThreadEditor: () => void;
  refreshBoard: () => Promise<void>;
}

export const useBoardTabStore = create<BoardTabState>((set, get) => ({
  tabId: null,
  board: null,
  subjects: [],
  threadIndices: [],
  subjectLoading: false,
  subjectError: null,
  filter: '',
  sortKey: 'index',
  sortDir: 'asc',
  ngRules: [],
  favorites: { children: [] },
  newThreadEditorOpen: false,

  initialize: async (initData) => {
    const board = initData.board;
    const boardUrl = board.url;

    const savedSort = loadBoardSortSettings();
    const boardSort = savedSort[boardUrl];

    set({
      tabId: initData.tabId,
      board,
      sortKey: boardSort?.sortKey ?? 'index',
      sortDir: boardSort?.sortDir ?? 'asc',
    });

    // Fetch data in parallel
    const state = get();
    await state.fetchSubjects();

    // Also load NG rules and favorites
    const [rules, favTree] = await Promise.all([
      getApi().invoke('ng:get-rules'),
      getApi().invoke('fav:load'),
    ]);
    set({ ngRules: rules, favorites: favTree });
  },

  fetchSubjects: async () => {
    const { board } = get();
    if (board === null) return;

    set({ subjectLoading: true, subjectError: null });
    try {
      const [result, indices] = await Promise.all([
        getApi().invoke('bbs:fetch-subject', board.url),
        getApi().invoke('bbs:get-thread-index', board.url),
      ]);
      set({
        subjects: result.threads,
        threadIndices: indices,
        subjectLoading: false,
      });
    } catch (err) {
      set({ subjectError: String(err), subjectLoading: false });
    }
  },

  setFilter: (filter) => {
    set({ filter });
  },

  setSort: (sortKey, sortDir) => {
    const { board } = get();
    set({ sortKey, sortDir });
    if (board !== null) {
      saveBoardSortSetting(board.url, sortKey, sortDir);
    }
  },

  openThread: (boardUrl, threadId, title) => {
    void getApi().invoke('view:open-thread-request', boardUrl, threadId, title);
  },

  setNgRules: (rules) => {
    set({ ngRules: rules });
  },

  setFavorites: (tree) => {
    set({ favorites: tree });
  },

  openNewThreadEditor: () => {
    set({ newThreadEditorOpen: true });
  },

  closeNewThreadEditor: () => {
    set({ newThreadEditorOpen: false });
  },

  refreshBoard: async () => {
    await get().fetchSubjects();
  },
}));
