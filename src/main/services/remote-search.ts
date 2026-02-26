/**
 * ff5ch.syoboi.jp scraper for remote search.
 * API is not published, so results are extracted from HTML.
 */
import { type RemoteSearchItem, type RemoteSearchResult } from '@shared/remote-search';
import { httpFetch } from './http-client';

const FF5CH_BASE = 'https://ff5ch.syoboi.jp/';

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

function stripTags(input: string): string {
  return decodeHtmlEntities(
    input
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function parseCountBlock(html: string): {
  totalCount: number | null;
  rangeStart: number | null;
  rangeEnd: number | null;
} {
  const match = html.match(/([\d,]+)\s*件のスレがあります\s*\(\s*([\d,]+)\s*-\s*([\d,]+)\s*\)/);
  if (match === null) {
    return { totalCount: null, rangeStart: null, rangeEnd: null };
  }
  const totalCount = Number((match[1] ?? '').replaceAll(',', ''));
  const rangeStart = Number((match[2] ?? '').replaceAll(',', ''));
  const rangeEnd = Number((match[3] ?? '').replaceAll(',', ''));
  return {
    totalCount: Number.isFinite(totalCount) ? totalCount : null,
    rangeStart: Number.isFinite(rangeStart) ? rangeStart : null,
    rangeEnd: Number.isFinite(rangeEnd) ? rangeEnd : null,
  };
}

function parseNextStart(html: string): number | null {
  const nextHrefMatch = html.match(/<a[^>]+href="([^"]+)"[^>]*>\s*次へ\s*&gt;\s*<\/a>/);
  const href = nextHrefMatch?.[1];
  if (href === undefined) return null;
  const absolute = new URL(decodeHtmlEntities(href), FF5CH_BASE);
  const nextStart = Number(absolute.searchParams.get('start') ?? '');
  return Number.isFinite(nextStart) ? nextStart : null;
}

export function buildRemoteSearchUrl(keywords: string, start?: number): string {
  const params = new URLSearchParams({ q: keywords });
  if (start !== undefined && start > 0) {
    const value = String(start);
    params.set('start', value);
    params.set('page', value);
  }
  return `${FF5CH_BASE}?${params.toString()}`;
}

export function parseRemoteSearchHtml(html: string): Omit<RemoteSearchResult, 'sourceUrl'> {
  const items: RemoteSearchItem[] = [];
  const itemRegex =
    /<li[^>]*>\s*<span>\s*<a[^>]*class="thread"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<span[^>]*>\s*\((\d+)\)\s*<\/span>[\s\S]*?<a[^>]*class="col-brd"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<span>([^<]+)<\/span>(?:[\s\S]*?<span[^>]*class="col-warn"[^>]*>\((\d+)\s*res\/h\)<\/span>)?[\s\S]*?<\/li>/g;

  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(html)) !== null) {
    const threadUrl = match[1]?.trim();
    const threadTitleRaw = match[2];
    const responseCountRaw = match[3];
    const boardUrl = match[4]?.trim();
    const boardTitleRaw = match[5];
    const lastUpdatedRaw = match[6];
    const responsesPerHourRaw = match[7];

    if (
      threadUrl === undefined ||
      threadUrl.length === 0 ||
      boardUrl === undefined ||
      boardUrl.length === 0 ||
      threadTitleRaw === undefined ||
      boardTitleRaw === undefined ||
      responseCountRaw === undefined ||
      lastUpdatedRaw === undefined
    ) {
      continue;
    }

    const responseCount = Number(responseCountRaw);
    if (!Number.isFinite(responseCount)) {
      continue;
    }

    const responsesPerHour =
      responsesPerHourRaw === undefined ? null : Number.parseInt(responsesPerHourRaw, 10);

    items.push({
      threadTitle: stripTags(threadTitleRaw),
      threadUrl,
      boardTitle: stripTags(boardTitleRaw),
      boardUrl,
      responseCount,
      lastUpdated: stripTags(lastUpdatedRaw),
      responsesPerHour:
        responsesPerHour === null || Number.isNaN(responsesPerHour) ? null : responsesPerHour,
    });
  }

  return {
    items,
    ...parseCountBlock(html),
    nextStart: parseNextStart(html),
  };
}

export async function searchRemoteThreads(
  keywords: string,
  options?: { start?: number },
): Promise<RemoteSearchResult> {
  const sourceUrl = buildRemoteSearchUrl(keywords, options?.start);
  const response = await httpFetch(
    {
      url: sourceUrl,
      method: 'GET',
      acceptGzip: true,
    },
    { maxRetries: 1, initialDelayMs: 500, maxDelayMs: 2_000, retryableStatuses: [429, 503] },
  );

  if (response.status !== 200) {
    throw new Error(`リモート検索に失敗しました: HTTP ${String(response.status)}`);
  }

  const html = response.body.toString('utf-8');
  const parsed = parseRemoteSearchHtml(html);
  return {
    sourceUrl,
    ...parsed,
  };
}
