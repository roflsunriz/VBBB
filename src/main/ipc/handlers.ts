/**
 * IPC handler registration.
 * Connects renderer requests to main process services.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { AgeSage, BoardType, type BBSMenu, type Board, type ThreadIndex } from '@shared/domain';
import type { IpcChannelMap, IpLookupResult } from '@shared/ipc';
import { PostParamsSchema } from '@shared/zod-schemas';
import type { MenuAction } from '@shared/menu';
import { clearLogBuffer, createLogger, getLogBuffer, pushEntry } from '../logger';
import { menuEmitter } from '../menu';
import { fetchBBSMenu, loadBBSMenuCacheAsync, saveBBSMenuCache } from '../services/bbs-menu';
import { applyBoardTransfers, detectTransfers } from '../services/board-transfer';
import { resolveBoardTitle } from '../services/board-title';
import { fetchDat } from '../services/dat';
import { postResponse } from '../services/post';
import { fetchSubject, loadFolderIdx, saveFolderIdx } from '../services/subject';
import { getBoardDir, ensureDirAsync } from '../services/file-io';
import { loadKotehan, saveKotehan } from '../services/kotehan';
import { httpFetch } from '../services/http-client';
import { searchLocal, searchLocalAll } from '../services/local-search';
import { getSambaInfo, recordSambaTime } from '../services/samba';
import { loadNgRules, saveNgRules, addNgRule, removeNgRule } from '../services/ng-abon';
import { loadPostHistory, savePostHistory } from '../services/post-history';
import {
  addHistoryEntry,
  clearBrowsingHistory,
  getBrowsingHistory,
  loadBrowsingHistoryAsync,
  saveBrowsingHistory,
} from '../services/browsing-history';
import {
  loadFavorites,
  saveFavorites,
  addFavorite,
  removeFavorite,
  addFavFolder,
  addFavSeparator,
  moveFavNodeToFolder,
  reorderFavNode,
} from '../services/favorite';
import { beLogin, beLogout, getBeSession } from '../services/be-auth';
import {
  clearAllCookies,
  getAllCookies,
  getCookiesForUrl,
  setCookie,
  removeCookie,
  saveCookies,
  loadCookiesAsync,
} from '../services/cookie-store';
import {
  getDonguriState,
  loginDonguri,
  refreshDonguriState,
  resetDonguriState,
} from '../services/donguri';
import { getBoardPlugin, initializeBoardPlugins } from '../services/plugins/board-plugin';
import { getProxyConfig, loadProxyConfigAsync, saveProxyConfig } from '../services/proxy-manager';
import {
  addRoundBoard,
  addRoundItem,
  getRoundBoards,
  getRoundItems,
  getTimerConfig,
  loadRoundListsAsync,
  removeRoundBoard,
  removeRoundItem,
  saveRoundBoard,
  saveRoundItem,
  setTimerConfig,
  startRoundTimer,
  stopRoundTimer,
} from '../services/round-list';
import { searchRemoteThreads } from '../services/remote-search';
import type { SavedTab, SessionState } from '@shared/history';
import {
  loadSavedTabs,
  loadSessionState,
  saveSessionState,
  saveSessionStateSync,
  saveTabs,
  saveTabsSync,
} from '../services/tab-persistence';
import { upliftLogin, upliftLogout, getUpliftSession } from '../services/uplift-auth';
import { DEFAULT_USER_AGENT } from '@shared/file-format';
import { checkForUpdate, downloadAndInstall } from '../services/updater';

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
 * Must be awaited so that board plugins are loaded before the window is created.
 */
export async function registerIpcHandlers(): Promise<void> {
  const dataDir = getDataDir();

  handle('app:get-data-dir', () => {
    return Promise.resolve(dataDir);
  });

  /**
   * Populate boardCache from a menu and optionally detect board transfers.
   * Returns the list of new boards for transfer detection.
   */
  const populateBoardCache = (menu: BBSMenu): Board[] => {
    const newBoards: Board[] = [];
    boardCache.clear();
    for (const cat of menu.categories) {
      for (const board of cat.boards) {
        boardCache.set(board.url, board);
        newBoards.push(board);
      }
    }
    return newBoards;
  };

  /**
   * Fetch BBS menu from network, update cache, and detect board transfers.
   * Reuses the old board list captured before the fetch for transfer detection.
   *
   * Guards against cache corruption: if the fetched menu contains no categories
   * (e.g. server returned a CAPTCHA/error page with HTTP 200) but a non-empty
   * cache already exists, the cache and in-memory boardCache are left untouched.
   */
  const fetchAndUpdateMenu = async (oldBoards: Board[]): Promise<BBSMenu> => {
    const menu = await fetchBBSMenu();

    // Guard: do not overwrite a good cache with an empty menu.
    // This protects against 5ch returning non-standard HTML (CAPTCHA, error page)
    // that parseBBSMenuHtml cannot extract boards from.
    if (menu.categories.length === 0 && oldBoards.length > 0) {
      logger.warn(
        'Fetched BBS menu has 0 categories but boardCache has entries — skipping cache save to prevent corruption',
      );
      return menu;
    }

    await saveBBSMenuCache(dataDir, menu);
    const newBoards = populateBoardCache(menu);

    if (oldBoards.length > 0) {
      const transfers = detectTransfers(oldBoards, newBoards);
      if (transfers.size > 0) {
        await applyBoardTransfers(transfers, dataDir);
      }
    }
    return menu;
  };

  handle('bbs:fetch-menu', async () => {
    const oldBoards: Board[] = [];
    for (const b of boardCache.values()) {
      oldBoards.push(b);
    }

    // Cache-first: return cached menu and refresh in background
    const cached = await loadBBSMenuCacheAsync(dataDir);
    if (cached !== null) {
      populateBoardCache(cached);
      // Background refresh — do not block the renderer
      void fetchAndUpdateMenu(Array.from(boardCache.values())).catch((err: unknown) => {
        logger.error('Background BBS menu refresh failed', err instanceof Error ? err : undefined);
      });
      return cached;
    }

    // No cache — must fetch from network
    try {
      return await fetchAndUpdateMenu(oldBoards);
    } catch (err) {
      logger.error('Failed to fetch BBS menu', err instanceof Error ? err : undefined);
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
    const result =
      plugin !== undefined
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
    await ensureDirAsync(boardDir);
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
          ...(updates.scrollResNumber !== undefined
            ? { scrollResNumber: updates.scrollResNumber }
            : {}),
          ...(updates.scrollResOffset !== undefined
            ? { scrollResOffset: updates.scrollResOffset }
            : {}),
          ...(updates.lastModified !== undefined ? { lastModified: updates.lastModified } : {}),
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
        scrollResNumber: updates.scrollResNumber ?? 0,
        scrollResOffset: updates.scrollResOffset ?? 0,
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

  handle('fav:add-folder', async (title: string) => {
    await addFavFolder(dataDir, title);
  });

  handle('fav:add-separator', async () => {
    await addFavSeparator(dataDir);
  });

  handle('fav:move-to-folder', async (nodeId: string, folderId: string) => {
    await moveFavNodeToFolder(dataDir, nodeId, folderId);
  });

  handle('fav:reorder', async (dragNodeId: string, dropNodeId: string, position) => {
    await reorderFavNode(dataDir, dragNodeId, dropNodeId, position);
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

  // Synchronous save handlers for beforeunload (blocks renderer until write completes)
  ipcMain.on('tab:save-sync', (event, tabs: unknown) => {
    try {
      saveTabsSync(dataDir, tabs as readonly SavedTab[]);
    } catch (err) {
      logger.error(`tab:save-sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    event.returnValue = null;
  });

  ipcMain.on('session:save-sync', (event, state: unknown) => {
    try {
      saveSessionStateSync(dataDir, state as SessionState);
    } catch (err) {
      logger.error(`session:save-sync failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    event.returnValue = null;
  });

  // Browsing history (loaded async in parallel below)
  // loadBrowsingHistoryAsync is awaited as part of the parallel startup.

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
  handle('search:local', async (query) => {
    const board = lookupBoard(query.boardUrl);
    return searchLocal(query, dataDir, board.boardType);
  });

  handle('search:local-all', async (query) => {
    return searchLocalAll(query, dataDir);
  });

  handle('search:remote', async (query) => {
    return searchRemoteThreads(
      query.keywords,
      query.start !== undefined ? { start: query.start } : undefined,
    );
  });

  // Round list (loaded async in parallel below)

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

  const executeRound = async (): Promise<void> => {
    const boards = getRoundBoards();
    const items = getRoundItems();
    const updatedBoards: string[] = [];
    const updatedThreads: Array<{ boardUrl: string; threadId: string }> = [];
    for (const board of boards) {
      try {
        const boardObj = lookupBoard(board.url);
        const plugin = getBoardPlugin(boardObj.boardType);
        if (plugin !== undefined) {
          await plugin.fetchSubject(boardObj, dataDir);
        } else {
          await fetchSubject(boardObj, dataDir);
        }
        updatedBoards.push(board.url);
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
        updatedThreads.push({ boardUrl: item.url, threadId });
      } catch {
        logger.warn(`Round: failed to fetch dat for ${item.url}/${item.fileName}`);
      }
    }
    const win = BrowserWindow.getAllWindows()[0];
    if (win !== undefined) {
      win.webContents.send('round:completed', { updatedBoards, updatedThreads });
    }
    logger.info(
      `Round completed: ${String(updatedBoards.length)} boards, ${String(updatedThreads.length)} threads`,
    );
  };

  handle('round:set-timer', async (config) => {
    await setTimerConfig(dataDir, config);
  });

  handle('round:execute', async () => {
    await executeRound();
  });

  // Round timer is initialized after parallel startup load (see below).

  // Post history
  handle('post:save-history', async (entry) => {
    await savePostHistory(dataDir, entry);
  });

  handle('post:clear-related-data', async () => {
    const clearedCookies = getAllCookies().length;
    clearAllCookies();
    upliftLogout();
    beLogout();
    resetDonguriState();
    await saveCookies(dataDir);
    logger.info(`Cleared post-related data for retry recovery (${String(clearedCookies)} cookies)`);
    return { clearedCookies };
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

  // Cookie store and proxy config loaded async in parallel below.

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

  handle('cookie:get-all', () => {
    return Promise.resolve(getAllCookies());
  });

  // Proxy config loaded async in parallel below.

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

  // Bulk image save — select folder, then download all URLs
  handle('image:save-bulk', async (urls: readonly string[]) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win === null) return { saved: 0, folder: '' };

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '画像の保存先フォルダを選択',
    });

    if (result.canceled || result.filePaths[0] === undefined) {
      return { saved: 0, folder: '' };
    }

    const folder = result.filePaths[0];
    let saved = 0;
    const seen = new Set<string>();

    for (const url of urls) {
      try {
        const urlObj = new URL(url);
        const rawName = urlObj.pathname.split('/').pop() ?? '';
        const baseName = rawName.length > 0 ? rawName : `image_${String(saved + 1)}.jpg`;
        // Deduplicate filenames
        let destName = baseName;
        let counter = 1;
        while (seen.has(destName)) {
          const dot = baseName.lastIndexOf('.');
          destName =
            dot !== -1
              ? `${baseName.slice(0, dot)}_${String(counter)}${baseName.slice(dot)}`
              : `${baseName}_${String(counter)}`;
          counter++;
        }
        seen.add(destName);

        const res = await fetch(url);
        const buffer = Buffer.from(await res.arrayBuffer());
        await writeFile(join(folder, destName), buffer);
        saved++;
      } catch (err) {
        logger.warn(`image:save-bulk 個別エラー url=${url} err=${String(err)}`);
      }
    }

    return { saved, folder };
  });

  // Open URL in external browser
  handle('shell:open-external', async (url: string) => {
    await shell.openExternal(url);
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
  handle('diag:add-log', (level, tag, message) => {
    pushEntry(level, tag, message);
    return Promise.resolve();
  });

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

  handle('dsl:save-file', async (content: string, suggestedName: string) => {
    const win = BrowserWindow.getFocusedWindow();
    if (win === null) return { saved: false, path: '' };

    const result = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName,
      filters: [
        { name: 'VBBS Script', extensions: ['vbbs'] },
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
    const response = await httpFetch(
      {
        url: `http://ip-api.com/json/${encodeURIComponent(lookupIp)}?lang=ja&fields=country,regionName,city,isp,org,as,query`,
        method: 'GET',
        acceptGzip: true,
      },
      { maxRetries: 1, initialDelayMs: 500, maxDelayMs: 2000, retryableStatuses: [429, 503] },
    );
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

  handle('update:check', async () => {
    return checkForUpdate();
  });

  handle('update:download-and-install', async () => {
    const windows = BrowserWindow.getAllWindows();
    await downloadAndInstall((progress) => {
      for (const win of windows) {
        win.webContents.send('update:progress', progress);
      }
    });
  });

  // Ensure data directory exists before loading startup data
  await ensureDirAsync(dataDir);

  // Load startup data and plugins in parallel (non-blocking I/O)
  await Promise.all([
    loadBrowsingHistoryAsync(dataDir),
    loadRoundListsAsync(dataDir),
    loadCookiesAsync(dataDir),
    loadProxyConfigAsync(dataDir),
    initializeBoardPlugins(),
  ]);

  // Initialize round timer after round lists are loaded
  const timerConfig = getTimerConfig();
  startRoundTimer(timerConfig.intervalMinutes, executeRound);
  if (!timerConfig.enabled) {
    stopRoundTimer();
  }

  logger.info('IPC handlers registered');
}
