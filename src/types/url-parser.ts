/**
 * URL parsing utilities for 5ch/Shitaraba/JBBS/Machi BBS URLs.
 * Pure functions with no side effects, safe to import from any context.
 */
import type { Board } from './domain';
import { BoardType } from './domain';

// ---------------------------------------------------------------------------
// 5ch thread URL parser (used by SearchPanel for webview link interception)
// ---------------------------------------------------------------------------

/** 5ch thread URL pattern: /test/read.cgi/<board>/<threadId>/ */
const THREAD_URL_PATTERN = /\/test\/read\.cgi\/([^/]+)\/(\d+)/;

/** Parsed 5ch thread URL result */
export interface ParsedThreadUrl {
  readonly boardUrl: string;
  readonly threadId: string;
  readonly title: string;
}

/**
 * Parse a 5ch-style thread URL into board URL and thread ID.
 * Returns null if the URL is not a recognized thread link.
 *
 * Examples:
 * - https://eagle.5ch.net/test/read.cgi/livejupiter/1234567890/
 * - https://hayabusa9.5ch.net/test/read.cgi/news/9876543210/l50
 */
export function parseThreadUrl(rawUrl: string): ParsedThreadUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const match = THREAD_URL_PATTERN.exec(url.pathname);
  if (match?.[1] === undefined || match[2] === undefined) return null;

  const boardId = match[1];
  const threadId = match[2];
  const boardUrl = `${url.protocol}//${url.host}/${boardId}/`;
  return { boardUrl, threadId, title: `${boardId}/${threadId}` };
}

// ---------------------------------------------------------------------------
// External board URL parser (Shitaraba / JBBS / Machi BBS)
// ---------------------------------------------------------------------------

/** Parsed external board URL result */
export interface ParsedExternalBoardUrl {
  readonly board: Board;
  readonly threadId?: string | undefined;
  readonly threadTitle?: string | undefined;
}

/**
 * Parse a Shitaraba / JBBS / Machi BBS URL into board and optional thread info.
 *
 * Shitaraba board:  https://jbbs.shitaraba.jp/game/12345/
 * Shitaraba thread: https://jbbs.shitaraba.jp/bbs/read.cgi/game/12345/1234567890/
 * JBBS board:       https://jbbs.livedoor.jp/game/12345/
 * JBBS thread:      https://jbbs.livedoor.jp/bbs/read.cgi/game/12345/1234567890/
 * Machi board:      https://machi.to/hokkaidou/
 * Machi thread:     https://machi.to/bbs/read.cgi/hokkaidou/1234567890/
 */
export function parseExternalBoardUrl(rawUrl: string): ParsedExternalBoardUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  const pathSegments = url.pathname.split('/').filter((s) => s.length > 0);

  // Shitaraba / JBBS
  if (hostname.includes('jbbs.shitaraba') || hostname.includes('jbbs.livedoor')) {
    const isShitaraba = hostname.includes('shitaraba');
    const boardType = isShitaraba ? BoardType.Shitaraba : BoardType.JBBS;

    // Thread URL: /bbs/read.cgi/<dir>/<boardId>/<threadId>/
    if (pathSegments[0] === 'bbs' && pathSegments[1] === 'read.cgi' && pathSegments.length >= 5) {
      const jbbsDir = pathSegments[2] ?? '';
      const bbsId = pathSegments[3] ?? '';
      const threadId = pathSegments[4] ?? '';
      const boardUrl = `${url.protocol}//${url.host}/${jbbsDir}/${bbsId}/`;
      return {
        board: {
          title: `${jbbsDir}/${bbsId}`,
          url: boardUrl,
          bbsId,
          serverUrl: `${url.protocol}//${url.host}/`,
          boardType,
          jbbsDir,
        },
        threadId,
        threadTitle: `${jbbsDir}/${bbsId} - ${threadId}`,
      };
    }

    // Board URL: /<dir>/<boardId>/
    if (pathSegments.length >= 2) {
      const jbbsDir = pathSegments[0] ?? '';
      const bbsId = pathSegments[1] ?? '';
      const boardUrl = `${url.protocol}//${url.host}/${jbbsDir}/${bbsId}/`;
      return {
        board: {
          title: `${jbbsDir}/${bbsId}`,
          url: boardUrl,
          bbsId,
          serverUrl: `${url.protocol}//${url.host}/`,
          boardType,
          jbbsDir,
        },
      };
    }

    return null;
  }

  // Machi BBS (machi.to) - treated as 2ch-compatible
  if (hostname.includes('machi.to')) {
    // Thread URL: /bbs/read.cgi/<boardId>/<threadId>/
    if (pathSegments[0] === 'bbs' && pathSegments[1] === 'read.cgi' && pathSegments.length >= 4) {
      const bbsId = pathSegments[2] ?? '';
      const threadId = pathSegments[3] ?? '';
      const boardUrl = `${url.protocol}//${url.host}/${bbsId}/`;
      return {
        board: {
          title: bbsId,
          url: boardUrl,
          bbsId,
          serverUrl: `${url.protocol}//${url.host}/`,
          boardType: BoardType.Type2ch,
        },
        threadId,
        threadTitle: `${bbsId} - ${threadId}`,
      };
    }

    // Board URL: /<boardId>/
    if (pathSegments.length >= 1) {
      const bbsId = pathSegments[0] ?? '';
      const boardUrl = `${url.protocol}//${url.host}/${bbsId}/`;
      return {
        board: {
          title: bbsId,
          url: boardUrl,
          bbsId,
          serverUrl: `${url.protocol}//${url.host}/`,
          boardType: BoardType.Type2ch,
        },
      };
    }

    return null;
  }

  return null;
}
