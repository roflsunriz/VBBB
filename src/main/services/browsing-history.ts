/**
 * Browsing history service.
 * Tracks recently viewed threads with a max entry limit.
 * Persisted to {ConfigDir}/history.json.
 */
import { join } from 'node:path';
import type { BrowsingHistoryEntry } from '@shared/history';
import { MAX_HISTORY_ENTRIES } from '@shared/history';
import { createLogger } from '../logger';
import { atomicWriteFile, readFileSafe } from './file-io';

const logger = createLogger('browsing-history');

const HISTORY_FILE = 'history.json';

let history: BrowsingHistoryEntry[] = [];

/**
 * Load browsing history from disk.
 */
export function loadBrowsingHistory(dataDir: string): readonly BrowsingHistoryEntry[] {
  const filePath = join(dataDir, HISTORY_FILE);
  const content = readFileSafe(filePath);
  if (content === null) {
    history = [];
    return history;
  }
  try {
    const parsed: unknown = JSON.parse(content.toString('utf-8'));
    if (Array.isArray(parsed)) {
      history = parsed.filter(
        (entry): entry is BrowsingHistoryEntry =>
          typeof entry === 'object' &&
          entry !== null &&
          'boardUrl' in entry &&
          'threadId' in entry &&
          'title' in entry &&
          'lastVisited' in entry,
      );
    }
  } catch {
    history = [];
  }
  logger.info(`Loaded ${String(history.length)} history entries`);
  return history;
}

/**
 * Save browsing history to disk.
 */
export async function saveBrowsingHistory(dataDir: string): Promise<void> {
  const filePath = join(dataDir, HISTORY_FILE);
  await atomicWriteFile(filePath, JSON.stringify(history, null, 2));
}

/**
 * Add or update a history entry. Moves existing entries to the front.
 */
export function addHistoryEntry(
  boardUrl: string,
  threadId: string,
  title: string,
): readonly BrowsingHistoryEntry[] {
  // Remove existing entry for this thread
  history = history.filter(
    (e) => !(e.boardUrl === boardUrl && e.threadId === threadId),
  );

  // Add to front
  history.unshift({
    boardUrl,
    threadId,
    title,
    lastVisited: new Date().toISOString(),
  });

  // Trim to max
  if (history.length > MAX_HISTORY_ENTRIES) {
    history = history.slice(0, MAX_HISTORY_ENTRIES);
  }

  return history;
}

/**
 * Get current browsing history.
 */
export function getBrowsingHistory(): readonly BrowsingHistoryEntry[] {
  return history;
}

/**
 * Clear all history.
 */
export function clearBrowsingHistory(): void {
  history = [];
}
