/**
 * History and tab persistence types.
 */

/** A saved tab entry in tab.sav */
export interface SavedTab {
  readonly boardUrl: string;
  readonly threadId: string;
  readonly title: string;
}

/** A browsing history entry */
export interface BrowsingHistoryEntry {
  readonly boardUrl: string;
  readonly threadId: string;
  readonly title: string;
  readonly lastVisited: string;
}

/** Display range mode for thread view */
export const DisplayRange = {
  All: 'all',
  FromKokomade: 'from_kokomade',
  NewOnly: 'new_only',
  LastN: 'last_n',
} as const;
export type DisplayRange = (typeof DisplayRange)[keyof typeof DisplayRange];

/** Default number of posts to show in LastN mode */
export const DEFAULT_LAST_N = 50 as const;

/** Maximum browsing history entries */
export const MAX_HISTORY_ENTRIES = 200 as const;

/** Session state persisted across restarts */
export interface SessionState {
  readonly selectedBoardUrl: string | null;
  readonly activeThreadTabId?: string | undefined;
  /** URLs of open board tabs (for restoring board tabs on restart) */
  readonly boardTabUrls?: readonly string[] | undefined;
  /** Active board tab id (board URL) to restore after restart */
  readonly activeBoardTabId?: string | undefined;
}
