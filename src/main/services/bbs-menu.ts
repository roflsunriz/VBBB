/**
 * BBS Menu (板一覧) fetch and parse service.
 * Parses bbsmenu.html -> categories/boards -> saves as local cache.
 */
import { type BBSMenu, type Board, BoardType, type Category } from '@shared/domain';
import { DEFAULT_5CH_DOMAIN, DEFAULT_BBS_MENU_URLS, IGNORED_CATEGORIES } from '@shared/file-format';
import { BBSMenuSchema } from '@shared/zod-schemas';
import { createLogger } from '../logger';
import { decodeBuffer } from './encoding';
import { atomicWriteFile, readFileSafe, readFileSafeAsync } from './file-io';
import { httpFetch } from './http-client';

const logger = createLogger('bbs-menu');

/**
 * Normalize BBS menu source URLs:
 * - trim whitespace
 * - allow only http/https
 * - deduplicate while preserving order
 * - fallback to default when empty/invalid
 */
export function normalizeBBSMenuSourceUrls(urls: readonly string[]): readonly string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of urls) {
    const candidate = raw.trim();
    if (candidate.length === 0) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        continue;
      }
      const serialized = parsed.toString();
      if (!seen.has(serialized)) {
        seen.add(serialized);
        normalized.push(serialized);
      }
    } catch {
      // Ignore invalid URL candidates.
    }
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_BBS_MENU_URLS];
}

/**
 * Detect board type from URL.
 */
function detectBoardType(url: string): BoardType {
  const hostname = new URL(url).hostname.toLowerCase();
  if (hostname.includes('jbbs.shitaraba')) {
    return BoardType.Shitaraba;
  }
  if (hostname.includes('jbbs.livedoor')) {
    return BoardType.JBBS;
  }
  if (hostname.includes('shitaraba')) {
    return BoardType.Shitaraba;
  }
  if (hostname.includes('machi.to')) {
    return BoardType.MachiBBS;
  }
  return BoardType.Type2ch;
}

/**
 * Extract BBSID, server URL, and optional JBBS directory from a board URL.
 * JBBS URLs have pattern: https://jbbs.shitaraba.net/{dir}/{bbs}/
 */
function parseBoardUrl(url: string): { bbsId: string; serverUrl: string; jbbsDir?: string } {
  const parsed = new URL(url);
  const pathSegments = parsed.pathname.split('/').filter((s) => s.length > 0);
  const boardType = detectBoardType(url);

  // JBBS URLs: /{dir}/{bbs}/ — dir is the category, bbs is the board ID
  if (boardType === BoardType.JBBS || boardType === BoardType.Shitaraba) {
    const jbbsDir = pathSegments.length >= 2 ? (pathSegments[pathSegments.length - 2] ?? '') : '';
    const bbsId = pathSegments[pathSegments.length - 1] ?? '';
    const serverUrl = `${parsed.protocol}//${parsed.host}/`;
    return { bbsId, serverUrl, jbbsDir };
  }

  const bbsId = pathSegments[pathSegments.length - 1] ?? '';
  const serverPath = pathSegments.slice(0, -1).join('/');
  const serverUrl = `${parsed.protocol}//${parsed.host}/${serverPath.length > 0 ? serverPath + '/' : ''}`;
  return { bbsId, serverUrl };
}

/**
 * Normalize a board URL:
 * - http -> https
 * - .2ch.net -> configured domain (backward compat)
 * - .5ch.net -> configured domain (legacy migration)
 * - Ensure trailing /
 */
function normalizeUrl(url: string, domain: string): string {
  let normalized = url.trim();
  normalized = normalized.replace(/^http:\/\//, 'https://');
  normalized = normalized.replace(/\.2ch\.net\//g, `.${domain}/`);
  normalized = normalized.replace(/\.5ch\.net\//g, `.${domain}/`);
  if (!normalized.endsWith('/')) {
    normalized += '/';
  }
  return normalized;
}

/**
 * Check if a raw board URL is a valid board URL for the configured domain.
 * Accepts the configured domain, legacy 5ch.net, legacy 2ch.net, and bbspink.com.
 */
function isValidBoardUrl(rawUrl: string, domain: string): boolean {
  return (
    rawUrl.includes(`.${domain}/`) ||
    rawUrl.includes('.5ch.net/') ||
    rawUrl.includes('.2ch.net/') ||
    rawUrl.includes('.bbspink.com/')
  );
}

/**
 * Parse bbsmenu.html to extract categories and boards.
 *
 * @param html - Raw HTML from bbsmenu.html
 * @param domain - 5ch base domain (e.g. "5ch.io")
 */
export function parseBBSMenuHtml(html: string, domain: string): BBSMenu {
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
      if (!isValidBoardUrl(rawUrl, domain)) {
        continue;
      }

      const url = normalizeUrl(rawUrl, domain);
      const { bbsId, serverUrl, jbbsDir } = parseBoardUrl(url);
      const boardType = detectBoardType(url);

      currentCategory.boards.push({ title, url, bbsId, serverUrl, boardType, jbbsDir });
    }
  }

  // Filter empty categories
  const nonEmptyCategories = categories.filter((c) => c.boards.length > 0);

  return { categories: nonEmptyCategories };
}

/**
 * Fetch BBS menu from server.
 *
 * @param sourceUrls - List of BBSmenu source URLs
 * @param domain - 5ch base domain used for board URL filtering/normalization (e.g. "5ch.io")
 */
export async function fetchBBSMenu(
  sourceUrls: readonly string[] = DEFAULT_BBS_MENU_URLS,
  domain: string = DEFAULT_5CH_DOMAIN,
): Promise<BBSMenu> {
  const menuUrls = normalizeBBSMenuSourceUrls(sourceUrls);
  logger.info(`Fetching BBS menu from ${String(menuUrls.length)} source(s)`);

  const mergedCategories = new Map<string, Map<string, Board>>();
  const errors: string[] = [];

  for (const menuUrl of menuUrls) {
    try {
      const response = await httpFetch({
        url: menuUrl,
        method: 'GET',
      });
      if (response.status !== 200) {
        throw new Error(`HTTP ${String(response.status)}`);
      }

      // BBS menu is Shift_JIS encoded
      const html = decodeBuffer(response.body, 'Shift_JIS');
      const menu = parseBBSMenuHtml(html, domain);

      for (const category of menu.categories) {
        const categoryBoards = mergedCategories.get(category.name) ?? new Map<string, Board>();
        for (const board of category.boards) {
          categoryBoards.set(board.url, board);
        }
        mergedCategories.set(category.name, categoryBoards);
      }
      logger.info(
        `Fetched BBS menu source: ${menuUrl} (${String(menu.categories.length)} categories parsed)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${menuUrl}: ${message}`);
      logger.warn(`Failed to fetch BBS menu source: ${menuUrl} (${message})`);
    }
  }

  if (mergedCategories.size === 0) {
    throw new Error(`Failed to fetch all BBS menu sources: ${errors.join(' | ')}`);
  }

  const categories: Category[] = [];
  for (const [name, boardsByUrl] of mergedCategories.entries()) {
    categories.push({
      name,
      boards: Array.from(boardsByUrl.values()),
    });
  }

  const menu: BBSMenu = { categories };
  logger.info(`Parsed ${String(menu.categories.length)} categories from merged menu sources`);
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

function parseCachedMenu(content: Buffer, domain: string): BBSMenu | null {
  try {
    const parsed: unknown = JSON.parse(content.toString('utf-8'));
    const validated = BBSMenuSchema.safeParse(parsed);
    if (validated.success) {
      const categories: Category[] = validated.data.categories.map((cat) => ({
        name: cat.name,
        boards: cat.boards.map((b) => {
          const url = normalizeUrl(b.url, domain);
          const { bbsId, serverUrl, jbbsDir } = parseBoardUrl(url);
          return {
            title: b.title,
            url,
            bbsId,
            serverUrl,
            boardType: detectBoardType(url),
            jbbsDir,
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

/**
 * Load BBS menu from local cache (synchronous).
 *
 * @param dataDir - Data directory path
 * @param domain - 5ch base domain for URL normalization (e.g. "5ch.io")
 */
export function loadBBSMenuCache(dataDir: string, domain: string = DEFAULT_5CH_DOMAIN): BBSMenu | null {
  const cachePath = `${dataDir}/bbs-menu-cache.json`;
  const content = readFileSafe(cachePath);
  if (content === null) return null;
  return parseCachedMenu(content, domain);
}

/**
 * Load BBS menu from local cache (async, non-blocking).
 *
 * @param dataDir - Data directory path
 * @param domain - 5ch base domain for URL normalization (e.g. "5ch.io")
 */
export async function loadBBSMenuCacheAsync(
  dataDir: string,
  domain: string = DEFAULT_5CH_DOMAIN,
): Promise<BBSMenu | null> {
  const cachePath = `${dataDir}/bbs-menu-cache.json`;
  const content = await readFileSafeAsync(cachePath);
  if (content === null) return null;
  return parseCachedMenu(content, domain);
}
