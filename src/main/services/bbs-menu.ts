/**
 * BBS Menu (板一覧) fetch and parse service.
 * Parses bbsmenu.html -> categories/boards -> saves as local cache.
 */
import { type BBSMenu, type Board, BoardType, type Category } from '@shared/domain';
import { BBS_MENU_URL, IGNORED_CATEGORIES } from '@shared/file-format';
import { BBSMenuSchema } from '@shared/zod-schemas';
import { createLogger } from '../logger';
import { decodeBuffer } from './encoding';
import { atomicWriteFile, readFileSafe } from './file-io';
import { httpFetch } from './http-client';

const logger = createLogger('bbs-menu');

/**
 * Detect board type from URL.
 */
function detectBoardType(url: string): BoardType {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes('jbbs.shitaraba') || hostname.includes('jbbs.livedoor')) {
    return BoardType.JBBS;
  }
  if (hostname.includes('shitaraba')) {
    return BoardType.Shitaraba;
  }
  return BoardType.Type2ch;
}

/**
 * Extract BBSID and server URL from a board URL.
 */
function parseBoardUrl(url: string): { bbsId: string; serverUrl: string } {
  const parsed = new URL(url);
  const pathSegments = parsed.pathname.split('/').filter((s) => s.length > 0);
  const bbsId = pathSegments[pathSegments.length - 1] ?? '';
  // Server URL = everything except the last path segment
  const serverPath = pathSegments.slice(0, -1).join('/');
  const serverUrl = `${parsed.protocol}//${parsed.host}/${serverPath.length > 0 ? serverPath + '/' : ''}`;
  return { bbsId, serverUrl };
}

/**
 * Normalize a board URL:
 * - http -> https
 * - .2ch.net -> .5ch.net
 * - Ensure trailing /
 */
function normalizeUrl(url: string): string {
  let normalized = url.trim();
  normalized = normalized.replace(/^http:\/\//, 'https://');
  normalized = normalized.replace(/\.2ch\.net\//g, '.5ch.net/');
  if (!normalized.endsWith('/')) {
    normalized += '/';
  }
  return normalized;
}

/**
 * Parse bbsmenu.html to extract categories and boards.
 */
export function parseBBSMenuHtml(html: string): BBSMenu {
  const categories: Category[] = [];
  let currentCategory: { name: string; boards: Board[] } | null = null;

  // Normalize HTML tags to lowercase for consistent parsing
  const normalized = html
    .replace(/<B>/gi, '<b>')
    .replace(/<\/B>/gi, '</b>')
    .replace(/<BR>/gi, '<br>')
    .replace(/<A\s+HREF/gi, '<a href')
    .replace(/<\/A>/gi, '</a>');

  const lines = normalized.split(/\n|<br>/i);

  for (const line of lines) {
    // Check for category: <b>CategoryName</b>
    const categoryMatch = /<b>([^<]+)<\/b>/i.exec(line);
    if (categoryMatch?.[1] !== undefined) {
      const name = categoryMatch[1].trim();
      if (IGNORED_CATEGORIES.includes(name)) {
        currentCategory = null;
        continue;
      }
      currentCategory = { name, boards: [] };
      categories.push(currentCategory);
      continue;
    }

    // Check for board link: <a href=URL>Title</a>
    const boardMatch = /<a\s+href=["']?([^"'>\s]+)["']?[^>]*>([^<]+)<\/a>/i.exec(line);
    if (boardMatch?.[1] !== undefined && boardMatch[2] !== undefined && currentCategory !== null) {
      const rawUrl = boardMatch[1].trim();
      const title = boardMatch[2].trim();

      // Skip non-board URLs (external sites, etc.)
      if (!rawUrl.includes('.5ch.net/') && !rawUrl.includes('.2ch.net/') && !rawUrl.includes('.bbspink.com/')) {
        continue;
      }

      const url = normalizeUrl(rawUrl);
      const { bbsId, serverUrl } = parseBoardUrl(url);
      const boardType = detectBoardType(url);

      currentCategory.boards.push({ title, url, bbsId, serverUrl, boardType });
    }
  }

  // Filter empty categories
  const nonEmptyCategories = categories.filter((c) => c.boards.length > 0);

  return { categories: nonEmptyCategories };
}

/**
 * Fetch BBS menu from server.
 */
export async function fetchBBSMenu(): Promise<BBSMenu> {
  logger.info(`Fetching BBS menu from ${BBS_MENU_URL}`);

  const response = await httpFetch({
    url: BBS_MENU_URL,
    method: 'GET',
  });

  if (response.status !== 200) {
    throw new Error(`Failed to fetch BBS menu: HTTP ${String(response.status)}`);
  }

  // BBS menu is Shift_JIS encoded
  const html = decodeBuffer(response.body, 'Shift_JIS');
  const menu = parseBBSMenuHtml(html);

  logger.info(`Parsed ${String(menu.categories.length)} categories`);
  return menu;
}

/**
 * Save BBS menu to local cache as JSON.
 */
export async function saveBBSMenuCache(dataDir: string, menu: BBSMenu): Promise<void> {
  const cachePath = `${dataDir}/bbs-menu-cache.json`;
  const data = JSON.stringify(menu, null, 2);
  await atomicWriteFile(cachePath, data);
}

/**
 * Load BBS menu from local cache.
 */
export function loadBBSMenuCache(dataDir: string): BBSMenu | null {
  const cachePath = `${dataDir}/bbs-menu-cache.json`;
  const content = readFileSafe(cachePath);
  if (content === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(content.toString('utf-8'));
    const validated = BBSMenuSchema.safeParse(parsed);
    if (validated.success) {
      // Re-enrich with derived fields
      const categories: Category[] = validated.data.categories.map((cat) => ({
        name: cat.name,
        boards: cat.boards.map((b) => {
          const url = normalizeUrl(b.url);
          const { bbsId, serverUrl } = parseBoardUrl(url);
          return {
            title: b.title,
            url,
            bbsId,
            serverUrl,
            boardType: detectBoardType(url),
          };
        }),
      }));
      return { categories };
    }
    logger.warn('BBS menu cache validation failed');
    return null;
  } catch {
    logger.warn('Failed to parse BBS menu cache');
    return null;
  }
}
