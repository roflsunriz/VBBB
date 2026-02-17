/**
 * IPC handler registration.
 * Connects renderer requests to main process services.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { AgeSage, BoardType, type Board, type ThreadIndex } from '@shared/domain';
import type { IpcChannelMap, IpLookupResult } from '@shared/ipc';
import { PostParamsSchema } from '@shared/zod-schemas';
import type { MenuAction } from '@shared/menu';
import { clearLogBuffer, createLogger, getLogBuffer } from '../logger';
import { menuEmitter } from '../menu';
import { fetchBBSMenu, loadBBSMenuCache, saveBBSMenuCache } from '../services/bbs-menu';
import { applyBoardTransfers, detectTransfers } from '../services/board-transfer';
import { resolveBoardTitle } from '../services/board-title';
import { fetchDat } from '../services/dat';
import { postResponse } from '../services/post';
import { fetchSubject, loadFolderIdx, saveFolderIdx } from '../services/subject';
import { getBoardDir, ensureDir } from '../services/file-io';
import { loadKotehan, saveKotehan } from '../services/kotehan';
import { httpFetch } from '../services/http-client';
import { searchLocal, searchLocalAll } from '../services/local-search';
import { getSambaInfo, recordSambaTime } from '../services/samba';
import { loadNgRules, saveNgRules, addNgRule, removeNgRule } from '../services/ng-abon';
import { loadPostHistory, savePostHistory } from '../services/post-history';
import { addHistoryEntry, clearBrowsingHistory, getBrowsingHistory, loadBrowsingHistory, saveBrowsingHistory } from '../services/browsing-history';
import { loadFavorites, saveFavorites, addFavorite, removeFavorite } from '../services/favorite';
import { beLogin, beLogout, getBeSession } from '../services/be-auth';
import { getAllCookies, getCookiesForUrl, setCookie, removeCookie, saveCookies, loadCookies } from '../services/cookie-store';
import { getDonguriState, loginDonguri, refreshDonguriState } from '../services/donguri';
import { getBoardPlugin, initializeBoardPlugins } from '../services/plugins/board-plugin';
import { getProxyConfig, loadProxyConfig, saveProxyConfig } from '../services/proxy-manager';
import {
  addRoundBoard, addRoundItem, getRoundBoards, getRoundItems,
  getTimerConfig, loadRoundLists, removeRoundBoard, removeRoundItem,
  saveRoundBoard, saveRoundItem, setTimerConfig,
} from '../services/round-list';
import { buildRemoteSearchUrl } from '../services/remote-search';
import { loadSavedTabs, loadSessionState, saveSessionState, saveTabs } from '../services/tab-persistence';
import { upliftLogin, upliftLogout, getUpliftSession } from '../services/uplift-auth';
import { DEFAULT_USER_AGENT } from '@shared/file-format';

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
  const isShitaraba = hostname.includes('jbbs.shitaraba');
  const isJBBS = hostname.includes('jbbs.livedoor');
  const isMachi = hostname.includes('machi.to');

  if (isJBBS || isShitaraba) {
    const jbbsDir = segments.length >= 2 ? (segments[segments.length - 2] ?? '') : '';
    const bbsId = segments[segments.length - 1] ?? 'unknown';
    return {
      title: bbsId,
      url: boardUrl,
      bbsId,
      serverUrl: `${url.protocol}//${url.host}/`,
      boardType: isJBBS ? BoardType.JBBS : BoardType.Shitaraba,
      jbbsDir,
    };
  }

  const bbsId = segments[segments.length - 1] ?? 'unknown';
  const board: Board = {
    title: bbsId,
    url: boardUrl,
    bbsId,
    serverUrl: `${url.protocol}//${url.host}/`,
    boardType: isMachi ? BoardType.MachiBBS : BoardType.Type2ch,
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
      // Collect old boards for transfer detection
      const oldBoards: Board[] = [];
      for (const b of boardCache.values()) {
        oldBoards.push(b);
      }

      const menu = await fetchBBSMenu();
      await saveBBSMenuCache(dataDir, menu);

      // Collect new boards and populate cache
      const newBoards: Board[] = [];
      boardCache.clear();
      for (const cat of menu.categories) {
        for (const board of cat.boards) {
          boardCache.set(board.url, board);
          newBoards.push(board);
        }
      }

      // Detect and apply board transfers if we had old data
      if (oldBoards.length > 0) {
        const transfers = detectTransfers(oldBoards, newBoards);
        if (transfers.size > 0) {
          await applyBoardTransfers(transfers, dataDir);
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

  handle('bbs:resolve-board-title', async (boardUrl: string) => {
    const board = lookupBoard(boardUrl);
    return resolveBoardTitle(board);
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
    const result = plugin !== undefined
      ? await plugin.postResponse(validated.data, board)
      : await postResponse(validated.data, board);

    // Persist any cookies received during the post flow
    // (Set-Cookie from bbs.cgi and confirmation tokens from hidden fields)
    await saveCookies(dataDir);

    return result;
  });

  handle('bbs:get-thread-index', (boardUrl: string) => {
    const board = lookupBoard(boardUrl);
    const boardDir = getBoardDir(dataDir, board.url);
    return Promise.resolve(loadFolderIdx(boardDir));
  });

  handle('bbs:update-thread-index', async (boardUrl: string, threadId: string, updates) => {
    const board = lookupBoard(boardUrl);
    const boardDir = getBoardDir(dataDir, board.url);
    ensureDir(boardDir);
    const indices = loadFolderIdx(boardDir);
    const datFileName = `${threadId}.dat`;
    const existing = indices.find((idx) => idx.fileName === datFileName);

    if (existing !== undefined) {
      // Update existing entry
      const updated = indices.map((idx) => {
        if (idx.fileName !== datFileName) return idx;
        return {
          ...idx,
          ...(updates.kokomade !== undefined ? { kokomade: updates.kokomade } : {}),
          ...(updates.scrollTop !== undefined ? { scrollTop: updates.scrollTop } : {}),
        };
      });
      await saveFolderIdx(boardDir, updated);
    } else {
      // Create a minimal new entry (for external/favorite threads without Folder.idx entry)
      const newEntry: ThreadIndex = {
        no: indices.length + 1,
        fileName: datFileName,
        title: '',
        count: 0,
        size: 0,
        roundDate: null,
        lastModified: null,
        kokomade: updates.kokomade ?? -1,
        newReceive: 0,
        unRead: false,
        scrollTop: updates.scrollTop ?? 0,
        allResCount: 0,
        newResCount: 0,
        ageSage: AgeSage.None,
      };
      await saveFolderIdx(boardDir, [...indices, newEntry]);
    }
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

  // Tab persistence
  handle('tab:load', () => {
    return Promise.resolve(loadSavedTabs(dataDir));
  });

  handle('tab:save', async (tabs) => {
    await saveTabs(dataDir, tabs);
  });

  handle('session:load', () => {
    return Promise.resolve(loadSessionState(dataDir));
  });

  handle('session:save', async (state) => {
    await saveSessionState(dataDir, state);
  });

  // Browsing history
  loadBrowsingHistory(dataDir);

  handle('history:load', () => {
    return Promise.resolve(getBrowsingHistory());
  });

  handle('history:add', async (boardUrl: string, threadId: string, title: string) => {
    addHistoryEntry(boardUrl, threadId, title);
    await saveBrowsingHistory(dataDir);
  });

  handle('history:clear', async () => {
    clearBrowsingHistory();
    await saveBrowsingHistory(dataDir);
  });

  // Search handlers
  handle('search:local', (query) => {
    const board = lookupBoard(query.boardUrl);
    return Promise.resolve(searchLocal(query, dataDir, board.boardType));
  });

  handle('search:local-all', async (query) => {
    return searchLocalAll(query, dataDir);
  });

  handle('search:remote-url', (keywords: string) => {
    return Promise.resolve(buildRemoteSearchUrl(keywords));
  });

  // Round list
  loadRoundLists(dataDir);

  handle('round:get-boards', () => {
    return Promise.resolve(getRoundBoards());
  });

  handle('round:get-items', () => {
    return Promise.resolve(getRoundItems());
  });

  handle('round:add-board', async (entry) => {
    addRoundBoard(entry);
    await saveRoundBoard(dataDir);
  });

  handle('round:remove-board', async (url: string) => {
    removeRoundBoard(url);
    await saveRoundBoard(dataDir);
  });

  handle('round:add-item', async (entry) => {
    addRoundItem(entry);
    await saveRoundItem(dataDir);
  });

  handle('round:remove-item', async (url: string, fileName: string) => {
    removeRoundItem(url, fileName);
    await saveRoundItem(dataDir);
  });

  handle('round:get-timer', () => {
    return Promise.resolve(getTimerConfig());
  });

  handle('round:set-timer', async (config) => {
    await setTimerConfig(dataDir, config);
  });

  handle('round:execute', async () => {
    // Execute round fetching for all board and item entries
    const boards = getRoundBoards();
    const items = getRoundItems();
    for (const board of boards) {
      try {
        const boardObj = lookupBoard(board.url);
        const plugin = getBoardPlugin(boardObj.boardType);
        if (plugin !== undefined) {
          await plugin.fetchSubject(boardObj, dataDir);
        } else {
          await fetchSubject(boardObj, dataDir);
        }
      } catch {
        logger.warn(`Round: failed to fetch subject for ${board.url}`);
      }
    }
    for (const item of items) {
      try {
        const boardObj = lookupBoard(item.url);
        const threadId = item.fileName.replace('.dat', '');
        const plugin = getBoardPlugin(boardObj.boardType);
        if (plugin !== undefined) {
          await plugin.fetchDat(boardObj, threadId, dataDir);
        } else {
          await fetchDat(boardObj, threadId, dataDir);
        }
      } catch {
        logger.warn(`Round: failed to fetch dat for ${item.url}/${item.fileName}`);
      }
    }
  });

  // Post history
  handle('post:save-history', async (entry) => {
    await savePostHistory(dataDir, entry);
  });

  handle('post:load-history', () => {
    return Promise.resolve(loadPostHistory(dataDir));
  });

  // Menu action long-poll: renderer calls this and waits until a menu action occurs
  handle('menu:wait-action', () => {
    return new Promise<MenuAction>((resolve) => {
      menuEmitter.once('action', (action: MenuAction) => {
        resolve(action);
      });
    });
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

  handle('auth:donguri-refresh', async () => {
    return refreshDonguriState();
  });

  handle('auth:donguri-login', async (mail: string, password: string) => {
    const result = await loginDonguri(mail, password);
    if (result.success) {
      await saveCookies(dataDir);
    }
    return result;
  });

  // Image save via dialog
  handle('image:save', async (imageUrl: string, suggestedName: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win === null) return { saved: false, path: '' };

    const ext = suggestedName.split('.').pop() ?? 'jpg';
    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName,
      filters: [{ name: 'Images', extensions: [ext] }],
    });

    if (result.canceled || result.filePath === undefined) {
      return { saved: false, path: '' };
    }

    const response = await fetch(imageUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(result.filePath, buffer);
    return { saved: true, path: result.filePath };
  });

  // Open URL in external browser
  handle('shell:open-external', async (url: string) => {
    await shell.openExternal(url);
  });

  // Get all cookies
  handle('cookie:get-all', () => {
    return Promise.resolve(getAllCookies());
  });

  // User-Agent management
  let customUserAgent: string | null = null;

  handle('config:get-user-agent', () => {
    return Promise.resolve(customUserAgent ?? DEFAULT_USER_AGENT);
  });

  handle('config:set-user-agent', (userAgent: string) => {
    customUserAgent = userAgent.trim().length > 0 ? userAgent.trim() : null;
    return Promise.resolve();
  });

  // Diagnostic log handlers
  handle('diag:get-logs', () => {
    return Promise.resolve(getLogBuffer());
  });

  handle('diag:clear-logs', () => {
    clearLogBuffer();
    return Promise.resolve();
  });

  handle('diag:save-logs', async (content: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win === null) return { saved: false, path: '' };

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: `vbbb-console-${timestamp}.log`,
      filters: [
        { name: 'Log Files', extensions: ['log'] },
        { name: 'Text Files', extensions: ['txt'] },
      ],
    });

    if (result.canceled || result.filePath === undefined) {
      return { saved: false, path: '' };
    }

    await writeFile(result.filePath, content, 'utf-8');
    return { saved: true, path: result.filePath };
  });

  handle('ip:lookup', async (ip: string): Promise<IpLookupResult> => {
    // Normalize BBS masked IPv6 (e.g. "240b:11:442:d510:*" → "240b:11:442:d510::")
    const lookupIp = ip.endsWith(':*') ? `${ip.slice(0, -1)}:` : ip;
    const response = await httpFetch({
      url: `http://ip-api.com/json/${encodeURIComponent(lookupIp)}?lang=ja&fields=country,regionName,city,isp,org,as,query`,
      method: 'GET',
      acceptGzip: true,
    }, { maxRetries: 1, initialDelayMs: 500, maxDelayMs: 2000, retryableStatuses: [429, 503] });
    if (response.status !== 200) {
      throw new Error(`IP API error: ${String(response.status)}`);
    }
    const data: unknown = JSON.parse(response.body.toString('utf-8'));
    if (typeof data !== 'object' || data === null) {
      throw new Error('Invalid API response');
    }
    const d = data as Record<string, unknown>;
    return {
      ip,
      country: typeof d['country'] === 'string' ? d['country'] : '',
      region: typeof d['regionName'] === 'string' ? d['regionName'] : '',
      city: typeof d['city'] === 'string' ? d['city'] : '',
      isp: typeof d['isp'] === 'string' ? d['isp'] : '',
      org: typeof d['org'] === 'string' ? d['org'] : '',
      as: typeof d['as'] === 'string' ? d['as'] : '',
    };
  });

  logger.info('IPC handlers registered');
}
