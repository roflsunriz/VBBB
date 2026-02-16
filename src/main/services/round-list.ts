/**
 * Round (patrol) list service.
 * Manages RoundBoard.2ch / RoundItem.2ch files and scheduled fetching.
 */
import { join } from 'node:path';
import type { RoundBoardEntry, RoundItemEntry, RoundTimerConfig } from '@shared/round';
import { ROUND_FILE_VERSION, ROUND_SEPARATOR, DEFAULT_ROUND_TIMER } from '@shared/round';
import { createLogger } from '../logger';
import { atomicWriteFile, readFileSafe } from './file-io';

const logger = createLogger('round-list');

const ROUND_BOARD_FILE = 'RoundBoard.2ch';
const ROUND_ITEM_FILE = 'RoundItem.2ch';
const ROUND_TIMER_FILE = 'round-timer.json';

/** In-memory state */
let boardEntries: RoundBoardEntry[] = [];
let itemEntries: RoundItemEntry[] = [];
let timerConfig: RoundTimerConfig = { ...DEFAULT_ROUND_TIMER };
let roundTimer: ReturnType<typeof setInterval> | null = null;
let roundCallback: (() => Promise<void>) | null = null;

// ---------------------------------------------------------------------------
// Parse / Serialize
// ---------------------------------------------------------------------------

/**
 * Parse RoundBoard.2ch content.
 * Format: version line, then per line: URL#1BoardTitle#1RoundName
 */
export function parseRoundBoard(content: string): RoundBoardEntry[] {
  const lines = content.split('\n');
  const entries: RoundBoardEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (line === undefined || line.length === 0) continue;
    if (i === 0 && line === ROUND_FILE_VERSION) continue;

    const parts = line.split(ROUND_SEPARATOR);
    const url = parts[0] ?? '';
    const boardTitle = parts[1] ?? '';
    const roundName = parts[2] ?? '';
    if (url.length === 0) continue;
    entries.push({ url, boardTitle, roundName });
  }
  return entries;
}

/**
 * Serialize RoundBoard entries.
 */
export function serializeRoundBoard(entries: readonly RoundBoardEntry[]): string {
  const lines: string[] = [ROUND_FILE_VERSION];
  for (const e of entries) {
    lines.push(`${e.url}${ROUND_SEPARATOR}${e.boardTitle}${ROUND_SEPARATOR}${e.roundName}`);
  }
  return lines.join('\n');
}

/**
 * Parse RoundItem.2ch content.
 * Format: version line, then per line: URL#1BoardTitle#1FileName#1ThreadTitle#1RoundName
 */
export function parseRoundItem(content: string): RoundItemEntry[] {
  const lines = content.split('\n');
  const entries: RoundItemEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (line === undefined || line.length === 0) continue;
    if (i === 0 && line === ROUND_FILE_VERSION) continue;

    const parts = line.split(ROUND_SEPARATOR);
    const url = parts[0] ?? '';
    const boardTitle = parts[1] ?? '';
    const fileName = parts[2] ?? '';
    const threadTitle = parts[3] ?? '';
    const roundName = parts[4] ?? '';
    if (url.length === 0) continue;
    entries.push({ url, boardTitle, fileName, threadTitle, roundName });
  }
  return entries;
}

/**
 * Serialize RoundItem entries.
 */
export function serializeRoundItem(entries: readonly RoundItemEntry[]): string {
  const lines: string[] = [ROUND_FILE_VERSION];
  for (const e of entries) {
    lines.push(
      `${e.url}${ROUND_SEPARATOR}${e.boardTitle}${ROUND_SEPARATOR}${e.fileName}${ROUND_SEPARATOR}${e.threadTitle}${ROUND_SEPARATOR}${e.roundName}`,
    );
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Load / Save
// ---------------------------------------------------------------------------

export function loadRoundLists(dataDir: string): void {
  const boardContent = readFileSafe(join(dataDir, ROUND_BOARD_FILE));
  if (boardContent !== null) {
    boardEntries = parseRoundBoard(boardContent.toString('utf-8'));
    logger.info(`Loaded ${String(boardEntries.length)} round board entries`);
  }

  const itemContent = readFileSafe(join(dataDir, ROUND_ITEM_FILE));
  if (itemContent !== null) {
    itemEntries = parseRoundItem(itemContent.toString('utf-8'));
    logger.info(`Loaded ${String(itemEntries.length)} round item entries`);
  }

  const timerContent = readFileSafe(join(dataDir, ROUND_TIMER_FILE));
  if (timerContent !== null) {
    try {
      const parsed: unknown = JSON.parse(timerContent.toString('utf-8'));
      if (typeof parsed === 'object' && parsed !== null && 'enabled' in parsed && 'intervalMinutes' in parsed) {
        timerConfig = {
          enabled: Boolean((parsed as { enabled: unknown }).enabled),
          intervalMinutes: Number((parsed as { intervalMinutes: unknown }).intervalMinutes),
        };
      }
    } catch {
      // Use defaults
    }
  }
}

export async function saveRoundBoard(dataDir: string): Promise<void> {
  await atomicWriteFile(join(dataDir, ROUND_BOARD_FILE), serializeRoundBoard(boardEntries));
}

export async function saveRoundItem(dataDir: string): Promise<void> {
  await atomicWriteFile(join(dataDir, ROUND_ITEM_FILE), serializeRoundItem(itemEntries));
}

async function saveTimerConfig(dataDir: string): Promise<void> {
  await atomicWriteFile(join(dataDir, ROUND_TIMER_FILE), JSON.stringify(timerConfig, null, 2));
}

// ---------------------------------------------------------------------------
// CRUD Operations
// ---------------------------------------------------------------------------

export function getRoundBoards(): readonly RoundBoardEntry[] {
  return boardEntries;
}

export function getRoundItems(): readonly RoundItemEntry[] {
  return itemEntries;
}

export function addRoundBoard(entry: RoundBoardEntry): void {
  if (boardEntries.some((e) => e.url === entry.url)) return;
  boardEntries.push(entry);
}

export function removeRoundBoard(url: string): void {
  boardEntries = boardEntries.filter((e) => e.url !== url);
}

export function addRoundItem(entry: RoundItemEntry): void {
  if (itemEntries.some((e) => e.url === entry.url && e.fileName === entry.fileName)) return;
  itemEntries.push(entry);
}

export function removeRoundItem(url: string, fileName: string): void {
  itemEntries = itemEntries.filter((e) => !(e.url === url && e.fileName === fileName));
}

// ---------------------------------------------------------------------------
// URL Replacement (for board transfer)
// ---------------------------------------------------------------------------

export function replaceRoundBoardUrls(urlMap: ReadonlyMap<string, string>): void {
  boardEntries = boardEntries.map((e) => {
    const newUrl = urlMap.get(e.url);
    return newUrl !== undefined ? { ...e, url: newUrl } : e;
  });
}

export function replaceRoundItemUrls(urlMap: ReadonlyMap<string, string>): void {
  itemEntries = itemEntries.map((e) => {
    const newUrl = urlMap.get(e.url);
    return newUrl !== undefined ? { ...e, url: newUrl } : e;
  });
}

// ---------------------------------------------------------------------------
// Timer Management
// ---------------------------------------------------------------------------

export function getTimerConfig(): RoundTimerConfig {
  return timerConfig;
}

export async function setTimerConfig(dataDir: string, config: RoundTimerConfig): Promise<void> {
  timerConfig = config;
  await saveTimerConfig(dataDir);

  // Restart timer if needed
  if (config.enabled && roundCallback !== null) {
    startRoundTimer(config.intervalMinutes, roundCallback);
  } else {
    stopRoundTimer();
  }
}

export function startRoundTimer(intervalMinutes: number, callback: () => Promise<void>): void {
  stopRoundTimer();
  roundCallback = callback;
  const intervalMs = intervalMinutes * 60 * 1000;
  roundTimer = setInterval(() => {
    void callback();
  }, intervalMs);
  logger.info(`Round timer started: every ${String(intervalMinutes)} minutes`);
}

export function stopRoundTimer(): void {
  if (roundTimer !== null) {
    clearInterval(roundTimer);
    roundTimer = null;
    logger.info('Round timer stopped');
  }
}
