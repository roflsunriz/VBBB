/**
 * Tab persistence service.
 * Saves/restores open tabs to tab.sav.
 * Format: 1 line per tab, fields separated by TAB.
 */
import { join } from 'node:path';
import type { SavedTab, SessionState } from '@shared/history';
import { createLogger } from '../logger';
import { atomicWriteFile, readFileSafe } from './file-io';

const logger = createLogger('tab-persistence');

const TAB_SAV_FILE = 'tab.sav';
const SESSION_FILE = 'session.json';

/**
 * Parse tab.sav content into SavedTab array.
 * Format: boardUrl \t threadId \t title [\t scrollTop]
 * The 4th field (scrollTop) is optional for backward compatibility.
 */
export function parseTabSav(content: string): SavedTab[] {
  const tabs: SavedTab[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const fields = trimmed.split('\t');
    const boardUrl = fields[0] ?? '';
    const threadId = fields[1] ?? '';
    const title = fields[2] ?? '';
    if (boardUrl.length === 0 || threadId.length === 0) continue;
    const rawScroll = fields[3];
    const scrollTop = rawScroll !== undefined && rawScroll.length > 0 ? Number(rawScroll) : undefined;
    tabs.push({
      boardUrl,
      threadId,
      title,
      scrollTop: scrollTop !== undefined && Number.isFinite(scrollTop) ? scrollTop : undefined,
    });
  }
  return tabs;
}

/**
 * Serialize SavedTab array to tab.sav format.
 * Format: boardUrl \t threadId \t title \t scrollTop
 */
export function serializeTabSav(tabs: readonly SavedTab[]): string {
  return tabs
    .map((t) => `${t.boardUrl}\t${t.threadId}\t${t.title}\t${String(t.scrollTop ?? 0)}`)
    .join('\n');
}

/**
 * Load saved tabs from disk.
 */
export function loadSavedTabs(dataDir: string): SavedTab[] {
  const filePath = join(dataDir, TAB_SAV_FILE);
  const content = readFileSafe(filePath);
  if (content === null) return [];
  const tabs = parseTabSav(content.toString('utf-8'));
  logger.info(`Loaded ${String(tabs.length)} saved tabs`);
  return tabs;
}

/**
 * Save tabs to disk.
 */
export async function saveTabs(dataDir: string, tabs: readonly SavedTab[]): Promise<void> {
  const filePath = join(dataDir, TAB_SAV_FILE);
  const content = serializeTabSav(tabs);
  await atomicWriteFile(filePath, content);
  logger.info(`Saved ${String(tabs.length)} tabs`);
}

/**
 * Load session state from disk.
 */
export function loadSessionState(dataDir: string): SessionState {
  const filePath = join(dataDir, SESSION_FILE);
  const content = readFileSafe(filePath);
  if (content === null) return { selectedBoardUrl: null };
  try {
    const parsed = JSON.parse(content.toString('utf-8')) as Record<string, unknown>;
    const boardUrl = typeof parsed['selectedBoardUrl'] === 'string' ? parsed['selectedBoardUrl'] : null;
    const activeThreadTabId = typeof parsed['activeThreadTabId'] === 'string' ? parsed['activeThreadTabId'] : undefined;
    const rawBoardTabUrls = parsed['boardTabUrls'];
    const boardTabUrls = Array.isArray(rawBoardTabUrls)
      ? (rawBoardTabUrls as unknown[]).filter((u): u is string => typeof u === 'string')
      : undefined;
    const activeBoardTabId = typeof parsed['activeBoardTabId'] === 'string' ? parsed['activeBoardTabId'] : undefined;
    return { selectedBoardUrl: boardUrl, activeThreadTabId, boardTabUrls, activeBoardTabId };
  } catch {
    return { selectedBoardUrl: null };
  }
}

/**
 * Save session state to disk.
 */
export async function saveSessionState(dataDir: string, state: SessionState): Promise<void> {
  const filePath = join(dataDir, SESSION_FILE);
  await atomicWriteFile(filePath, JSON.stringify(state));
}

/**
 * Replace board URLs in saved tabs (for board transfer).
 */
export function replaceTabUrls(
  tabs: readonly SavedTab[],
  urlMap: ReadonlyMap<string, string>,
): SavedTab[] {
  return tabs.map((tab) => {
    const newUrl = urlMap.get(tab.boardUrl);
    if (newUrl !== undefined) {
      return { ...tab, boardUrl: newUrl };
    }
    return tab;
  });
}
