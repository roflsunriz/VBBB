/**
 * Remote search result types (ff5ch.syoboi.jp scraping).
 */
export interface RemoteSearchItem {
  readonly threadTitle: string;
  readonly threadUrl: string;
  readonly boardTitle: string;
  readonly boardUrl: string;
  readonly responseCount: number;
  readonly lastUpdated: string;
  readonly responsesPerHour: number | null;
}

export interface RemoteSearchResult {
  readonly sourceUrl: string;
  readonly items: readonly RemoteSearchItem[];
  readonly totalCount: number | null;
  readonly rangeStart: number | null;
  readonly rangeEnd: number | null;
  readonly nextStart: number | null;
}
