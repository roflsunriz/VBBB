/**
 * Atomic file I/O with locking and backup support.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createLogger } from '../logger';

const logger = createLogger('file-io');

/** Simple file lock tracking (process-level) */
const lockedFiles = new Set<string>();

const MAX_LOCK_RETRIES = 5;
const LOCK_RETRY_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Acquire a process-level lock on a file path.
 * Retries with short delay to handle DAT save contention.
 */
async function acquireLock(filePath: string): Promise<void> {
  for (let i = 0; i < MAX_LOCK_RETRIES; i++) {
    if (!lockedFiles.has(filePath)) {
      lockedFiles.add(filePath);
      return;
    }
    await sleep(LOCK_RETRY_DELAY_MS);
  }
  throw new Error(`Failed to acquire lock for ${filePath} after ${String(MAX_LOCK_RETRIES)} retries`);
}

function releaseLock(filePath: string): void {
  lockedFiles.delete(filePath);
}

/**
 * Write content to a file atomically via a temporary file.
 * Creates parent directories if needed.
 * Creates a .bak backup of existing file for recovery.
 */
export async function atomicWriteFile(filePath: string, content: Buffer | string): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  await acquireLock(filePath);
  try {
    const tmpPath = `${filePath}.tmp.${String(Date.now())}`;

    // Write to temp file
    writeFileSync(tmpPath, content);

    // Backup existing file
    if (existsSync(filePath)) {
      const bakPath = `${filePath}.bak`;
      try {
        if (existsSync(bakPath)) {
          unlinkSync(bakPath);
        }
        renameSync(filePath, bakPath);
      } catch (err) {
        logger.warn(`Failed to create backup for ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Atomic rename
    renameSync(tmpPath, filePath);
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Append content to a file atomically.
 * Reads existing content, appends, then does atomic write.
 */
export async function atomicAppendFile(filePath: string, content: Buffer): Promise<void> {
  await acquireLock(filePath);
  try {
    let existing = Buffer.alloc(0);
    if (existsSync(filePath)) {
      existing = readFileSync(filePath);
    }
    const combined = Buffer.concat([existing, content]);
    const tmpPath = `${filePath}.tmp.${String(Date.now())}`;
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(tmpPath, combined);
    if (existsSync(filePath)) {
      const bakPath = `${filePath}.bak`;
      try {
        if (existsSync(bakPath)) {
          unlinkSync(bakPath);
        }
        renameSync(filePath, bakPath);
      } catch {
        // Continue even if backup fails
      }
    }
    renameSync(tmpPath, filePath);
  } finally {
    releaseLock(filePath);
  }
}

/**
 * Read a file's contents. Returns null if the file doesn't exist.
 */
export function readFileSafe(filePath: string): Buffer | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath);
}

/**
 * Read the last N bytes of a file. Returns null if file doesn't exist.
 */
export function readFileLastBytes(filePath: string, n: number): Buffer | null {
  const content = readFileSafe(filePath);
  if (content === null) {
    return null;
  }
  if (content.length <= n) {
    return content;
  }
  return content.subarray(content.length - n);
}

/**
 * Ensure a directory exists.
 */
export function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get the board local directory path.
 */
export function getBoardDir(dataDir: string, boardUrl: string): string {
  const url = new URL(boardUrl);
  const host = url.hostname;
  const pathSegments = url.pathname.split('/').filter((s) => s.length > 0);
  const bbsId = pathSegments[pathSegments.length - 1] ?? 'unknown';
  return join(dataDir, 'logs', host, bbsId);
}
