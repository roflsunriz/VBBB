/**
 * Samba timer service.
 * Manages per-board posting interval restrictions (連投規制).
 * Reads Samba.ini for intervals and tracks last post times.
 */
import { join } from 'node:path';
import type { SambaInfo } from '@shared/domain';
import { readFileSafe, atomicWriteFile, ensureDir } from './file-io';
import { createLogger } from '../logger';

const logger = createLogger('samba');

const SETTING_SECTION = '[Setting]';
const SEND_SECTION = '[Send]';

/** Default interval when not configured (no restriction) */
const DEFAULT_INTERVAL = 0;

interface SambaData {
  /** Board key -> interval in seconds */
  readonly settings: ReadonlyMap<string, number>;
  /** Board key -> last post ISO timestamp */
  readonly sends: ReadonlyMap<string, string>;
}

/**
 * Parse Samba.ini file content.
 */
export function parseSambaIni(content: string): SambaData {
  const settings = new Map<string, number>();
  const sends = new Map<string, string>();
  let currentSection = '';

  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith(';')) continue;

    if (line.startsWith('[')) {
      currentSection = line;
      continue;
    }

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();

    if (currentSection === SETTING_SECTION) {
      const interval = Number(value);
      if (!Number.isNaN(interval) && interval >= 0) {
        settings.set(key, interval);
      }
    } else if (currentSection === SEND_SECTION) {
      sends.set(key, value);
    }
  }

  return { settings, sends };
}

/**
 * Serialize Samba data back to INI format.
 */
export function serializeSambaIni(data: SambaData): string {
  const lines: string[] = [];

  lines.push(SETTING_SECTION);
  for (const [key, value] of data.settings) {
    lines.push(`${key}=${String(value)}`);
  }

  lines.push('');
  lines.push(SEND_SECTION);
  for (const [key, value] of data.sends) {
    lines.push(`${key}=${value}`);
  }

  return lines.join('\n');
}

/**
 * Extract the host prefix from a board URL for Samba key lookup.
 * e.g. "https://eagle.5ch.net/livejupiter/" -> "eagle"
 */
function getHostPrefix(boardUrl: string): string {
  try {
    const url = new URL(boardUrl);
    const parts = url.hostname.split('.');
    return parts[0] ?? '';
  } catch {
    return '';
  }
}

/**
 * Extract BBSID from board URL.
 * e.g. "https://eagle.5ch.net/livejupiter/" -> "livejupiter"
 */
function getBbsId(boardUrl: string): string {
  try {
    const url = new URL(boardUrl);
    const segments = url.pathname.split('/').filter((s) => s.length > 0);
    return segments[segments.length - 1] ?? '';
  } catch {
    return '';
  }
}

function getSambaIniPath(dataDir: string): string {
  return join(dataDir, 'Samba.ini');
}

function loadSambaData(dataDir: string): SambaData {
  const content = readFileSafe(getSambaIniPath(dataDir));
  if (content === null) {
    return { settings: new Map(), sends: new Map() };
  }
  return parseSambaIni(content.toString('utf-8'));
}

/**
 * Look up the Samba interval for a board.
 * Search order: @{bbsId} -> hostPrefix
 */
export function getSambaInterval(dataDir: string, boardUrl: string): number {
  const data = loadSambaData(dataDir);
  const bbsId = getBbsId(boardUrl);
  const hostPrefix = getHostPrefix(boardUrl);

  // Priority 1: @{bbsId}
  const byBbs = data.settings.get(`@${bbsId}`);
  if (byBbs !== undefined) return byBbs;

  // Priority 2: host prefix
  const byHost = data.settings.get(hostPrefix);
  if (byHost !== undefined) return byHost;

  return DEFAULT_INTERVAL;
}

/**
 * Get the last post time for a board.
 */
function getLastPostTime(dataDir: string, boardUrl: string): string | null {
  const data = loadSambaData(dataDir);
  const bbsId = getBbsId(boardUrl);
  return data.sends.get(bbsId) ?? null;
}

/**
 * Get full Samba info (interval + last post time) for a board.
 */
export function getSambaInfo(dataDir: string, boardUrl: string): SambaInfo {
  const interval = getSambaInterval(dataDir, boardUrl);
  const lastPostTime = getLastPostTime(dataDir, boardUrl);
  return { interval, lastPostTime };
}

/**
 * Record the current time as the last post time for a board.
 */
export async function recordSambaTime(dataDir: string, boardUrl: string): Promise<void> {
  ensureDir(dataDir);
  const data = loadSambaData(dataDir);
  const bbsId = getBbsId(boardUrl);
  const newSends = new Map(data.sends);
  newSends.set(bbsId, new Date().toISOString());
  const newData: SambaData = { settings: data.settings, sends: newSends };
  await atomicWriteFile(getSambaIniPath(dataDir), serializeSambaIni(newData));
  logger.info(`Samba time recorded for ${bbsId}`);
}
