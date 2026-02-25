/**
 * NG (あぼーん) filter service.
 * Manages NGword rules and applies them to responses.
 * Compatible with gikoNaviG2 NGword.txt format for migration.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Res } from '@shared/domain';
import {
  type NgFilterResult,
  type NgRule,
  type NgLegacyRule,
  type NgStringCondition,
  AbonType,
  NgMatchMode,
  NgTarget,
  NgStringField,
  NgStringMatchMode,
  NgFilterResult as NgFilterResultEnum,
} from '@shared/ng';
import { NgRulesFileSchema } from '@shared/zod-schemas';
import { readFileSafe, atomicWriteFile, ensureDir } from './file-io';
import { createLogger } from '../logger';

const logger = createLogger('ng-abon');

const NG_DIR_NAME = 'NGwords';
const DEFAULT_NG_FILE = 'NGword.txt';
const NG_RULES_JSON = 'ng-rules.json';

/** Prefix markers in NGword.txt format */
const REGEXP_MARKER = '{{REGEXP}}';
const REGEX2_MARKER = '{{REGEX2}}';
const BOARD_PREFIX = '{{BOARD:';
const THREAD_PREFIX = '{{THREAD:';
const TARGET_PREFIX = '{{TARGET:';
const MARKER_SUFFIX = '}}';

/**
 * Convert a legacy NG rule (NGword.txt format) to the new NgRule format.
 */
export function legacyRuleToNew(legacy: NgLegacyRule): NgRule {
  const condition: NgStringCondition = {
    type: 'string',
    matchMode:
      legacy.matchMode === NgMatchMode.Regexp ? NgStringMatchMode.Regexp : NgStringMatchMode.Plain,
    fields: [NgStringField.All],
    tokens: legacy.tokens,
    negate: false,
  };
  return {
    id: legacy.id,
    condition,
    target: legacy.target ?? NgTarget.Response,
    abonType: legacy.abonType,
    boardId: legacy.boardId,
    threadId: legacy.threadId,
    enabled: legacy.enabled,
  };
}

/**
 * Parse a single line from NGword.txt into an NgRule (new format).
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

  const condition: NgStringCondition = {
    type: 'string',
    matchMode:
      matchMode === NgMatchMode.Regexp ? NgStringMatchMode.Regexp : NgStringMatchMode.Plain,
    fields: [NgStringField.All],
    tokens,
    negate: false,
  };

  return {
    id: randomUUID(),
    condition,
    target,
    abonType,
    boardId,
    threadId,
    enabled: true,
  };
}

/**
 * Parse NGword.txt content into an array of NgRule (new format).
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
 * Parse NGword.txt (legacy) content and convert to new NgRule format.
 * Alias for parseNgFile for migration clarity.
 */
export function parseLegacyNgFile(content: string): readonly NgRule[] {
  return parseNgFile(content);
}

/**
 * Serialize NgRule array back to NGword.txt format.
 * Only string conditions can be serialized; numeric/time rules are skipped.
 */
export function serializeNgRules(rules: readonly NgRule[]): string {
  const lines: string[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.condition.type !== 'string') continue;

    const cond = rule.condition;
    const parts: string[] = [];

    // Leading tab for transparent abon
    const prefix = rule.abonType === AbonType.Transparent ? '\t' : '';

    // Target marker (omit for default 'response')
    if (rule.target !== NgTarget.Response) {
      parts.push(`${TARGET_PREFIX}${rule.target}${MARKER_SUFFIX}`);
    }

    // Regex marker
    if (cond.matchMode === NgStringMatchMode.Regexp) {
      parts.push(REGEXP_MARKER);
    }

    // Scope markers
    if (rule.threadId !== undefined && rule.boardId !== undefined) {
      parts.push(`${THREAD_PREFIX}${rule.boardId}/${rule.threadId}${MARKER_SUFFIX}`);
    } else if (rule.boardId !== undefined) {
      parts.push(`${BOARD_PREFIX}${rule.boardId}${MARKER_SUFFIX}`);
    }

    // Tokens
    for (const token of cond.tokens) {
      parts.push(token);
    }

    lines.push(`${prefix}${parts.join('\t')}`);
  }

  return lines.join('\n');
}

/**
 * Match string condition tokens against a text string.
 */
function matchStringConditionAgainstText(
  cond: NgStringCondition,
  ruleId: string,
  text: string,
): boolean {
  if (
    cond.matchMode === NgStringMatchMode.Regexp ||
    cond.matchMode === NgStringMatchMode.RegexpNoCase
  ) {
    const pattern = cond.tokens[0];
    if (pattern === undefined) return false;
    try {
      const regex = new RegExp(
        pattern,
        cond.matchMode === NgStringMatchMode.RegexpNoCase ? 'i' : '',
      );
      const matches = regex.test(text);
      return cond.negate ? !matches : matches;
    } catch {
      logger.warn(`Invalid regex pattern in NG rule ${ruleId}: ${pattern}`);
      return false;
    }
  }
  if (cond.matchMode === NgStringMatchMode.Fuzzy) {
    // Phase 2: fuzzy matching - for now treat as plain
    const matches = cond.tokens.every((token) => text.includes(token));
    return cond.negate ? !matches : matches;
  }
  // Plain
  const matches = cond.tokens.every((token) => text.includes(token));
  return cond.negate ? !matches : matches;
}

/**
 * Extract text for the given field from a Res.
 */
function getResFieldText(res: Res, field: NgStringField): string {
  switch (field) {
    case NgStringField.Name:
      return res.name;
    case NgStringField.Body:
      return res.body;
    case NgStringField.Mail:
      return res.mail;
    case NgStringField.Id:
      return res.id ?? '';
    case NgStringField.ThreadTitle:
      return res.title ?? '';
    case NgStringField.All:
      return `${res.name}\t${res.mail}\t${res.dateTime}\t${res.body}`;
    default:
      // trip, watchoi, ip, be, url - Phase 2: extract from dateTime/body
      return `${res.name}\t${res.mail}\t${res.dateTime}\t${res.body}`;
  }
}

/**
 * Get the text to match against for a string condition.
 * If fields is empty or contains 'all', use full combined text.
 */
function getTextToMatch(cond: NgStringCondition, res: Res): string {
  if (cond.fields.length === 0 || cond.fields.includes(NgStringField.All)) {
    return `${res.name}\t${res.mail}\t${res.dateTime}\t${res.body}`;
  }
  return cond.fields.map((f) => getResFieldText(res, f)).join('\t');
}

/**
 * Check if a response matches an NG rule.
 * Matching is against the full DAT line (name + mail + dateTime + body) for string conditions.
 */
export function matchesNgRule(
  rule: NgRule,
  res: Res,
  currentBoardId: string,
  currentThreadId: string,
): boolean {
  // Only apply response-level rules (default target)
  if (rule.target !== NgTarget.Response) return false;

  // Check board scope
  if (rule.boardId !== undefined && rule.boardId !== currentBoardId) {
    return false;
  }

  // Check thread scope
  if (rule.threadId !== undefined && rule.threadId !== currentThreadId) {
    return false;
  }

  if (rule.condition.type === 'string') {
    const text = getTextToMatch(rule.condition, res);
    return matchStringConditionAgainstText(rule.condition, rule.id, text);
  }
  // Numeric and time conditions: Phase 2
  return false;
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
  // Token match against title (string condition only)
  if (rule.condition.type === 'string') {
    return matchStringConditionAgainstText(rule.condition, rule.id, threadTitle);
  }
  return false;
}

/**
 * Check if a board name matches a board-level NG rule.
 */
export function matchesBoardNgRule(rule: NgRule, boardName: string, boardId: string): boolean {
  if (rule.target !== NgTarget.Board) return false;
  // Exact board ID match
  if (rule.boardId !== undefined) return rule.boardId === boardId;
  // Token match against board name (string condition only)
  if (rule.condition.type === 'string') {
    return matchStringConditionAgainstText(rule.condition, rule.id, boardName);
  }
  return false;
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

function getNgRulesJsonPath(dataDir: string): string {
  return join(getNgDir(dataDir), NG_RULES_JSON);
}

function getLegacyNgFilePath(dataDir: string): string {
  return join(getNgDir(dataDir), DEFAULT_NG_FILE);
}

/** In-memory rules cache */
let cachedRules: NgRule[] | null = null;

/**
 * Load NG rules from file.
 * 1. Try ng-rules.json first (parse with Zod NgRulesFileSchema)
 * 2. If not found, try NGword.txt, convert to new format, save as JSON, rename txt to .bak
 * 3. If neither exists, return empty array
 */
export function loadNgRules(dataDir: string): readonly NgRule[] {
  if (cachedRules !== null) return cachedRules;

  const ngDir = getNgDir(dataDir);
  const jsonPath = getNgRulesJsonPath(dataDir);
  const legacyPath = getLegacyNgFilePath(dataDir);

  // 1. Try ng-rules.json first
  const jsonContent = readFileSafe(jsonPath);
  if (jsonContent !== null) {
    try {
      const parsed: unknown = JSON.parse(jsonContent.toString('utf-8'));
      const result = NgRulesFileSchema.safeParse(parsed);
      if (result.success) {
        cachedRules = [...result.data.rules];
        return cachedRules;
      }
      logger.warn('ng-rules.json parse failed, falling back to legacy');
    } catch {
      logger.warn('ng-rules.json read failed, falling back to legacy');
    }
  }

  // 2. Try NGword.txt, migrate to JSON
  const legacyContent = readFileSafe(legacyPath);
  if (legacyContent !== null) {
    const rules = parseLegacyNgFile(legacyContent.toString('utf-8'));
    cachedRules = [...rules];
    ensureDir(ngDir);
    const fileContent = JSON.stringify({ version: 1 as const, rules: rules as NgRule[] }, null, 2);
    writeFileSync(jsonPath, fileContent, 'utf-8');
    // Rename txt to .bak
    const bakPath = `${legacyPath}.bak`;
    try {
      if (existsSync(bakPath)) unlinkSync(bakPath);
      renameSync(legacyPath, bakPath);
      logger.info(`Migrated NGword.txt to ng-rules.json, backed up to NGword.txt.bak`);
    } catch (err) {
      logger.warn(
        `Failed to rename NGword.txt to .bak: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return cachedRules;
  }

  // 3. Neither exists
  cachedRules = [];
  return cachedRules;
}

/**
 * Save NG rules to ng-rules.json (JSON format).
 */
export async function saveNgRules(dataDir: string, rules: readonly NgRule[]): Promise<void> {
  const ngDir = getNgDir(dataDir);
  ensureDir(ngDir);
  const jsonPath = getNgRulesJsonPath(dataDir);
  const fileContent = JSON.stringify({ version: 1 as const, rules: [...rules] }, null, 2);
  await atomicWriteFile(jsonPath, fileContent);
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
