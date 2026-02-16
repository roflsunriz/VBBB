/**
 * IPC handler registration.
 * Connects renderer requests to main process services.
 */
import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import type { Board } from '@shared/domain';
import type { IpcChannelMap } from '@shared/ipc';
import { PostParamsSchema } from '@shared/zod-schemas';
import { createLogger } from '../logger';
import { fetchBBSMenu, loadBBSMenuCache, saveBBSMenuCache } from '../services/bbs-menu';
import { fetchDat } from '../services/dat';
import { postResponse } from '../services/post';
import { fetchSubject, loadFolderIdx } from '../services/subject';
import { getBoardDir, ensureDir } from '../services/file-io';
import { loadKotehan, saveKotehan } from '../services/kotehan';
import { getSambaInfo, recordSambaTime } from '../services/samba';
import { loadNgRules, saveNgRules, addNgRule, removeNgRule } from '../services/ng-abon';
import { loadFavorites, saveFavorites, addFavorite, removeFavorite } from '../services/favorite';
import { beLogin, beLogout, getBeSession } from '../services/be-auth';
import { getCookiesForUrl, setCookie, removeCookie, saveCookies, loadCookies } from '../services/cookie-store';
import { getDonguriState } from '../services/donguri';
import { getBoardPlugin, initializeBoardPlugins } from '../services/plugins/board-plugin';
import { getProxyConfig, loadProxyConfig, saveProxyConfig } from '../services/proxy-manager';
import { upliftLogin, upliftLogout, getUpliftSession } from '../services/uplift-auth';

const logger = createLogger('ipc');

function getDataDir(): string {
  return join(app.getPath('userData'), 'vbbb-data');
}

/**
 * Typed wrapper to register an IPC handler with proper types.
 */
function handle<K extends keyof IpcChannelMap>(
  channel: K,
  handler: (...args: IpcChannelMap[K]['args']) => Promise<IpcChannelMap[K]['result']>,
): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]) => {
    return handler(...(args as IpcChannelMap[K]['args']));
  });
}

/** Board URL -> Board object cache (populated from BBS menu) */
const boardCache = new Map<string, Board>();

function lookupBoard(boardUrl: string): Board {
  const cached = boardCache.get(boardUrl);
  if (cached !== undefined) return cached;
  // Fallback: construct minimal Board from URL
  const url = new URL(boardUrl);
  const segments = url.pathname.split('/').filter((s) => s.length > 0);
  const hostname = url.hostname.toLowerCase();

  // Detect JBBS boards
  const isJBBS = hostname.includes('jbbs.shitaraba') || hostname.includes('jbbs.livedoor');
  const isShitaraba = !isJBBS && hostname.includes('shitaraba');

  if (isJBBS || isShitaraba) {
    const jbbsDir = segments.length >= 2 ? (segments[segments.length - 2] ?? '') : '';
    const bbsId = segments[segments.length - 1] ?? 'unknown';
    return {
      title: bbsId,
      url: boardUrl,
      bbsId,
      serverUrl: `${url.protocol}//${url.host}/`,
      boardType: isJBBS ? 'jbbs' : 'shitaraba',
      jbbsDir,
    };
  }

  const bbsId = segments[segments.length - 1] ?? 'unknown';
  const board: Board = {
    title: bbsId,
    url: boardUrl,
    bbsId,
    serverUrl: `${url.protocol}//${url.host}/`,
    boardType: '2ch',
  };
  return board;
}

/**
 * Register all IPC handlers.
 */
export function registerIpcHandlers(): void {
  const dataDir = getDataDir();
  ensureDir(dataDir);

  handle('app:get-data-dir', () => {
    return Promise.resolve(dataDir);
  });

  handle('bbs:fetch-menu', async () => {
    try {
      const menu = await fetchBBSMenu();
      await saveBBSMenuCache(dataDir, menu);

      // Populate board cache
      boardCache.clear();
      for (const cat of menu.categories) {
        for (const board of cat.boards) {
          boardCache.set(board.url, board);
        }
      }

      return menu;
    } catch (err) {
      logger.error('Failed to fetch BBS menu', err instanceof Error ? err : undefined);
      // Try loading from cache
      const cached = loadBBSMenuCache(dataDir);
      if (cached !== null) {
        for (const cat of cached.categories) {
          for (const board of cat.boards) {
            boardCache.set(board.url, board);
          }
        }
        return cached;
      }
      return { categories: [] };
    }
  });

  handle('bbs:fetch-subject', async (boardUrl: string) => {
    const board = lookupBoard(boardUrl);
    const plugin = getBoardPlugin(board.boardType);
    if (plugin !== undefined) {
      return plugin.fetchSubject(board, dataDir);
    }
    return fetchSubject(board, dataDir);
  });

  handle('bbs:fetch-dat', async (boardUrl: string, threadId: string) => {
    const board = lookupBoard(boardUrl);
    const plugin = getBoardPlugin(board.boardType);
    if (plugin !== undefined) {
      return plugin.fetchDat(board, threadId, dataDir);
    }
    return fetchDat(board, threadId, dataDir);
  });

  handle('bbs:post', async (params) => {
    const validated = PostParamsSchema.safeParse(params);
    if (!validated.success) {
      return {
        success: false,
        resultType: 'grtError' as const,
        message: `Validation error: ${validated.error.message}`,
      };
    }
    const board = lookupBoard(validated.data.boardUrl);
    const plugin = getBoardPlugin(board.boardType);
    if (plugin !== undefined) {
      return plugin.postResponse(validated.data, board);
    }
    return postResponse(validated.data, board);
  });

  handle('bbs:get-thread-index', (boardUrl: string) => {
    const board = lookupBoard(boardUrl);
    const boardDir = getBoardDir(dataDir, board.url);
    return Promise.resolve(loadFolderIdx(boardDir));
  });

  handle('bbs:get-kotehan', (boardUrl: string) => {
    const board = lookupBoard(boardUrl);
    const boardDir = getBoardDir(dataDir, board.url);
    return Promise.resolve(loadKotehan(boardDir));
  });

  handle('bbs:set-kotehan', async (boardUrl: string, config) => {
    const board = lookupBoard(boardUrl);
    const boardDir = getBoardDir(dataDir, board.url);
    await saveKotehan(boardDir, config);
  });

  handle('bbs:get-samba', (boardUrl: string) => {
    return Promise.resolve(getSambaInfo(dataDir, boardUrl));
  });

  handle('bbs:record-samba', async (boardUrl: string) => {
    await recordSambaTime(dataDir, boardUrl);
  });

  handle('ng:get-rules', () => {
    return Promise.resolve(loadNgRules(dataDir));
  });

  handle('ng:set-rules', async (rules) => {
    await saveNgRules(dataDir, rules);
  });

  handle('ng:add-rule', async (rule) => {
    await addNgRule(dataDir, rule);
  });

  handle('ng:remove-rule', async (ruleId: string) => {
    await removeNgRule(dataDir, ruleId);
  });

  handle('fav:load', () => {
    return Promise.resolve(loadFavorites(dataDir));
  });

  handle('fav:save', async (tree) => {
    await saveFavorites(dataDir, tree);
  });

  handle('fav:add', async (node) => {
    await addFavorite(dataDir, node);
  });

  handle('fav:remove', async (nodeId: string) => {
    await removeFavorite(dataDir, nodeId);
  });

  // Initialize board plugins
  initializeBoardPlugins();

  // Initialize cookie store on startup
  loadCookies(dataDir);

  handle('cookie:get-for-url', (url: string) => {
    return Promise.resolve(getCookiesForUrl(url));
  });

  handle('cookie:set', async (cookie) => {
    setCookie(cookie);
    await saveCookies(dataDir);
  });

  handle('cookie:remove', async (name: string, domain: string) => {
    removeCookie(name, domain);
    await saveCookies(dataDir);
  });

  handle('cookie:save', async () => {
    await saveCookies(dataDir);
  });

  // Initialize proxy config on startup
  loadProxyConfig(dataDir);

  handle('proxy:get-config', () => {
    return Promise.resolve(getProxyConfig());
  });

  handle('proxy:set-config', async (config) => {
    await saveProxyConfig(dataDir, config);
  });

  // Auth handlers
  handle('auth:get-state', () => {
    return Promise.resolve({
      uplift: getUpliftSession(),
      be: getBeSession(),
      donguri: getDonguriState(),
    });
  });

  handle('auth:uplift-login', async (userId: string, password: string) => {
    const result = await upliftLogin(userId, password);
    if (result.success) {
      await saveCookies(dataDir);
    }
    return result;
  });

  handle('auth:uplift-logout', () => {
    upliftLogout();
    return Promise.resolve();
  });

  handle('auth:be-login', async (mail: string, password: string) => {
    const result = await beLogin(mail, password);
    if (result.success) {
      await saveCookies(dataDir);
    }
    return result;
  });

  handle('auth:be-logout', async () => {
    beLogout();
    await saveCookies(dataDir);
  });

  logger.info('IPC handlers registered');
}
