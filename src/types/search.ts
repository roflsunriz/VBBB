/**
 * Search types for local DAT grep and remote dig.2ch.net search.
 */

/** Search target fields */
export const SearchTarget = {
  All: 'all',
  Name: 'name',
  Mail: 'mail',
  Id: 'id',
  Body: 'body',
} as const;
export type SearchTarget = (typeof SearchTarget)[keyof typeof SearchTarget];

/** Local search query parameters */
export interface LocalSearchQuery {
  readonly boardUrl: string;
  readonly pattern: string;
  readonly target: SearchTarget;
  readonly caseSensitive: boolean;
}

/** A single search result */
export interface SearchResult {
  readonly boardUrl: string;
  readonly threadId: string;
  readonly threadTitle: string;
  readonly resNumber: number;
  readonly matchedLine: string;
}

// ---------------------------------------------------------------------------
// Cross-board local search (search:local-all)
// ---------------------------------------------------------------------------

/** Scope for cross-board local search */
export const LocalSearchScope = {
  Boards: 'boards',
  Subjects: 'subjects',
  DatCache: 'dat-cache',
  All: 'all',
} as const;
export type LocalSearchScope = (typeof LocalSearchScope)[keyof typeof LocalSearchScope];

/** Cross-board local search query (no boardUrl required) */
export interface LocalSearchAllQuery {
  readonly pattern: string;
  readonly scope: LocalSearchScope;
  /** Only relevant when scope includes DAT cache search */
  readonly target: SearchTarget;
  readonly caseSensitive: boolean;
}

/** Board name match result */
export interface BoardMatchResult {
  readonly kind: 'board';
  readonly boardUrl: string;
  readonly boardTitle: string;
  readonly categoryName: string;
}

/** Subject / thread title match result */
export interface SubjectMatchResult {
  readonly kind: 'subject';
  readonly boardUrl: string;
  readonly boardTitle: string;
  readonly threadId: string;
  readonly threadTitle: string;
  readonly count: number;
}

/** DAT content match result */
export interface DatMatchResult {
  readonly kind: 'dat';
  readonly boardUrl: string;
  readonly boardTitle: string;
  readonly threadId: string;
  readonly threadTitle: string;
  readonly resNumber: number;
  readonly matchedLine: string;
}

/** Discriminated union of all cross-board search results */
export type LocalSearchAllResult = BoardMatchResult | SubjectMatchResult | DatMatchResult;

// ---------------------------------------------------------------------------
// Remote search
// ---------------------------------------------------------------------------

/** Remote search query parameters */
export interface RemoteSearchQuery {
  readonly keywords: string;
  readonly maxResults: number;
}

/** Remote search result from dig.2ch.net */
export interface RemoteSearchResult {
  readonly subject: string;
  readonly ita: string;
  readonly resno: number;
  readonly url: string;
}
