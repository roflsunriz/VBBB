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
