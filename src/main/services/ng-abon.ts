/**
 * NG (あぼーん) filter service.
 * Manages NGword rules and applies them to responses.
 * Compatible with gikoNaviG2 NGword.txt format.
 */
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Res } from '@shared/domain';
import {
  type NgRule,
  type NgFilterResult,
  AbonType,
  NgMatchMode,
  NgTarget,
  NgFilterResult as NgFilterResultEnum,
} from '@shared/ng';
import { readFileSafe, atomicWriteFile, ensureDir } from './file-io';
import { createLogger } from '../logger';

const logger = createLogger('ng-abon');

const NG_DIR_NAME = 'NGwords';
const DEFAULT_NG_FILE = 'NGword.txt';

/** Prefix markers in NGword.txt format */
const REGEXP_MARKER = '{{REGEXP}}';
const REGEX2_MARKER = '{{REGEX2}}';
const BOARD_PREFIX = '{{BOARD:';
const THREAD_PREFIX = '{{THREAD:';
const TARGET_PREFIX = '{{TARGET:';
const MARKER_SUFFIX = '}}';

/**
 * Parse a single line from NGword.txt into an NgRule.
 */
export function parseNgLine(line: string): NgRule | null {
  if (line.trim().length === 0) return null;

  // Determine abon type: leading tab = transparent
  const isTransparent = line.startsWith('\t');
  const abonType = isTransparent ? AbonType.Transparent : AbonType.Normal;

  // Split by tabs
  const parts = line.split('\t').filter((p) => p.length > 0);
  if (parts.length === 0) return null;

  let matchMode: NgMatchMode = NgMatchMode.Plain;
  let target: NgTarget = NgTarget.Response;
  let boardId: string | undefined;
  let threadId: string | undefined;
  const tokens: string[] = [];

  for (const part of parts) {
    // Check for regex markers
    if (part === REGEXP_MARKER || part === REGEX2_MARKER) {
      matchMode = NgMatchMode.Regexp;
      continue;
    }

    // Check for target marker
    if (part.startsWith(TARGET_PREFIX) && part.endsWith(MARKER_SUFFIX)) {
      const val = part.slice(TARGET_PREFIX.length, -MARKER_SUFFIX.length);
      if (val === NgTarget.Thread || val === NgTarget.Board) {
        target = val;
      }
      continue;
    }

    // Check for board scope
    if (part.startsWith(BOARD_PREFIX) && part.endsWith(MARKER_SUFFIX)) {
      boardId = part.slice(BOARD_PREFIX.length, -MARKER_SUFFIX.length);
      continue;
    }

    // Check for thread scope
    if (part.startsWith(THREAD_PREFIX) && part.endsWith(MARKER_SUFFIX)) {
      const scope = part.slice(THREAD_PREFIX.length, -MARKER_SUFFIX.length);
      // Format: boardId/threadId
      const slashIdx = scope.indexOf('/');
      if (slashIdx !== -1) {
        boardId = scope.slice(0, slashIdx);
        threadId = scope.slice(slashIdx + 1);
      }
      continue;
    }

    tokens.push(part);
  }

  if (tokens.length === 0) return null;

  return {
    id: randomUUID(),
    target: target === NgTarget.Response ? undefined : target,
    abonType,
    matchMode,
    tokens,
    boardId,
    threadId,
    enabled: true,
  };
}

/**
 * Parse NGword.txt content into an array of NgRule.
 */
export function parseNgFile(content: string): readonly NgRule[] {
  const rules: NgRule[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip empty lines (but keep lines that start with tab)
    if (line.trim().length === 0 && !line.startsWith('\t')) continue;
    const rule = parseNgLine(line);
    if (rule !== null) {
      rules.push(rule);
    }
  }

  return rules;
}

/**
 * Serialize NgRule array back to NGword.txt format.
 */
export function serializeNgRules(rules: readonly NgRule[]): string {
  const lines: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const parts: string[] = [];

    // Leading tab for transparent abon
    const prefix = rule.abonType === AbonType.Transparent ? '\t' : '';

    // Target marker (omit for default 'response')
    if (rule.target !== undefined && rule.target !== NgTarget.Response) {
      parts.push(`${TARGET_PREFIX}${rule.target}${MARKER_SUFFIX}`);
    }

    // Regex marker
    if (rule.matchMode === NgMatchMode.Regexp) {
      parts.push(REGEXP_MARKER);
    }

    // Scope markers
    if (rule.threadId !== undefined && rule.boardId !== undefined) {
      parts.push(`${THREAD_PREFIX}${rule.boardId}/${rule.threadId}${MARKER_SUFFIX}`);
    } else if (rule.boardId !== undefined) {
      parts.push(`${BOARD_PREFIX}${rule.boardId}${MARKER_SUFFIX}`);
    }

    // Tokens
    for (const token of rule.tokens) {
      parts.push(token);
    }

    lines.push(`${prefix}${parts.join('\t')}`);
  }

  return lines.join('\n');
}

/**
 * Match tokens against a text string.
 */
function matchTokensAgainstText(rule: NgRule, text: string): boolean {
  if (rule.matchMode === NgMatchMode.Regexp) {
    const pattern = rule.tokens[0];
    if (pattern === undefined) return false;
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(text);
    } catch {
      logger.warn(`Invalid regex pattern in NG rule ${rule.id}: ${pattern}`);
      return false;
    }
  }
  return rule.tokens.every((token) => text.includes(token));
}

/**
 * Check if a response matches an NG rule.
 * Matching is against the full DAT line (name + mail + dateTime + body).
 */
export function matchesNgRule(
  rule: NgRule,
  res: Res,
  currentBoardId: string,
  currentThreadId: string,
): boolean {
  // Only apply response-level rules (default target)
  if (rule.target !== undefined && rule.target !== NgTarget.Response) return false;

  // Check board scope
  if (rule.boardId !== undefined && rule.boardId !== currentBoardId) {
    return false;
  }

  // Check thread scope
  if (rule.threadId !== undefined && rule.threadId !== currentThreadId) {
    return false;
  }

  // Build the full text to match against (simulating DAT line)
  const fullText = `${res.name}\t${res.mail}\t${res.dateTime}\t${res.body}`;
  return matchTokensAgainstText(rule, fullText);
}

/**
 * Check if a thread title matches a thread-level NG rule.
 */
export function matchesThreadNgRule(
  rule: NgRule,
  threadTitle: string,
  boardId: string,
  threadId: string,
): boolean {
  if (rule.target !== NgTarget.Thread) return false;
  // Board scope check
  if (rule.boardId !== undefined && rule.boardId !== boardId) return false;
  // Exact thread ID match
  if (rule.threadId !== undefined) return rule.threadId === threadId;
  // Token match against title
  return matchTokensAgainstText(rule, threadTitle);
}

/**
 * Check if a board name matches a board-level NG rule.
 */
export function matchesBoardNgRule(rule: NgRule, boardName: string, boardId: string): boolean {
  if (rule.target !== NgTarget.Board) return false;
  // Exact board ID match
  if (rule.boardId !== undefined) return rule.boardId === boardId;
  // Token match against board name
  return matchTokensAgainstText(rule, boardName);
}

/**
 * Apply all NG rules to a response and return the filter result.
 */
export function applyNgRules(
  rules: readonly NgRule[],
  res: Res,
  boardId: string,
  threadId: string,
): NgFilterResult {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (matchesNgRule(rule, res, boardId, threadId)) {
      return rule.abonType === AbonType.Transparent
        ? NgFilterResultEnum.TransparentAbon
        : NgFilterResultEnum.NormalAbon;
    }
  }
  return NgFilterResultEnum.None;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function getNgDir(dataDir: string): string {
  return join(dataDir, NG_DIR_NAME);
}

function getNgFilePath(dataDir: string): string {
  return join(getNgDir(dataDir), DEFAULT_NG_FILE);
}

/** In-memory rules cache */
let cachedRules: NgRule[] | null = null;

/**
 * Load NG rules from file.
 */
export function loadNgRules(dataDir: string): readonly NgRule[] {
  if (cachedRules !== null) return cachedRules;

  const content = readFileSafe(getNgFilePath(dataDir));
  if (content === null) {
    cachedRules = [];
    return cachedRules;
  }
  cachedRules = [...parseNgFile(content.toString('utf-8'))];
  return cachedRules;
}

/**
 * Save NG rules to file.
 */
export async function saveNgRules(dataDir: string, rules: readonly NgRule[]): Promise<void> {
  const ngDir = getNgDir(dataDir);
  ensureDir(ngDir);
  const content = serializeNgRules(rules);
  await atomicWriteFile(getNgFilePath(dataDir), content);
  cachedRules = [...rules];
  logger.info(`Saved ${String(rules.length)} NG rules`);
}

/**
 * Add a single NG rule.
 */
export async function addNgRule(dataDir: string, rule: NgRule): Promise<void> {
  const existing = loadNgRules(dataDir);
  const updated = [...existing, rule];
  await saveNgRules(dataDir, updated);
}

/**
 * Remove a NG rule by id.
 */
export async function removeNgRule(dataDir: string, ruleId: string): Promise<void> {
  const existing = loadNgRules(dataDir);
  const updated = existing.filter((r) => r.id !== ruleId);
  await saveNgRules(dataDir, updated);
}

/**
 * Clear the in-memory cache (for testing).
 */
export function clearNgCache(): void {
  cachedRules = null;
}
