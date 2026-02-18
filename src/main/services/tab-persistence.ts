/**
 * Tab persistence service.
 * Saves/restores open tabs to tab.sav.
 * Format: 1 line per tab, fields separated by TAB.
 */
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SavedTab, SessionState } from '@shared/history';
import { createLogger } from '../logger';
import { atomicWriteFile, readFileSafe } from './file-io';

const logger = createLogger('tab-persistence');

const TAB_SAV_FILE = 'tab.sav';
const SESSION_FILE = 'session.json';

/**
 * Parse tab.sav content into SavedTab array.
 * Format: boardUrl \t threadId \t title [\t scrollTop [\t scrollResNumber]]
 * Fields 4 and 5 are optional for backward compatibility.
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
    // scrollTop 0 is semantically identical to "no saved position" (start from top),
    // so omit the property entirely to ensure proper round-tripping.
    const resolvedScroll = scrollTop !== undefined && Number.isFinite(scrollTop) && scrollTop > 0 ? scrollTop : undefined;

    const rawResNum = fields[4];
    const parsedResNum = rawResNum !== undefined && rawResNum.length > 0 ? Number(rawResNum) : undefined;
    const resolvedResNum = parsedResNum !== undefined && Number.isFinite(parsedResNum) && parsedResNum > 0 ? parsedResNum : undefined;

    tabs.push({
      boardUrl,
      threadId,
      title,
      ...(resolvedScroll !== undefined ? { scrollTop: resolvedScroll } : {}),
      ...(resolvedResNum !== undefined ? { scrollResNumber: resolvedResNum } : {}),
    });
  }
  return tabs;
}

/**
 * Serialize SavedTab array to tab.sav format.
 * Format: boardUrl \t threadId \t title \t scrollTop \t scrollResNumber
 */
export function serializeTabSav(tabs: readonly SavedTab[]): string {
  return tabs
    .map((t) => `${t.boardUrl}\t${t.threadId}\t${t.title}\t${String(t.scrollTop ?? 0)}\t${String(t.scrollResNumber ?? 0)}`)
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
 * Save tabs to disk (async, with locking).
 */
export async function saveTabs(dataDir: string, tabs: readonly SavedTab[]): Promise<void> {
  const filePath = join(dataDir, TAB_SAV_FILE);
  const content = serializeTabSav(tabs);
  await atomicWriteFile(filePath, content);
  logger.info(`Saved ${String(tabs.length)} tabs`);
}

/**
 * Save tabs to disk synchronously (for use in beforeunload / process exit).
 * Bypasses the async lock — safe because the process is about to exit.
 */
export function saveTabsSync(dataDir: string, tabs: readonly SavedTab[]): void {
  const filePath = join(dataDir, TAB_SAV_FILE);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = serializeTabSav(tabs);
  const tmpPath = `${filePath}.tmp.sync.${String(Date.now())}`;
  writeFileSync(tmpPath, content);
  if (existsSync(filePath)) {
    const bakPath = `${filePath}.bak`;
    try {
      if (existsSync(bakPath)) unlinkSync(bakPath);
      renameSync(filePath, bakPath);
    } catch {
      // Backup error is non-fatal
    }
  }
  renameSync(tmpPath, filePath);
  logger.info(`Saved ${String(tabs.length)} tabs (sync)`);
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
 * Save session state to disk (async, with locking).
 */
export async function saveSessionState(dataDir: string, state: SessionState): Promise<void> {
  const filePath = join(dataDir, SESSION_FILE);
  await atomicWriteFile(filePath, JSON.stringify(state));
}

/**
 * Save session state to disk synchronously (for use in beforeunload / process exit).
 * Bypasses the async lock — safe because the process is about to exit.
 */
export function saveSessionStateSync(dataDir: string, state: SessionState): void {
  const filePath = join(dataDir, SESSION_FILE);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const content = JSON.stringify(state);
  const tmpPath = `${filePath}.tmp.sync.${String(Date.now())}`;
  writeFileSync(tmpPath, content);
  if (existsSync(filePath)) {
    const bakPath = `${filePath}.bak`;
    try {
      if (existsSync(bakPath)) unlinkSync(bakPath);
      renameSync(filePath, bakPath);
    } catch {
      // Backup error is non-fatal
    }
  }
  renameSync(tmpPath, filePath);
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
