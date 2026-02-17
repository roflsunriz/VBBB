/**
 * Board title resolver for external boards.
 * Priority:
 *  1) Shitaraba/JBBS: board_info.cgi
 *  2) Machi BBS: bbsmenu.html
 *  3) Fallback: board top page <title>/<h1>
 */
import type { Board } from '@shared/domain';
import { BoardType } from '@shared/domain';
import { createLogger } from '../logger';
import { decodeBuffer } from './encoding';
import { httpFetch } from './http-client';

const logger = createLogger('board-title');
const MACHI_BBS_MENU_URL = 'https://machi.to/bbsmenu.html';

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalizeText(text: string): string {
  return decodeHtmlEntities(text.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTagText(html: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = regex.exec(html);
  if (match?.[1] === undefined) return null;
  const normalized = normalizeText(match[1]);
  return normalized.length > 0 ? normalized : null;
}

function getReadEncoding(board: Board): 'Shift_JIS' | 'EUC-JP' {
  return board.boardType === BoardType.JBBS ? 'EUC-JP' : 'Shift_JIS';
}

export function extractBoardTitleFromBoardInfoHtml(html: string): string | null {
  const rawTitle = extractTagText(html, 'title');
  if (rawTitle !== null) {
    const fromTitle = rawTitle
      .replace(/^掲示板情報\s*-\s*/, '')
      .replace(/\s*-\s*(?:したらば|JBBS)?掲示板.*$/i, '')
      .trim();
    if (fromTitle.length > 0) {
      return fromTitle;
    }
  }

  const heading = extractTagText(html, 'h1');
  if (heading !== null) {
    const fromHeading = heading
      .replace(/^掲示板情報(?:（β版）)?\s*/, '')
      .trim();
    if (fromHeading.length > 0) {
      return fromHeading;
    }
  }

  return null;
}

export function extractBoardTitleFromMachiMenuHtml(html: string, boardId: string): string | null {
  const target = boardId.trim().toLowerCase();
  if (target.length === 0) return null;

  const anchorPattern = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const href = match[1];
    const label = match[2];
    if (href === undefined || label === undefined) continue;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(href, MACHI_BBS_MENU_URL);
    } catch {
      continue;
    }
    if (!parsedUrl.hostname.toLowerCase().includes('machi.to')) continue;

    const segments = parsedUrl.pathname.split('/').filter((s) => s.length > 0);
    const slug = segments[0]?.toLowerCase();
    if (slug === undefined || slug === 'bbs') continue;

    if (slug === target) {
      const normalizedLabel = normalizeText(label);
      if (normalizedLabel.length > 0) {
        return normalizedLabel;
      }
    }
  }

  return null;
}

export function extractBoardTitleFromBoardTopHtml(html: string): string | null {
  const rawTitle = extractTagText(html, 'title');
  if (rawTitle !== null) {
    const cleaned = rawTitle
      .replace(/\s*-\s*まちBBS.*$/i, '')
      .replace(/\s*-\s*したらば掲示板.*$/i, '')
      .replace(/\s*-\s*5ちゃんねる掲示板.*$/i, '')
      .trim();
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  const h1 = extractTagText(html, 'h1');
  if (h1 !== null && h1.length > 0) {
    return h1;
  }

  return null;
}

async function fetchHtml(url: string, encoding: 'Shift_JIS' | 'EUC-JP'): Promise<string | null> {
  try {
    const response = await httpFetch({
      url,
      method: 'GET',
    });
    if (response.status !== 200) {
      logger.warn(`Board title fetch failed: ${url} (HTTP ${String(response.status)})`);
      return null;
    }
    return decodeBuffer(response.body, encoding);
  } catch (err) {
    logger.warn(`Board title fetch failed: ${url} (${err instanceof Error ? err.message : String(err)})`);
    return null;
  }
}

async function resolveByBoardInfo(board: Board): Promise<string | null> {
  const dir = board.jbbsDir?.trim();
  if (dir === undefined || dir.length === 0) return null;
  const url = `${board.serverUrl}bbs/board_info.cgi/${dir}/${board.bbsId}/`;
  const html = await fetchHtml(url, getReadEncoding(board));
  if (html === null) return null;
  return extractBoardTitleFromBoardInfoHtml(html);
}

async function resolveByMachiMenu(board: Board): Promise<string | null> {
  const html = await fetchHtml(MACHI_BBS_MENU_URL, 'Shift_JIS');
  if (html === null) return null;
  return extractBoardTitleFromMachiMenuHtml(html, board.bbsId);
}

async function resolveByBoardTop(board: Board): Promise<string | null> {
  const html = await fetchHtml(board.url, getReadEncoding(board));
  if (html === null) return null;
  return extractBoardTitleFromBoardTopHtml(html);
}

function isMachiBoard(board: Board): boolean {
  try {
    return new URL(board.url).hostname.toLowerCase().includes('machi.to');
  } catch {
    return false;
  }
}

/**
 * Resolve human-readable board title for external boards.
 * Returns null when a better title cannot be obtained.
 */
export async function resolveBoardTitle(board: Board): Promise<string | null> {
  let resolved: string | null = null;

  if (board.boardType === BoardType.Shitaraba || board.boardType === BoardType.JBBS) {
    resolved = await resolveByBoardInfo(board);
  } else if (isMachiBoard(board)) {
    resolved = await resolveByMachiMenu(board);
  }

  if (resolved === null) {
    resolved = await resolveByBoardTop(board);
  }
  if (resolved === null) {
    return null;
  }

  const normalized = resolved.trim();
  if (normalized.length === 0) return null;
  if (normalized === board.title.trim()) return null;
  return normalized;
}
