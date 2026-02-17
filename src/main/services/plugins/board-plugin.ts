/**
 * Board plugin interface and factory.
 * Provides strategy pattern for board-type-specific operations.
 */
import type { Board, DatFetchResult, PostParams, PostResult, SubjectFetchResult } from '@shared/domain';
import { BoardType } from '@shared/domain';

/** Interface for board-type-specific operations */
export interface BoardPlugin {
  /** Fetch subject.txt (thread list) */
  fetchSubject(board: Board, dataDir: string): Promise<SubjectFetchResult>;
  /** Fetch DAT (thread content) */
  fetchDat(board: Board, threadId: string, dataDir: string): Promise<DatFetchResult>;
  /** Post a response */
  postResponse(params: PostParams, board: Board): Promise<PostResult>;
}

/** Registry of board plugins, keyed by BoardType */
const pluginRegistry = new Map<BoardType, BoardPlugin>();

/**
 * Register a board plugin for a specific board type.
 */
export function registerBoardPlugin(boardType: BoardType, plugin: BoardPlugin): void {
  pluginRegistry.set(boardType, plugin);
}

/**
 * Get the plugin for a board type, or undefined if no specific plugin is registered.
 */
export function getBoardPlugin(boardType: BoardType): BoardPlugin | undefined {
  return pluginRegistry.get(boardType);
}

/**
 * Check if a board type has a registered plugin.
 */
export function hasBoardPlugin(boardType: BoardType): boolean {
  return pluginRegistry.has(boardType);
}

/**
 * Initialize all board plugins.
 * MUST be awaited before the renderer window is created; otherwise IPC
 * requests for JBBS/Machi boards may arrive before the plugins are
 * registered, causing fetchDat to use the wrong URL/format.
 */
export async function initializeBoardPlugins(): Promise<void> {
  // Dynamic import to avoid circular dependencies
  const [{ createJBBSPlugin }, { createMachiPlugin }] = await Promise.all([
    import('./jbbs-plugin'),
    import('./machi-plugin'),
  ]);
  const jbbsPlugin = createJBBSPlugin();
  registerBoardPlugin(BoardType.JBBS, jbbsPlugin);
  registerBoardPlugin(BoardType.Shitaraba, jbbsPlugin);
  const machiPlugin = createMachiPlugin();
  registerBoardPlugin(BoardType.MachiBBS, machiPlugin);
}
