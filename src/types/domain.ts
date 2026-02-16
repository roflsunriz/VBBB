/**
 * Domain types for the BBS browser.
 * Corresponds to the hierarchical model: BBS > Category > Board > ThreadItem > Res
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Thread age/sage status */
export const AgeSage = {
  None: 0,
  Age: 1,
  Sage: 2,
  New: 3,
  Archive: 4,
} as const;
export type AgeSage = (typeof AgeSage)[keyof typeof AgeSage];

/** Board type */
export const BoardType = {
  /** 5ch / 2ch (Shift_JIS) */
  Type2ch: '2ch',
  /** Shitaraba (Shift_JIS read, EUC-JP write) */
  Shitaraba: 'shitaraba',
  /** JBBS / Machi BBS (EUC-JP) */
  JBBS: 'jbbs',
} as const;
export type BoardType = (typeof BoardType)[keyof typeof BoardType];

/** Post result type from server */
export const PostResultType = {
  OK: 'grtOK',
  Cookie: 'grtCookie',
  Check: 'grtCheck',
  Donguri: 'grtDonguri',
  DonguriError: 'grtDngBroken',
  Ninpou: 'grtNinpou',
  Suiton: 'grtSuiton',
  Error: 'grtError',
} as const;
export type PostResultType = (typeof PostResultType)[keyof typeof PostResultType];

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** A single category containing boards */
export interface Category {
  readonly name: string;
  readonly boards: readonly Board[];
}

/** A board (板) */
export interface Board {
  /** Display title (e.g. "ニュース速報+") */
  readonly title: string;
  /** Full URL (e.g. "https://news.5ch.net/newsplus/") */
  readonly url: string;
  /** Board ID derived from URL (e.g. "newsplus") */
  readonly bbsId: string;
  /** Server URL (e.g. "https://news.5ch.net/") */
  readonly serverUrl: string;
  /** Board type */
  readonly boardType: BoardType;
  /** JBBS directory (e.g. "game", "news") — only for JBBS boards */
  readonly jbbsDir?: string | undefined;
}

/** One line of subject.txt (TSubjectRec) */
export interface SubjectRecord {
  /** DAT filename (e.g. "1234567890.dat") */
  readonly fileName: string;
  /** Thread title */
  readonly title: string;
  /** Server-reported response count */
  readonly count: number;
}

/** A thread item in local index (TIndexRec / Folder.idx line) */
export interface ThreadIndex {
  /** Display order number */
  readonly no: number;
  /** DAT filename */
  readonly fileName: string;
  /** Thread title (sanitized) */
  readonly title: string;
  /** Locally fetched response count */
  readonly count: number;
  /** DAT file size in bytes */
  readonly size: number;
  /** Round date (patrol date) as ISO string or null */
  readonly roundDate: string | null;
  /** Server Last-Modified as ISO string or null */
  readonly lastModified: string | null;
  /** "Read up to here" position. -1 means unset. */
  readonly kokomade: number;
  /** Response number where new posts start */
  readonly newReceive: number;
  /** Unread flag */
  readonly unRead: boolean;
  /** Scroll position */
  readonly scrollTop: number;
  /** Total response count on server */
  readonly allResCount: number;
  /** New response count since last fetch */
  readonly newResCount: number;
  /** Age/Sage/New/Archive status */
  readonly ageSage: AgeSage;
}

/** One response (1 line of DAT) — 5ch/2ch format (TResRec) */
export interface Res {
  /** 1-based response number */
  readonly number: number;
  /** Poster name (may contain HTML) */
  readonly name: string;
  /** Mail field (e.g. "sage") */
  readonly mail: string;
  /** Date/time + ID string */
  readonly dateTime: string;
  /** Body text (HTML) */
  readonly body: string;
  /** Thread title (only present on res #1) */
  readonly title: string;
  /** Poster ID — present in JBBS 7-field DAT format */
  readonly id?: string | undefined;
}

/** Board-specific default name/mail configuration (コテハン) */
export interface KotehanConfig {
  readonly name: string;
  readonly mail: string;
}

/** Samba timer information for a board */
export interface SambaInfo {
  /** Posting interval in seconds (0 = no restriction) */
  readonly interval: number;
  /** Last post time as ISO string (null = never posted) */
  readonly lastPostTime: string | null;
}

/** Parameters for posting a response */
export interface PostParams {
  readonly boardUrl: string;
  readonly threadId: string;
  readonly name: string;
  readonly mail: string;
  readonly message: string;
}

/** Result of a post attempt */
export interface PostResult {
  readonly success: boolean;
  readonly resultType: PostResultType;
  readonly message: string;
  /** Hidden fields extracted from grtCookie/grtCheck responses */
  readonly hiddenFields?: Readonly<Record<string, string>> | undefined;
}

/** BBS menu: the full tree of categories and boards */
export interface BBSMenu {
  readonly categories: readonly Category[];
}

// ---------------------------------------------------------------------------
// DAT fetch result
// ---------------------------------------------------------------------------

/** Result of fetching DAT from server */
export const DatFetchStatus = {
  /** Full content (HTTP 200) */
  Full: 'full',
  /** Partial / differential (HTTP 206) */
  Partial: 'partial',
  /** Not modified (HTTP 304) */
  NotModified: 'not_modified',
  /** DAT fallen / archived (HTTP 302) */
  Archived: 'archived',
  /** Error */
  Error: 'error',
} as const;
export type DatFetchStatus = (typeof DatFetchStatus)[keyof typeof DatFetchStatus];

export interface DatFetchResult {
  readonly status: DatFetchStatus;
  readonly responses: readonly Res[];
  readonly lastModified: string | null;
  readonly size: number;
  readonly errorMessage?: string | undefined;
}

/** Result of fetching subject.txt */
export interface SubjectFetchResult {
  readonly threads: readonly SubjectRecord[];
  readonly notModified: boolean;
}
