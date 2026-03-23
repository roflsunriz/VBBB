/**
 * User-Agent store with file persistence.
 * Follows the same pattern as 5ch domain management (file-backed + in-memory getter/setter).
 */
import { join } from 'node:path';
import { DEFAULT_USER_AGENT } from '@shared/file-format';
import { atomicWriteFile, readFileSafeAsync } from './file-io';
import { createLogger } from '../logger';

const logger = createLogger('user-agent-store');

const USER_AGENT_FILE = 'user-agent.txt';

let currentUserAgent: string = DEFAULT_USER_AGENT;

export function getCurrentUserAgent(): string {
  return currentUserAgent;
}

export function setCurrentUserAgent(ua: string | null): void {
  currentUserAgent = ua !== null && ua.trim().length > 0 ? ua.trim() : DEFAULT_USER_AGENT;
}

export async function loadUserAgentAsync(dataDir: string): Promise<void> {
  const filePath = join(dataDir, USER_AGENT_FILE);
  const content = await readFileSafeAsync(filePath);
  if (content !== null) {
    const raw = content.toString('utf-8').trim();
    if (raw.length > 0) {
      currentUserAgent = raw;
      logger.info(`Loaded custom User-Agent from file: ${currentUserAgent}`);
      return;
    }
  }

  const envUa = process.env['VBBB_USER_AGENT'];
  if (envUa !== undefined && envUa.trim().length > 0) {
    currentUserAgent = envUa.trim();
    logger.info(`Loaded User-Agent from env VBBB_USER_AGENT: ${currentUserAgent}`);
    return;
  }

  currentUserAgent = DEFAULT_USER_AGENT;
  logger.info(`Using default User-Agent: ${currentUserAgent}`);
}

export async function saveUserAgentAsync(dataDir: string, ua: string | null): Promise<void> {
  setCurrentUserAgent(ua);
  const filePath = join(dataDir, USER_AGENT_FILE);
  if (ua !== null && ua.trim().length > 0) {
    await atomicWriteFile(filePath, ua.trim());
    logger.info(`Saved custom User-Agent: ${currentUserAgent}`);
  } else {
    await atomicWriteFile(filePath, '');
    logger.info('Cleared custom User-Agent, using default');
  }
}
