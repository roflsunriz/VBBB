/**
 * IPC channel definitions.
 * Maps channel names to their argument/result types.
 * Used by both main process and preload to ensure type safety.
 */
import type { AuthState } from './auth';
import type { StoredCookie } from './cookie';
import type { DiagLogEntry, DiagLogLevel } from './diagnostic';
import type {
  BBSMenu,
  DatFetchResult,
  KotehanConfig,
  PostParams,
  PostResult,
  SambaInfo,
  SubjectFetchResult,
  ThreadIndex,
} from './domain';
import type { FavNode, FavTree } from './favorite';
import type { BrowsingHistoryEntry, SavedTab, SessionState } from './history';
import type { NgRule } from './ng';
import type { PostHistoryEntry } from './post-history';
import type { ProxyConfig } from './proxy';
import type { RoundBoardEntry, RoundItemEntry, RoundTimerConfig } from './round';
import type { MenuAction } from './menu';
import type {
  LocalSearchAllQuery,
  LocalSearchAllResult,
  LocalSearchQuery,
  SearchResult,
} from './search';
import type { UpdateCheckResult } from './update';

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
  /** Resolve external board title from stable sources */
  'bbs:resolve-board-title': {
    args: [boardUrl: string];
    result: string | null;
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
  /** Add a new folder to favorites root */
  'fav:add-folder': {
    args: [title: string];
    result: void;
  };
  /** Add a separator to favorites root */
  'fav:add-separator': {
    args: [];
    result: void;
  };
  /** Move a node into a folder */
  'fav:move-to-folder': {
    args: [nodeId: string, folderId: string];
    result: void;
  };
  /** Reorder a node relative to another */
  'fav:reorder': {
    args: [dragNodeId: string, dropNodeId: string, position: 'before' | 'after' | 'inside'];
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
  /** Refresh donguri state from donguri.5ch.net */
  'auth:donguri-refresh': {
    args: [];
    result: AuthState['donguri'];
  };
  /** Donguri login with mail/password */
  'auth:donguri-login': {
    args: [mail: string, password: string];
    result: { success: boolean; message: string; state: AuthState['donguri'] };
  };
  /** Update a single thread's index entry (kokomade, scrollTop, lastModified, etc.) */
  'bbs:update-thread-index': {
    args: [
      boardUrl: string,
      threadId: string,
      updates: {
        kokomade?: number;
        scrollTop?: number;
        scrollResNumber?: number;
        scrollResOffset?: number;
        lastModified?: string | null;
      },
    ];
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
  /** Load session state */
  'session:load': {
    args: [];
    result: SessionState;
  };
  /** Save session state */
  'session:save': {
    args: [state: SessionState];
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
  /** Cross-board local search (all boards / subjects / DAT caches) */
  'search:local-all': {
    args: [query: LocalSearchAllQuery];
    result: readonly LocalSearchAllResult[];
  };
  /** Build remote search URL for ff5ch.syoboi.jp */
  'search:remote-url': {
    args: [keywords: string];
    result: string;
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
  /** Clear cookies/auth state used by post retry recovery */
  'post:clear-related-data': {
    args: [];
    result: { clearedCookies: number };
  };
  /** Load post history */
  'post:load-history': {
    args: [];
    result: readonly PostHistoryEntry[];
  };
  /** Wait for the next menu action (long-poll from renderer) */
  'menu:wait-action': {
    args: [];
    result: MenuAction;
  };
  /** Save image from URL to disk */
  'image:save': {
    args: [imageUrl: string, suggestedName: string];
    result: { saved: boolean; path: string };
  };
  /** Save multiple images to a user-selected folder */
  'image:save-bulk': {
    args: [urls: readonly string[]];
    result: { saved: number; folder: string };
  };
  /** Open URL in external browser */
  'shell:open-external': {
    args: [url: string];
    result: void;
  };
  /** Get all cookies grouped by domain */
  'cookie:get-all': {
    args: [];
    result: readonly StoredCookie[];
  };
  /** Get current user agent */
  'config:get-user-agent': {
    args: [];
    result: string;
  };
  /** Set custom user agent */
  'config:set-user-agent': {
    args: [userAgent: string];
    result: void;
  };
  /** Add a single entry to the diagnostic log buffer (from renderer) */
  'diag:add-log': {
    args: [level: DiagLogLevel, tag: string, message: string];
    result: void;
  };
  /** Get diagnostic log buffer */
  'diag:get-logs': {
    args: [];
    result: readonly DiagLogEntry[];
  };
  /** Clear diagnostic log buffer */
  'diag:clear-logs': {
    args: [];
    result: void;
  };
  /** Save diagnostic logs to a file via save dialog */
  'diag:save-logs': {
    args: [content: string];
    result: { saved: boolean; path: string };
  };
  /** Lookup IP address WhoIs/geolocation via ip-api.com (main process) */
  'ip:lookup': {
    args: [ip: string];
    result: IpLookupResult;
  };
  /** Save DSL script to a file via save dialog */
  'dsl:save-file': {
    args: [content: string, suggestedName: string];
    result: { saved: boolean; path: string };
  };
  /** Check for a new version via GitHub Releases API */
  'update:check': {
    args: [];
    result: UpdateCheckResult;
  };
  /** Download the latest installer and launch it (progress via update:progress push event) */
  'update:download-and-install': {
    args: [];
    result: void;
  };
}

/** IP WhoIs/geolocation lookup result */
export interface IpLookupResult {
  readonly ip: string;
  readonly country: string;
  readonly region: string;
  readonly city: string;
  readonly isp: string;
  readonly org: string;
  readonly as: string;
}

/** All IPC channel names */
export type IpcChannel = keyof IpcChannelMap;

/**
 * Synchronous IPC channel definitions.
 * Used only for critical saves during beforeunload where async calls may be lost.
 */
export interface IpcSyncChannelMap {
  /** Save tabs synchronously (beforeunload) */
  'tab:save-sync': {
    args: [tabs: readonly SavedTab[]];
    result: void;
  };
  /** Save session state synchronously (beforeunload) */
  'session:save-sync': {
    args: [state: SessionState];
    result: void;
  };
}
