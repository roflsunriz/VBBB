/**
 * DAT replacement service.
 * Applies replace.ini rules to DAT content before local storage.
 * Format: search[TAB]replacement (one rule per line).
 * Lines containing <> are skipped (DAT delimiter conflict).
 * Empty replacement means replace with same-length spaces.
 */
import { join } from 'node:path';
import type { ReplaceRule } from '@shared/replace';
import { createLogger } from '../logger';
import { readFileSafe } from './file-io';

const logger = createLogger('dat-replace');

const REPLACE_INI_FILE = 'replace.ini';

/** Cached rules */
let cachedRules: readonly ReplaceRule[] | null = null;
let cachedDataDir: string | null = null;

/**
 * Unescape replace.ini escape sequences.
 * Supported: \. \( \) \{ \} \/ \" \\
 */
function unescapePattern(raw: string): string {
  return raw
    .replace(/\\\\/g, '\x00BACKSLASH\x00')
    .replace(/\\\./g, '.')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"')
    .replace(/\x00BACKSLASH\x00/g, '\\');
}

/**
 * Parse replace.ini content into ReplaceRule array.
 */
export function parseReplaceIni(content: string): ReplaceRule[] {
  const rules: ReplaceRule[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    // Skip lines containing <> (DAT delimiter)
    if (trimmed.includes('<>')) continue;
    // Skip comment lines
    if (trimmed.startsWith(';')) continue;

    const tabIdx = trimmed.indexOf('\t');
    if (tabIdx < 0) {
      // No tab = search-only, replace with spaces
      const search = unescapePattern(trimmed);
      rules.push({ search, replacement: '' });
    } else {
      const search = unescapePattern(trimmed.substring(0, tabIdx));
      const replacement = trimmed.substring(tabIdx + 1);
      rules.push({ search, replacement });
    }
  }
  return rules;
}

/**
 * Load replace.ini rules from disk (with caching).
 */
export function loadReplaceRules(dataDir: string): readonly ReplaceRule[] {
  if (cachedRules !== null && cachedDataDir === dataDir) {
    return cachedRules;
  }

  const filePath = join(dataDir, REPLACE_INI_FILE);
  const content = readFileSafe(filePath);
  if (content === null) {
    cachedRules = [];
    cachedDataDir = dataDir;
    return cachedRules;
  }

  cachedRules = parseReplaceIni(content.toString('utf-8'));
  cachedDataDir = dataDir;
  logger.info(`Loaded ${String(cachedRules.length)} replacement rules`);
  return cachedRules;
}

/**
 * Apply replacement rules to DAT content.
 * Empty replacement produces same-length spaces.
 */
export function applyDatReplace(content: string, rules: readonly ReplaceRule[]): string {
  if (rules.length === 0) return content;

  let result = content;
  for (const rule of rules) {
    if (rule.search.length === 0) continue;

    if (rule.replacement.length === 0) {
      const spaces = ' '.repeat(rule.search.length);
      result = result.replaceAll(rule.search, spaces);
    } else {
      result = result.replaceAll(rule.search, rule.replacement);
    }
  }
  return result;
}

/**
 * Clear cached rules (for testing or config reload).
 */
export function clearReplaceCache(): void {
  cachedRules = null;
  cachedDataDir = null;
}
