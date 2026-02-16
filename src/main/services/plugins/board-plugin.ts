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
 * Called at startup to register JBBS/Shitaraba plugins.
 */
export function initializeBoardPlugins(): void {
  // Dynamic import to avoid circular dependencies
  // These are registered in the IPC handler initialization
  void import('./jbbs-plugin').then(({ createJBBSPlugin }) => {
    const jbbsPlugin = createJBBSPlugin();
    registerBoardPlugin(BoardType.JBBS, jbbsPlugin);
    registerBoardPlugin(BoardType.Shitaraba, jbbsPlugin);
  });
}
