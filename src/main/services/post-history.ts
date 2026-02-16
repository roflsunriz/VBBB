/**
 * Post history service.
 * Records sent posts to sent.ini with size-based rotation.
 * Format: [timestamp] section + key-value pairs.
 */
import { existsSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PostHistoryEntry } from '@shared/post-history';
import { SENT_INI_MAX_SIZE } from '@shared/post-history';
import { createLogger } from '../logger';
import { atomicAppendFile, readFileSafe } from './file-io';

const logger = createLogger('post-history');

const SENT_INI_FILE = 'sent.ini';
const SENT_INI_BACKUP = 'sent.ini.1';

/**
 * Serialize a post history entry to ini format.
 */
export function serializeHistoryEntry(entry: PostHistoryEntry): string {
  const lines = [
    `[${entry.timestamp}]`,
    `BoardUrl=${entry.boardUrl}`,
    `ThreadId=${entry.threadId}`,
    `Name=${entry.name}`,
    `Mail=${entry.mail}`,
    `Message=${entry.message.replace(/\n/g, '\\n')}`,
    '',
  ];
  return lines.join('\n');
}

/**
 * Parse sent.ini content into PostHistoryEntry array.
 */
export function parseSentIni(content: string): PostHistoryEntry[] {
  const entries: PostHistoryEntry[] = [];
  let current: Partial<PostHistoryEntry> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      if (current.timestamp !== undefined) {
        entries.push({
          timestamp: current.timestamp,
          boardUrl: current.boardUrl ?? '',
          threadId: current.threadId ?? '',
          name: current.name ?? '',
          mail: current.mail ?? '',
          message: current.message ?? '',
        });
        current = {};
      }
      continue;
    }

    // Section header: [timestamp]
    const sectionMatch = /^\[(.+)]$/.exec(trimmed);
    if (sectionMatch?.[1] !== undefined) {
      // If we have a previous entry, save it
      if (current.timestamp !== undefined) {
        entries.push({
          timestamp: current.timestamp,
          boardUrl: current.boardUrl ?? '',
          threadId: current.threadId ?? '',
          name: current.name ?? '',
          mail: current.mail ?? '',
          message: current.message ?? '',
        });
      }
      current = { timestamp: sectionMatch[1] };
      continue;
    }

    // Key-value pairs
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx);
      const value = trimmed.substring(eqIdx + 1);
      switch (key) {
        case 'BoardUrl':
          current = { ...current, boardUrl: value };
          break;
        case 'ThreadId':
          current = { ...current, threadId: value };
          break;
        case 'Name':
          current = { ...current, name: value };
          break;
        case 'Mail':
          current = { ...current, mail: value };
          break;
        case 'Message':
          current = { ...current, message: value.replace(/\\n/g, '\n') };
          break;
        default:
          break;
      }
    }
  }

  // Last entry if not terminated by blank line
  if (current.timestamp !== undefined) {
    entries.push({
      timestamp: current.timestamp,
      boardUrl: current.boardUrl ?? '',
      threadId: current.threadId ?? '',
      name: current.name ?? '',
      mail: current.mail ?? '',
      message: current.message ?? '',
    });
  }

  return entries;
}

/**
 * Check if sent.ini needs rotation.
 */
function needsRotation(filePath: string, maxSize: number): boolean {
  try {
    if (!existsSync(filePath)) return false;
    const stats = statSync(filePath);
    return stats.size >= maxSize;
  } catch {
    return false;
  }
}

/**
 * Rotate sent.ini -> sent.ini.1
 */
function rotateSentIni(dataDir: string): void {
  const filePath = join(dataDir, SENT_INI_FILE);
  const backupPath = join(dataDir, SENT_INI_BACKUP);
  try {
    if (existsSync(backupPath)) {
      // Overwrite old backup
      renameSync(filePath, backupPath);
    } else {
      renameSync(filePath, backupPath);
    }
    logger.info('Rotated sent.ini');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Failed to rotate sent.ini: ${errMsg}`);
  }
}

/**
 * Save a post to history with rotation.
 */
export async function savePostHistory(
  dataDir: string,
  entry: PostHistoryEntry,
  maxSize: number = SENT_INI_MAX_SIZE,
): Promise<void> {
  const filePath = join(dataDir, SENT_INI_FILE);

  // Check rotation
  if (needsRotation(filePath, maxSize)) {
    rotateSentIni(dataDir);
  }

  const content = serializeHistoryEntry(entry);
  await atomicAppendFile(filePath, Buffer.from(content, 'utf-8'));
  logger.info('Saved post history entry');
}

/**
 * Load post history from sent.ini.
 */
export function loadPostHistory(dataDir: string): PostHistoryEntry[] {
  const filePath = join(dataDir, SENT_INI_FILE);
  const content = readFileSafe(filePath);
  if (content === null) return [];
  return parseSentIni(content.toString('utf-8'));
}
