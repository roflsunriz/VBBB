/**
 * Zustand store for a Thread Tab renderer process.
 * Each thread tab runs in its own WebContentsView with its own instance.
 * Manages: responses, scroll state, kokomade, post editor state for one thread.
 */
import { create } from 'zustand';
import type { Res, KotehanConfig, SambaInfo } from '@shared/domain';
import { DatFetchStatus } from '@shared/domain';
import type { NgRule } from '@shared/ng';
import type { HighlightSettings } from '@shared/settings';
import type { PostHistoryEntry } from '@shared/post-history';
import type { FavTree } from '@shared/favorite';
import { DEFAULT_HIGHLIGHT_SETTINGS } from '@shared/settings';
import type { ThreadTabInitData } from '@shared/view-ipc';

function getApi(): Window['electronApi'] {
  return window.electronApi;
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
    // Fall through
  }
  return DEFAULT_HIGHLIGHT_SETTINGS;
}

interface ThreadTabState {
  tabId: string | null;
  boardUrl: string;
  threadId: string;
  title: string;
  responses: readonly Res[];
  loading: boolean;
  error: string | null;
  scrollTop: number;
  kokomade: number;
  isDatFallen: boolean;

  postEditorOpen: boolean;
  postEditorInitialMessage: string;
  analysisOpen: boolean;
  progPostOpen: boolean;

  kotehan: KotehanConfig;
  sambaInfo: SambaInfo;
  ngRules: readonly NgRule[];
  highlightSettings: HighlightSettings;
  postHistory: readonly PostHistoryEntry[];
  favorites: FavTree;

  // Actions
  initialize: (initData: ThreadTabInitData) => Promise<void>;
  fetchThread: () => Promise<void>;
  refreshThread: () => Promise<void>;
  updateScroll: (scrollTop: number) => void;
  updateKokomade: (kokomade: number) => void;
  togglePostEditor: () => void;
  closePostEditor: () => void;
  openPostEditorWithQuote: (resNumber: number) => void;
  toggleAnalysis: () => void;
  toggleProgPost: () => void;
  closeProgPost: () => void;
  setNgRules: (rules: readonly NgRule[]) => void;
  setHighlightSettings: (settings: HighlightSettings) => void;
  setFavorites: (tree: FavTree) => void;
}

export const useThreadTabStore = create<ThreadTabState>((set, get) => ({
  tabId: null,
  boardUrl: '',
  threadId: '',
  title: '',
  responses: [],
  loading: false,
  error: null,
  scrollTop: 0,
  kokomade: 0,
  isDatFallen: false,

  postEditorOpen: false,
  postEditorInitialMessage: '',
  analysisOpen: false,
  progPostOpen: false,

  kotehan: { name: '', mail: 'sage' },
  sambaInfo: { interval: 0, lastPostTime: null },
  ngRules: [],
  highlightSettings: loadHighlightSettings(),
  postHistory: [],
  favorites: { children: [] },

  initialize: async (initData) => {
    set({
      tabId: initData.tabId,
      boardUrl: initData.boardUrl,
      threadId: initData.threadId,
      title: initData.title,
    });

    // Fetch thread data and supporting data in parallel
    const api = getApi();
    const [datResult, kotehan, sambaInfo, ngRules, postHistory, favorites] = await Promise.all([
      api.invoke('bbs:fetch-dat', initData.boardUrl, initData.threadId),
      api.invoke('bbs:get-kotehan', initData.boardUrl),
      api.invoke('bbs:get-samba', initData.boardUrl),
      api.invoke('ng:get-rules'),
      api.invoke('post:load-history'),
      api.invoke('fav:load'),
    ]);

    const isDatFallen = datResult.status === DatFetchStatus.DatFallen;

    const resolvedTitle = initData.title;

    set({
      responses: datResult.responses,
      title: resolvedTitle,
      isDatFallen,
      loading: false,
      kotehan,
      sambaInfo,
      ngRules,
      postHistory,
      favorites,
    });

    // Record in browsing history
    void api.invoke('history:add', initData.boardUrl, initData.threadId, resolvedTitle);
  },

  fetchThread: async () => {
    const { boardUrl, threadId } = get();
    if (boardUrl.length === 0 || threadId.length === 0) return;

    set({ loading: true, error: null });
    try {
      const result = await getApi().invoke('bbs:fetch-dat', boardUrl, threadId);
      set({
        responses: result.responses,
        isDatFallen: result.status === DatFetchStatus.DatFallen,
        loading: false,
      });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  refreshThread: async () => {
    await get().fetchThread();
  },

  updateScroll: (scrollTop) => {
    set({ scrollTop });
  },

  updateKokomade: (kokomade) => {
    set({ kokomade });
    const { boardUrl, threadId } = get();
    if (boardUrl.length > 0 && threadId.length > 0) {
      void getApi().invoke('bbs:update-thread-index', boardUrl, threadId, { kokomade });
    }
  },

  togglePostEditor: () => {
    set((state) => ({ postEditorOpen: !state.postEditorOpen, postEditorInitialMessage: '' }));
  },

  closePostEditor: () => {
    set({ postEditorOpen: false, postEditorInitialMessage: '' });
  },

  openPostEditorWithQuote: (resNumber) => {
    set({ postEditorOpen: true, postEditorInitialMessage: `>>${String(resNumber)}\n` });
  },

  toggleAnalysis: () => {
    set((state) => ({ analysisOpen: !state.analysisOpen }));
  },

  toggleProgPost: () => {
    set((state) => ({ progPostOpen: !state.progPostOpen }));
  },

  closeProgPost: () => {
    set({ progPostOpen: false });
  },

  setNgRules: (rules) => {
    set({ ngRules: rules });
  },

  setHighlightSettings: (settings) => {
    set({ highlightSettings: settings });
    try {
      localStorage.setItem(HIGHLIGHT_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  },

  setFavorites: (tree) => {
    set({ favorites: tree });
  },
}));
