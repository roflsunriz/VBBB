/**
 * IPC channel definitions.
 * Maps channel names to their argument/result types.
 * Used by both main process and preload to ensure type safety.
 */
import type { AuthState } from './auth';
import type { StoredCookie } from './cookie';
import type { BBSMenu, DatFetchResult, KotehanConfig, PostParams, PostResult, SambaInfo, SubjectFetchResult, ThreadIndex } from './domain';
import type { FavNode, FavTree } from './favorite';
import type { NgRule } from './ng';
import type { ProxyConfig } from './proxy';

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
}

/** All IPC channel names */
export type IpcChannel = keyof IpcChannelMap;
