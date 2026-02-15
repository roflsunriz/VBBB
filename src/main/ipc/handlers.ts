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
    return fetchSubject(board, dataDir);
  });

  handle('bbs:fetch-dat', async (boardUrl: string, threadId: string) => {
    const board = lookupBoard(boardUrl);
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

  logger.info('IPC handlers registered');
}
