/**
 * Board transfer (板移転) detection and URL replacement service.
 * Detects when a board moves to a new host and updates all references.
 */
import type { Board } from '@shared/domain';
import type { FavNode, FavTree } from '@shared/favorite';
import { createLogger } from '../logger';
import { loadFavorites, saveFavorites } from './favorite';
import { replaceRoundBoardUrls, replaceRoundItemUrls, saveRoundBoard, saveRoundItem } from './round-list';
import { loadSavedTabs, replaceTabUrls, saveTabs } from './tab-persistence';

const logger = createLogger('board-transfer');

/**
 * Detect board transfers by comparing old and new board lists.
 * A transfer is detected when the same bbsId (path) exists on a different host.
 * Returns a map of old URL -> new URL for boards that moved.
 */
export function detectTransfers(
  oldBoards: readonly Board[],
  newBoards: readonly Board[],
): Map<string, string> {
  const transfers = new Map<string, string>();

  // Build a map of bbsId -> board for old boards
  const oldByBbsId = new Map<string, Board>();
  for (const board of oldBoards) {
    oldByBbsId.set(board.bbsId, board);
  }

  for (const newBoard of newBoards) {
    const oldBoard = oldByBbsId.get(newBoard.bbsId);
    if (oldBoard === undefined) continue;

    // Compare URLs: same bbsId but different host = transfer
    if (oldBoard.url !== newBoard.url) {
      try {
        const oldUrl = new URL(oldBoard.url);
        const newUrl = new URL(newBoard.url);
        // Must be same path but different host
        if (oldUrl.pathname === newUrl.pathname && oldUrl.hostname !== newUrl.hostname) {
          transfers.set(oldBoard.url, newBoard.url);
          logger.info(`Board transfer detected: ${oldBoard.url} -> ${newBoard.url}`);
        }
      } catch {
        // Invalid URLs — skip
      }
    }
  }

  return transfers;
}

/**
 * Replace URLs in favorite tree nodes recursively.
 */
function replaceFavNodeUrls(node: FavNode, urlMap: ReadonlyMap<string, string>): FavNode {
  if (node.kind === 'folder') {
    return {
      ...node,
      children: node.children.map((child) => replaceFavNodeUrls(child, urlMap)),
    };
  }
  // FavItem
  const newUrl = urlMap.get(node.url);
  if (newUrl !== undefined) {
    return { ...node, url: newUrl };
  }
  // Also check if the URL starts with any old board URL (for thread URLs)
  for (const [oldUrl, newBaseUrl] of urlMap) {
    if (node.url.startsWith(oldUrl)) {
      return { ...node, url: node.url.replace(oldUrl, newBaseUrl) };
    }
  }
  return node;
}

/**
 * Apply transfers to all persistent stores: favorites, tabs, round lists.
 */
export async function applyBoardTransfers(
  urlMap: ReadonlyMap<string, string>,
  dataDir: string,
): Promise<void> {
  if (urlMap.size === 0) return;

  logger.info(`Applying ${String(urlMap.size)} board transfers`);

  // Update favorites
  try {
    const favTree = loadFavorites(dataDir);
    const updatedFavTree: FavTree = {
      children: favTree.children.map((n) => replaceFavNodeUrls(n, urlMap)),
    };
    await saveFavorites(dataDir, updatedFavTree);
    logger.info('Updated favorites URLs');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to update favorites: ${errMsg}`);
  }

  // Update saved tabs
  try {
    const tabs = loadSavedTabs(dataDir);
    const updatedTabs = replaceTabUrls(tabs, urlMap);
    await saveTabs(dataDir, updatedTabs);
    logger.info('Updated tab URLs');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to update tabs: ${errMsg}`);
  }

  // Update round lists
  try {
    replaceRoundBoardUrls(urlMap);
    await saveRoundBoard(dataDir);
    replaceRoundItemUrls(urlMap);
    await saveRoundItem(dataDir);
    logger.info('Updated round list URLs');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to update round lists: ${errMsg}`);
  }
}
