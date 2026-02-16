/**
 * IPC channel definitions.
 * Maps channel names to their argument/result types.
 * Used by both main process and preload to ensure type safety.
 */
import type { AuthState } from './auth';
import type { StoredCookie } from './cookie';
import type { BBSMenu, DatFetchResult, KotehanConfig, PostParams, PostResult, SambaInfo, SubjectFetchResult, ThreadIndex } from './domain';
import type { FavNode, FavTree } from './favorite';
import type { BrowsingHistoryEntry, SavedTab } from './history';
import type { NgRule } from './ng';
import type { PostHistoryEntry } from './post-history';
import type { ProxyConfig } from './proxy';
import type { RoundBoardEntry, RoundItemEntry, RoundTimerConfig } from './round';
import type { MenuAction } from './menu';
import type { LocalSearchQuery, RemoteSearchQuery, RemoteSearchResult, SearchResult } from './search';

export interface IpcChannelMap {
  /** Fetch BBS menu (板一覧) */
  'bbs:fetch-menu': {
    args: [];
    result: BBSMenu;
  };
  /** Fetch subject.txt (スレ一覧) */
  'bbs:fetch-subject': {
    args: [boardUrl: string];
    result: SubjectFetchResult;
  };
  /** Fetch DAT (スレ本文) */
  'bbs:fetch-dat': {
    args: [boardUrl: string, threadId: string];
    result: DatFetchResult;
  };
  /** Post a response (投稿) */
  'bbs:post': {
    args: [params: PostParams];
    result: PostResult;
  };
  /** Get local thread index (Folder.idx) */
  'bbs:get-thread-index': {
    args: [boardUrl: string];
    result: readonly ThreadIndex[];
  };
  /** Get app data directory */
  'app:get-data-dir': {
    args: [];
    result: string;
  };
  /** Get kotehan (default name/mail) for a board */
  'bbs:get-kotehan': {
    args: [boardUrl: string];
    result: KotehanConfig;
  };
  /** Set kotehan for a board */
  'bbs:set-kotehan': {
    args: [boardUrl: string, config: KotehanConfig];
    result: void;
  };
  /** Get Samba timer info for a board */
  'bbs:get-samba': {
    args: [boardUrl: string];
    result: SambaInfo;
  };
  /** Record post time for Samba timer */
  'bbs:record-samba': {
    args: [boardUrl: string];
    result: void;
  };
  /** Get all NG rules */
  'ng:get-rules': {
    args: [];
    result: readonly NgRule[];
  };
  /** Save all NG rules (replace) */
  'ng:set-rules': {
    args: [rules: readonly NgRule[]];
    result: void;
  };
  /** Add a single NG rule */
  'ng:add-rule': {
    args: [rule: NgRule];
    result: void;
  };
  /** Remove a NG rule by id */
  'ng:remove-rule': {
    args: [ruleId: string];
    result: void;
  };
  /** Load favorites tree */
  'fav:load': {
    args: [];
    result: FavTree;
  };
  /** Save full favorites tree */
  'fav:save': {
    args: [tree: FavTree];
    result: void;
  };
  /** Add a favorite item to root */
  'fav:add': {
    args: [node: FavNode];
    result: void;
  };
  /** Remove a favorite by id */
  'fav:remove': {
    args: [nodeId: string];
    result: void;
  };
  /** Get proxy configuration */
  'proxy:get-config': {
    args: [];
    result: ProxyConfig;
  };
  /** Save proxy configuration */
  'proxy:set-config': {
    args: [config: ProxyConfig];
    result: void;
  };
  /** Get cookies for a URL */
  'cookie:get-for-url': {
    args: [url: string];
    result: readonly StoredCookie[];
  };
  /** Set a cookie */
  'cookie:set': {
    args: [cookie: StoredCookie];
    result: void;
  };
  /** Remove a cookie by name and domain */
  'cookie:remove': {
    args: [name: string, domain: string];
    result: void;
  };
  /** Save cookies to disk */
  'cookie:save': {
    args: [];
    result: void;
  };
  /** Get current auth state (UPLIFT, Be, Donguri) */
  'auth:get-state': {
    args: [];
    result: AuthState;
  };
  /** UPLIFT login */
  'auth:uplift-login': {
    args: [userId: string, password: string];
    result: { success: boolean; message: string };
  };
  /** UPLIFT logout */
  'auth:uplift-logout': {
    args: [];
    result: void;
  };
  /** Be login */
  'auth:be-login': {
    args: [mail: string, password: string];
    result: { success: boolean; message: string };
  };
  /** Be logout */
  'auth:be-logout': {
    args: [];
    result: void;
  };
  /** Update a single thread's index entry (kokomade, scrollTop, etc.) */
  'bbs:update-thread-index': {
    args: [boardUrl: string, threadId: string, updates: { kokomade?: number; scrollTop?: number }];
    result: void;
  };
  /** Load saved tabs */
  'tab:load': {
    args: [];
    result: readonly SavedTab[];
  };
  /** Save tabs */
  'tab:save': {
    args: [tabs: readonly SavedTab[]];
    result: void;
  };
  /** Load browsing history */
  'history:load': {
    args: [];
    result: readonly BrowsingHistoryEntry[];
  };
  /** Add a history entry */
  'history:add': {
    args: [boardUrl: string, threadId: string, title: string];
    result: void;
  };
  /** Clear browsing history */
  'history:clear': {
    args: [];
    result: void;
  };
  /** Local DAT search */
  'search:local': {
    args: [query: LocalSearchQuery];
    result: readonly SearchResult[];
  };
  /** Remote search via dig.2ch.net */
  'search:remote': {
    args: [query: RemoteSearchQuery];
    result: readonly RemoteSearchResult[];
  };
  /** Get round board list */
  'round:get-boards': {
    args: [];
    result: readonly RoundBoardEntry[];
  };
  /** Get round item list */
  'round:get-items': {
    args: [];
    result: readonly RoundItemEntry[];
  };
  /** Add round board entry */
  'round:add-board': {
    args: [entry: RoundBoardEntry];
    result: void;
  };
  /** Remove round board entry */
  'round:remove-board': {
    args: [url: string];
    result: void;
  };
  /** Add round item entry */
  'round:add-item': {
    args: [entry: RoundItemEntry];
    result: void;
  };
  /** Remove round item entry */
  'round:remove-item': {
    args: [url: string, fileName: string];
    result: void;
  };
  /** Get round timer config */
  'round:get-timer': {
    args: [];
    result: RoundTimerConfig;
  };
  /** Set round timer config */
  'round:set-timer': {
    args: [config: RoundTimerConfig];
    result: void;
  };
  /** Execute round (manual trigger) */
  'round:execute': {
    args: [];
    result: void;
  };
  /** Save a post to history */
  'post:save-history': {
    args: [entry: PostHistoryEntry];
    result: void;
  };
  /** Wait for the next menu action (long-poll from renderer) */
  'menu:wait-action': {
    args: [];
    result: MenuAction;
  };
}

/** All IPC channel names */
export type IpcChannel = keyof IpcChannelMap;
