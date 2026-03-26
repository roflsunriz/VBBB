/**
 * Zustand store for the Shell renderer process.
 * Manages: BBS menu, favorites, NG rules, tab registry metadata,
 * highlight settings, and UI state (left pane, modals).
 */
import { create } from 'zustand';
import type { BBSMenu, Board } from '@shared/domain';
import type { FavNode, FavTree } from '@shared/favorite';
import type { NgRule } from '@shared/ng';
import type { HighlightSettings } from '@shared/settings';
import type { BoardTabMeta, ThreadTabMeta, TabRegistryState } from '@shared/view-ipc';
import { DEFAULT_HIGHLIGHT_SETTINGS } from '@shared/settings';
import type { PostHistoryEntry } from '@shared/post-history';
import type { StatusLogCategory, StatusLogLevel } from '@shared/status-log';
import { useStatusLogStore } from '../../stores/status-log-store';

function getApi(): Window['electronApi'] {
  return window.electronApi;
}

function pushStatus(category: StatusLogCategory, level: StatusLogLevel, message: string): void {
  useStatusLogStore.getState().pushLog(category, level, message);
}

interface ShellState {
  // BBS menu
  menu: BBSMenu | null;
  menuLoading: boolean;
  menuError: string | null;

  // Tab registry (synchronized from main via push events)
  boardTabs: readonly BoardTabMeta[];
  activeBoardTabId: string | null;
  threadTabs: readonly ThreadTabMeta[];
  activeThreadTabId: string | null;

  // Favorites
  favorites: FavTree;

  // NG rules
  ngRules: readonly NgRule[];

  // External boards
  externalBoards: readonly Board[];

  // Highlight settings
  highlightSettings: HighlightSettings;

  // Post history
  postHistory: readonly PostHistoryEntry[];

  // Related thread similarity
  relatedThreadSimilarity: number;

  // Status
  statusMessage: string;

  // Actions
  fetchMenu: () => Promise<BBSMenu | null>;
  fetchFavorites: () => Promise<FavTree>;
  fetchNgRules: () => Promise<readonly NgRule[]>;
  loadPostHistory: () => Promise<void>;
  addFavorite: (node: FavNode) => Promise<void>;
  removeFavorite: (nodeId: string) => Promise<void>;
  saveFavorites: (tree: FavTree) => Promise<void>;
  addFavFolder: (title: string) => Promise<void>;
  addFavSeparator: () => Promise<void>;
  moveFavToFolder: (nodeId: string, folderId: string) => Promise<void>;
  reorderFavorite: (
    dragNodeId: string,
    dropNodeId: string,
    position: 'before' | 'after' | 'inside',
  ) => Promise<void>;
  saveNgRules: (rules: readonly NgRule[]) => Promise<void>;
  addNgRule: (rule: NgRule) => Promise<void>;
  removeNgRule: (ruleId: string) => Promise<void>;
  selectBoard: (board: Board) => Promise<void>;
  openThread: (boardUrl: string, threadId: string, title: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  closeBoardTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  setActiveBoardTab: (tabId: string) => void;
  reorderBoardTabs: (fromIndex: number, toIndex: number) => void;
  reorderThreadTabs: (fromIndex: number, toIndex: number) => void;
  switchToAdjacentTab: (direction: 'prev' | 'next') => void;
  setStatusMessage: (message: string) => void;
  setRelatedThreadSimilarity: (value: number) => void;
  addExternalBoard: (board: Board) => void;
  removeExternalBoard: (url: string) => void;
  updateTabRegistry: (registry: TabRegistryState) => void;
  setHighlightSettings: (settings: HighlightSettings) => void;
}

const HIGHLIGHT_SETTINGS_KEY = 'vbbb-highlight-settings';
const RELATED_THREAD_SIMILARITY_KEY = 'vbbb-related-thread-similarity';
const RELATED_THREAD_SIMILARITY_MIN = 40;
const RELATED_THREAD_SIMILARITY_MAX = 95;
const RELATED_THREAD_SIMILARITY_DEFAULT = 80;

function clampSimilarity(value: number): number {
  return Math.max(
    RELATED_THREAD_SIMILARITY_MIN,
    Math.min(RELATED_THREAD_SIMILARITY_MAX, Math.round(value)),
  );
}

function loadSimilarity(): number {
  try {
    const raw = localStorage.getItem(RELATED_THREAD_SIMILARITY_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return clampSimilarity(parsed);
    }
  } catch {
    /* ignore */
  }
  return RELATED_THREAD_SIMILARITY_DEFAULT;
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
    // Fall through
  }
  return DEFAULT_HIGHLIGHT_SETTINGS;
}

export const useShellStore = create<ShellState>((set, get) => ({
  menu: null,
  menuLoading: false,
  menuError: null,
  boardTabs: [],
  activeBoardTabId: null,
  threadTabs: [],
  activeThreadTabId: null,
  favorites: { children: [] },
  ngRules: [],
  externalBoards: [],
  highlightSettings: loadHighlightSettings(),
  postHistory: [],
  relatedThreadSimilarity: loadSimilarity(),
  statusMessage: '',

  fetchMenu: async () => {
    set({ menuLoading: true, menuError: null, statusMessage: '板一覧を取得中...' });
    pushStatus('board', 'info', '板一覧を取得中...');
    try {
      const menu = await getApi().invoke('bbs:fetch-menu');
      set({
        menu,
        menuLoading: false,
        statusMessage: `${String(menu.categories.length)} カテゴリを読み込みました`,
      });
      pushStatus('board', 'success', `板一覧取得完了: ${String(menu.categories.length)} カテゴリ`);
      return menu;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ menuError: message, menuLoading: false, statusMessage: '板一覧の取得に失敗しました' });
      pushStatus('board', 'error', `板一覧取得失敗: ${message}`);
      return null;
    }
  },

  fetchFavorites: async () => {
    pushStatus('board', 'info', 'お気に入りを読み込み中...');
    const tree = await getApi().invoke('fav:load');
    set({ favorites: tree });
    pushStatus('board', 'success', `お気に入り読み込み完了: ${String(tree.children.length)} 件`);
    return tree;
  },

  fetchNgRules: async () => {
    pushStatus('board', 'info', 'NGルールを読み込み中...');
    const rules = await getApi().invoke('ng:get-rules');
    set({ ngRules: rules });
    pushStatus('board', 'success', `NGルール読み込み完了: ${String(rules.length)} 件`);
    return rules;
  },

  loadPostHistory: async () => {
    const history = await getApi().invoke('post:load-history');
    set({ postHistory: history });
    pushStatus('board', 'info', `投稿履歴読み込み完了: ${String(history.length)} 件`);
  },

  addFavorite: async (node) => {
    await getApi().invoke('fav:add', node);
    const tree = await getApi().invoke('fav:load');
    set({ favorites: tree });
    pushStatus('board', 'success', 'お気に入りに追加しました');
  },

  removeFavorite: async (nodeId) => {
    await getApi().invoke('fav:remove', nodeId);
    const tree = await getApi().invoke('fav:load');
    set({ favorites: tree });
    pushStatus('board', 'info', 'お気に入りから削除しました');
  },

  saveFavorites: async (tree) => {
    await getApi().invoke('fav:save', tree);
    set({ favorites: tree });
  },

  addFavFolder: async (title) => {
    await getApi().invoke('fav:add-folder', title);
    const tree = await getApi().invoke('fav:load');
    set({ favorites: tree });
  },

  addFavSeparator: async () => {
    await getApi().invoke('fav:add-separator');
    const tree = await getApi().invoke('fav:load');
    set({ favorites: tree });
  },

  moveFavToFolder: async (nodeId, folderId) => {
    await getApi().invoke('fav:move-to-folder', nodeId, folderId);
    const tree = await getApi().invoke('fav:load');
    set({ favorites: tree });
  },

  reorderFavorite: async (dragNodeId, dropNodeId, position) => {
    await getApi().invoke('fav:reorder', dragNodeId, dropNodeId, position);
    const tree = await getApi().invoke('fav:load');
    set({ favorites: tree });
  },

  saveNgRules: async (rules) => {
    await getApi().invoke('ng:set-rules', rules);
    set({ ngRules: rules });
    pushStatus('board', 'success', `NGルールを保存しました (${String(rules.length)} 件)`);
  },

  addNgRule: async (rule) => {
    await getApi().invoke('ng:add-rule', rule);
    const rules = await getApi().invoke('ng:get-rules');
    set({ ngRules: rules });
    pushStatus('board', 'success', 'NGルールを追加しました');
  },

  removeNgRule: async (ruleId) => {
    await getApi().invoke('ng:remove-rule', ruleId);
    const rules = await getApi().invoke('ng:get-rules');
    set({ ngRules: rules });
    pushStatus('board', 'info', 'NGルールを削除しました');
  },

  selectBoard: async (board) => {
    pushStatus('board', 'info', `板タブを開いています: ${board.title}`);
    await getApi().invoke('view:create-board-tab', board.url, board.title, board.boardType);
    pushStatus('board', 'success', `板タブを開きました: ${board.title}`);
  },

  openThread: async (boardUrl, threadId, title) => {
    pushStatus('thread', 'info', `スレッドタブを開いています: ${title}`);
    await getApi().invoke('view:create-thread-tab', boardUrl, threadId, title);
    pushStatus('thread', 'success', `スレッドタブを開きました: ${title}`);
  },

  closeTab: (tabId) => {
    void getApi().invoke('view:close-thread-tab', tabId);
    pushStatus('thread', 'info', 'スレッドタブを閉じました');
  },

  closeBoardTab: (tabId) => {
    void getApi().invoke('view:close-board-tab', tabId);
    pushStatus('board', 'info', '板タブを閉じました');
  },

  setActiveTab: (tabId) => {
    void getApi().invoke('view:switch-thread-tab', tabId);
  },

  setActiveBoardTab: (tabId) => {
    void getApi().invoke('view:switch-board-tab', tabId);
  },

  reorderBoardTabs: (fromIndex, toIndex) => {
    void getApi().invoke('view:reorder-board-tabs', fromIndex, toIndex);
  },

  reorderThreadTabs: (fromIndex, toIndex) => {
    void getApi().invoke('view:reorder-thread-tabs', fromIndex, toIndex);
  },

  switchToAdjacentTab: (direction) => {
    const { threadTabs, activeThreadTabId } = get();
    if (threadTabs.length === 0 || activeThreadTabId === null) return;
    const currentIndex = threadTabs.findIndex((t) => t.id === activeThreadTabId);
    if (currentIndex < 0) return;
    const nextIndex =
      direction === 'prev'
        ? (currentIndex - 1 + threadTabs.length) % threadTabs.length
        : (currentIndex + 1) % threadTabs.length;
    const nextTab = threadTabs[nextIndex];
    if (nextTab !== undefined) {
      void getApi().invoke('view:switch-thread-tab', nextTab.id);
    }
  },

  setStatusMessage: (message) => {
    set({ statusMessage: message });
  },

  setRelatedThreadSimilarity: (value) => {
    const clamped = clampSimilarity(value);
    set({ relatedThreadSimilarity: clamped });
    try {
      localStorage.setItem(RELATED_THREAD_SIMILARITY_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  },

  addExternalBoard: (board) => {
    set((state) => ({
      externalBoards: [...state.externalBoards, board],
    }));
  },

  removeExternalBoard: (url) => {
    set((state) => ({
      externalBoards: state.externalBoards.filter((b) => b.url !== url),
    }));
  },

  updateTabRegistry: (registry) => {
    set({
      boardTabs: registry.boardTabs,
      activeBoardTabId: registry.activeBoardTabId,
      threadTabs: registry.threadTabs,
      activeThreadTabId: registry.activeThreadTabId,
    });
  },

  setHighlightSettings: (settings) => {
    set({ highlightSettings: settings });
    try {
      localStorage.setItem(HIGHLIGHT_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  },
}));
