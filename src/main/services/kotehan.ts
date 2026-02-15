/**
 * Kotehan (コテハン / 固定ハンドル) service.
 * Manages per-board default name/mail stored in Folder.ini [Kotehan] section.
 */
import { join } from 'node:path';
import type { KotehanConfig } from '@shared/domain';
import { readFileSafe, atomicWriteFile, ensureDir } from './file-io';
import { createLogger } from '../logger';

const logger = createLogger('kotehan');

const SECTION_HEADER = '[Kotehan]';
const NAME_KEY = 'Name=';
const MAIL_KEY = 'Mail=';

/**
 * Parse a Folder.ini file and extract the [Kotehan] section.
 * Returns default empty config if section is missing.
 */
export function parseKotehanFromIni(content: string): KotehanConfig {
  const lines = content.split('\n');
  let inSection = false;
  let name = '';
  let mail = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('[')) {
      inSection = line === SECTION_HEADER;
      continue;
    }

    if (!inSection) continue;

    if (line.startsWith(NAME_KEY)) {
      name = line.slice(NAME_KEY.length);
    } else if (line.startsWith(MAIL_KEY)) {
      mail = line.slice(MAIL_KEY.length);
    }
  }

  return { name, mail };
}

/**
 * Serialize a KotehanConfig into the [Kotehan] section of an INI file.
 * Preserves other sections that already exist.
 */
export function serializeKotehanToIni(existingContent: string, config: KotehanConfig): string {
  const lines = existingContent.split('\n');
  const result: string[] = [];
  let inKotehanSection = false;
  let kotehanWritten = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.startsWith('[')) {
      // If we were in [Kotehan] section and leaving it, mark as written
      if (inKotehanSection) {
        kotehanWritten = true;
      }
      inKotehanSection = line === SECTION_HEADER;

      if (inKotehanSection) {
        // Write our updated section
        result.push(SECTION_HEADER);
        result.push(`${NAME_KEY}${config.name}`);
        result.push(`${MAIL_KEY}${config.mail}`);
        kotehanWritten = true;
        continue;
      }
    }

    // Skip old kotehan lines
    if (inKotehanSection) continue;

    result.push(rawLine);
  }

  // If we never encountered [Kotehan] section, append it
  if (!kotehanWritten) {
    // Ensure trailing newline before new section
    if (result.length > 0 && result[result.length - 1] !== '') {
      result.push('');
    }
    result.push(SECTION_HEADER);
    result.push(`${NAME_KEY}${config.name}`);
    result.push(`${MAIL_KEY}${config.mail}`);
  }

  return result.join('\n');
}

/**
 * Get the Folder.ini path for a board directory.
 */
function getFolderIniPath(boardDir: string): string {
  return join(boardDir, 'Folder.ini');
}

/**
 * Load kotehan config for a board.
 */
export function loadKotehan(boardDir: string): KotehanConfig {
  const iniPath = getFolderIniPath(boardDir);
  const content = readFileSafe(iniPath);
  if (content === null) {
    return { name: '', mail: '' };
  }
  return parseKotehanFromIni(content.toString('utf-8'));
}

/**
 * Save kotehan config for a board.
 */
export async function saveKotehan(boardDir: string, config: KotehanConfig): Promise<void> {
  ensureDir(boardDir);
  const iniPath = getFolderIniPath(boardDir);
  const existing = readFileSafe(iniPath);
  const existingContent = existing !== null ? existing.toString('utf-8') : '';
  const newContent = serializeKotehanToIni(existingContent, config);
  await atomicWriteFile(iniPath, newContent);
  logger.info(`Kotehan saved for ${boardDir}`);
}
