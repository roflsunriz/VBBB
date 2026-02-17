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
const DAT_FILE_PATTERN = /^(\d+)\.dat$/;

/** Parsed 5ch thread URL result */
export interface ParsedThreadUrl {
  readonly boardUrl: string;
  readonly threadId: string;
  readonly title: string;
}

interface ParsedThreadPathParts {
  readonly boardPathSegments: readonly string[];
  readonly threadId: string;
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

/**
 * Parsed thread URL result for all supported formats (5ch/external/dat).
 * titleHint is intentionally empty so openThread can resolve title from DAT.
 */
export interface ParsedAnyThreadUrl {
  readonly board: Board;
  readonly threadId: string;
  readonly titleHint: string;
}

function parseFromReadCgi(url: URL): ParsedThreadPathParts | null {
  const pathSegments = url.pathname.split('/').filter((s) => s.length > 0);
  const hostname = url.hostname.toLowerCase();

  // 5ch: /test/read.cgi/<boardId>/<threadId>/
  const fiveChMatch = THREAD_URL_PATTERN.exec(url.pathname);
  if (fiveChMatch?.[1] !== undefined && fiveChMatch[2] !== undefined) {
    return {
      boardPathSegments: [fiveChMatch[1]],
      threadId: fiveChMatch[2],
    };
  }

  // Shitaraba / JBBS: /bbs/read.cgi/<dir>/<boardId>/<threadId>/
  if ((hostname.includes('jbbs.shitaraba') || hostname.includes('jbbs.livedoor')) &&
      pathSegments[0] === 'bbs' &&
      pathSegments[1] === 'read.cgi' &&
      pathSegments.length >= 5) {
    const dir = pathSegments[2];
    const bbsId = pathSegments[3];
    const threadId = pathSegments[4];
    if (dir !== undefined && bbsId !== undefined && threadId !== undefined) {
      return {
        boardPathSegments: [dir, bbsId],
        threadId,
      };
    }
  }

  // Machi BBS: /bbs/read.cgi/<boardId>/<threadId>/
  if (hostname.includes('machi.to') &&
      pathSegments[0] === 'bbs' &&
      pathSegments[1] === 'read.cgi' &&
      pathSegments.length >= 4) {
    const bbsId = pathSegments[2];
    const threadId = pathSegments[3];
    if (bbsId !== undefined && threadId !== undefined) {
      return {
        boardPathSegments: [bbsId],
        threadId,
      };
    }
  }

  return null;
}

function parseFromDatPath(url: URL): ParsedThreadPathParts | null {
  const pathSegments = url.pathname.split('/').filter((s) => s.length > 0);
  const datIndex = pathSegments.lastIndexOf('dat');
  if (datIndex <= 0) return null;

  const datFileName = pathSegments[datIndex + 1];
  if (datFileName === undefined) return null;
  const match = DAT_FILE_PATTERN.exec(datFileName);
  if (match?.[1] === undefined) return null;

  return {
    boardPathSegments: pathSegments.slice(0, datIndex),
    threadId: match[1],
  };
}

function detectBoardTypeByHost(hostname: string): BoardType {
  if (hostname.includes('jbbs.shitaraba')) return BoardType.Shitaraba;
  if (hostname.includes('jbbs.livedoor')) return BoardType.JBBS;
  return BoardType.Type2ch;
}

function buildBoard(url: URL, boardPathSegments: readonly string[]): Board | null {
  if (boardPathSegments.length === 0) return null;

  const hostname = url.hostname.toLowerCase();
  const boardType = detectBoardTypeByHost(hostname);
  const bbsId = boardPathSegments[boardPathSegments.length - 1];
  if (bbsId === undefined || bbsId.length === 0) return null;

  if ((boardType === BoardType.Shitaraba || boardType === BoardType.JBBS) && boardPathSegments.length >= 2) {
    const jbbsDir = boardPathSegments[boardPathSegments.length - 2];
    if (jbbsDir === undefined || jbbsDir.length === 0) return null;

    return {
      title: `${jbbsDir}/${bbsId}`,
      url: `${url.protocol}//${url.host}/${jbbsDir}/${bbsId}/`,
      bbsId,
      serverUrl: `${url.protocol}//${url.host}/`,
      boardType,
      jbbsDir,
    };
  }

  const boardPath = boardPathSegments.join('/');
  return {
    title: bbsId,
    url: `${url.protocol}//${url.host}/${boardPath}/`,
    bbsId,
    serverUrl: `${url.protocol}//${url.host}/`,
    boardType: BoardType.Type2ch,
  };
}

/**
 * Parse thread URL from read.cgi or dat/*.dat across 5ch/external boards.
 */
export function parseAnyThreadUrl(rawUrl: string): ParsedAnyThreadUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const parsedPath = parseFromReadCgi(url) ?? parseFromDatPath(url);
  if (parsedPath === null) return null;

  const board = buildBoard(url, parsedPath.boardPathSegments);
  if (board === null) return null;

  return {
    board,
    threadId: parsedPath.threadId,
    titleHint: '',
  };
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
    const parsedThread = parseFromReadCgi(url) ?? parseFromDatPath(url);
    if (parsedThread !== null) {
      const board = buildBoard(url, parsedThread.boardPathSegments);
      if (board === null) return null;
      return {
        board,
        threadId: parsedThread.threadId,
      };
    }

    // Board URL: /<dir>/<boardId>/
    if (pathSegments.length >= 2 && pathSegments[0] !== 'bbs') {
      const dir = pathSegments[0];
      const bbsId = pathSegments[1];
      if (dir === undefined || bbsId === undefined) return null;
      const board = buildBoard(url, [dir, bbsId]);
      if (board === null) return null;
      return { board };
    }

    return null;
  }

  // Machi BBS (machi.to) - treated as 2ch-compatible
  if (hostname.includes('machi.to')) {
    const parsedThread = parseFromReadCgi(url) ?? parseFromDatPath(url);
    if (parsedThread !== null) {
      const board = buildBoard(url, parsedThread.boardPathSegments);
      if (board === null) return null;
      return {
        board,
        threadId: parsedThread.threadId,
      };
    }

    // Board URL: /<boardId>/
    if (pathSegments.length >= 1 && pathSegments[0] !== 'bbs') {
      const bbsId = pathSegments[0];
      if (bbsId === undefined) return null;
      const board = buildBoard(url, [bbsId]);
      if (board === null) return null;
      return { board };
    }

    return null;
  }

  return null;
}
