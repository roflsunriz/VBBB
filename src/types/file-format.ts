/**
 * File format types for local persistence.
 */

/** Folder.idx version */
export const FOLDER_IDX_VERSION = '1.01' as const;

/** SOH delimiter byte value used in Folder.idx */
export const SOH = '\x01' as const;

/** Zero date value (TDateTime default for Delphi) */
export const ZERO_DATE_HEX = '25569' as const;

/** Kokomade unset sentinel */
export const KOKOMADE_UNSET = -1 as const;

/** Maximum retries for post */
export const MAX_POST_RETRIES = 2 as const;

/** ADJUST_MARGIN for DAT differential fetch */
export const DAT_ADJUST_MARGIN = 16 as const;

/** Maximum popup responses */
export const MAX_POPUP_RES = 10 as const;

/** Default User-Agent template — matches Monazilla convention: "Monazilla/1.00 (AppName/Version)" */
export const DEFAULT_USER_AGENT = 'Monazilla/1.00 (VBBB/2.1.1)' as const;

/** Default BBS Menu URLs */
export const DEFAULT_BBS_MENU_URLS: readonly string[] = [
  'https://menu.5ch.net/bbsmenu.html',
] as const;

/** Backward-compatible primary BBS Menu URL */
export const BBS_MENU_URL = DEFAULT_BBS_MENU_URLS[0];

/** Default ignored categories when parsing BBS menu */
export const IGNORED_CATEGORIES: readonly string[] = [
  'おすすめ',
  'あらかると',
  'その他',
  'その他のサイト',
  '特別企画',
  'まちBBS',
  'チャット',
  'ツール類',
] as const;

/** Board local files */
export interface BoardLocalFiles {
  /** subject.txt path */
  readonly subjectPath: string;
  /** Folder.idx path */
  readonly folderIdxPath: string;
  /** Folder.ini path */
  readonly folderIniPath: string;
}

/** Cookie file format (1 line = 1 cookie) */
export interface CookieEntry {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires?: string | undefined;
}
