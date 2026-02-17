/**
 * Local DAT file search (grep) service.
 * Searches DAT files under a board directory by regex pattern.
 * Also provides cross-board search across all cached boards / subjects / DATs.
 */
import { readdirSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type BBSMenu, BoardType } from '@shared/domain';
import type {
  BoardMatchResult,
  DatMatchResult,
  LocalSearchAllQuery,
  LocalSearchAllResult,
  LocalSearchQuery,
  SearchResult,
  SubjectMatchResult,
} from '@shared/search';
import { LocalSearchScope, SearchTarget } from '@shared/search';
import { detectBoardTypeByHost } from '@shared/url-parser';
import { createLogger } from '../logger';
import { loadBBSMenuCache } from './bbs-menu';
import { parseDat } from './dat';
import { decodeBuffer } from './encoding';
import { getBoardDir, readFileSafe } from './file-io';
import { parseSubjectLine } from './subject';

const logger = createLogger('local-search');

const MAX_RESULTS = 500;

/**
 * Search local DAT files for the given query.
 */
export function searchLocal(
  query: LocalSearchQuery,
  dataDir: string,
  boardType: BoardType,
): SearchResult[] {
  const boardDir = getBoardDir(dataDir, query.boardUrl);
  const results: SearchResult[] = [];
  const encoding = boardType === BoardType.JBBS || boardType === BoardType.Shitaraba
    ? 'EUC-JP'
    : 'Shift_JIS';

  let datFiles: string[];
  try {
    datFiles = readdirSync(boardDir).filter((f) => f.endsWith('.dat'));
  } catch {
    logger.warn(`No DAT files found in ${boardDir}`);
    return [];
  }

  const flags = query.caseSensitive ? '' : 'i';
  let regex: RegExp;
  try {
    regex = new RegExp(query.pattern, flags);
  } catch {
    logger.warn(`Invalid search pattern: ${query.pattern}`);
    return [];
  }

  for (const datFile of datFiles) {
    if (results.length >= MAX_RESULTS) break;

    const content = readFileSafe(`${boardDir}/${datFile}`);
    if (content === null) continue;

    const text = decodeBuffer(content, encoding);
    const responses = parseDat(text);

    // Extract thread ID and title
    const threadId = datFile.replace('.dat', '');
    const firstRes = responses[0];
    const threadTitle = firstRes?.title.length !== undefined && firstRes.title.length > 0
      ? firstRes.title
      : threadId;

    for (const res of responses) {
      if (results.length >= MAX_RESULTS) break;

      const matchField = getMatchField(res, query.target);
      if (matchField !== null && regex.test(matchField)) {
        results.push({
          boardUrl: query.boardUrl,
          threadId,
          threadTitle,
          resNumber: res.number,
          matchedLine: truncateMatch(matchField, 120),
        });
      }
    }
  }

  logger.info(`Local search found ${String(results.length)} results for "${query.pattern}"`);
  return results;
}

function getMatchField(
  res: { readonly name: string; readonly mail: string; readonly dateTime: string; readonly body: string; readonly id?: string | undefined },
  target: SearchTarget,
): string | null {
  switch (target) {
    case SearchTarget.Name:
      return res.name;
    case SearchTarget.Mail:
      return res.mail;
    case SearchTarget.Id:
      return res.id ?? extractIdFromDateTime(res.dateTime);
    case SearchTarget.Body:
      return stripHtml(res.body);
    case SearchTarget.All:
      return `${res.name} ${res.mail} ${stripHtml(res.body)}`;
    default: {
      const _never: never = target;
      return _never;
    }
  }
}

/**
 * Extract ID:xxx from datetime field if present.
 */
function extractIdFromDateTime(dateTime: string): string | null {
  const match = /ID:([^\s]+)/.exec(dateTime);
  return match?.[1] ?? null;
}

/**
 * Strip HTML tags for plain text search.
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * Truncate match text for display.
 */
function truncateMatch(text: string, maxLen: number): string {
  const stripped = stripHtml(text).replace(/\n/g, ' ');
  return stripped.length > maxLen ? stripped.substring(0, maxLen) + '...' : stripped;
}

// ---------------------------------------------------------------------------
// Cross-board search (search:local-all)
// ---------------------------------------------------------------------------

/** Directory entry found by walkBoardDirs */
interface BoardDirEntry {
  readonly hostname: string;
  readonly bbsId: string;
  readonly dirPath: string;
}

/** Lookup info resolved from BBSMenu cache */
interface BoardLookup {
  readonly boardUrl: string;
  readonly boardTitle: string;
  readonly categoryName: string;
}

/**
 * Walk `logs/{hostname}/{bbsId}` directories and return all board dirs.
 */
async function walkBoardDirs(dataDir: string): Promise<readonly BoardDirEntry[]> {
  const logsDir = join(dataDir, 'logs');
  let hostnames: string[];
  try {
    hostnames = await readdir(logsDir);
  } catch {
    return [];
  }

  const entries: BoardDirEntry[] = [];
  for (const hostname of hostnames) {
    const hostDir = join(logsDir, hostname);
    let bbsIds: string[];
    try {
      bbsIds = await readdir(hostDir);
    } catch {
      continue;
    }
    for (const bbsId of bbsIds) {
      entries.push({ hostname, bbsId, dirPath: join(hostDir, bbsId) });
    }
  }
  return entries;
}

/**
 * Build a reverse lookup map from `hostname/bbsId` -> BoardLookup using the BBSMenu cache.
 */
function buildBoardLookupMap(menu: BBSMenu): Map<string, BoardLookup> {
  const map = new Map<string, BoardLookup>();
  for (const category of menu.categories) {
    for (const board of category.boards) {
      const dirKey = boardUrlToDirKey(board.url);
      if (dirKey !== null) {
        map.set(dirKey, {
          boardUrl: board.url,
          boardTitle: board.title,
          categoryName: category.name,
        });
      }
    }
  }
  return map;
}

/**
 * Convert a board URL to the directory key used in getBoardDir.
 * Returns `hostname/bbsId` or null if parsing fails.
 */
function boardUrlToDirKey(boardUrl: string): string | null {
  try {
    const url = new URL(boardUrl);
    const pathSegments = url.pathname.split('/').filter((s) => s.length > 0);
    const bbsId = pathSegments[pathSegments.length - 1];
    if (bbsId === undefined || bbsId.length === 0) return null;
    return `${url.hostname}/${bbsId}`;
  } catch {
    return null;
  }
}

/**
 * Resolve BoardLookup for a BoardDirEntry, falling back to directory-derived values.
 */
function resolveBoardLookup(
  entry: BoardDirEntry,
  lookupMap: ReadonlyMap<string, BoardLookup>,
): BoardLookup {
  const key = `${entry.hostname}/${entry.bbsId}`;
  const found = lookupMap.get(key);
  if (found !== undefined) return found;
  return {
    boardUrl: `https://${entry.hostname}/${entry.bbsId}/`,
    boardTitle: entry.bbsId,
    categoryName: '',
  };
}

/**
 * Determine encoding from hostname.
 */
function encodingForHost(hostname: string): 'EUC-JP' | 'Shift_JIS' {
  const boardType = detectBoardTypeByHost(hostname);
  return boardType === BoardType.JBBS || boardType === BoardType.Shitaraba
    ? 'EUC-JP'
    : 'Shift_JIS';
}

// ---------------------------------------------------------------------------
// 1. Board name search
// ---------------------------------------------------------------------------

/**
 * Search board names in BBSMenu cache by regex.
 */
function searchBoards(regex: RegExp, menu: BBSMenu): readonly BoardMatchResult[] {
  const results: BoardMatchResult[] = [];
  for (const category of menu.categories) {
    for (const board of category.boards) {
      if (results.length >= MAX_RESULTS) return results;
      if (regex.test(board.title)) {
        results.push({
          kind: 'board',
          boardUrl: board.url,
          boardTitle: board.title,
          categoryName: category.name,
        });
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 2. Subject (thread title) search
// ---------------------------------------------------------------------------

/**
 * Search cached subject.txt files across all boards by regex.
 */
async function searchSubjects(
  regex: RegExp,
  dataDir: string,
  boardDirs: readonly BoardDirEntry[],
  lookupMap: ReadonlyMap<string, BoardLookup>,
): Promise<readonly SubjectMatchResult[]> {
  const results: SubjectMatchResult[] = [];

  for (const entry of boardDirs) {
    if (results.length >= MAX_RESULTS) break;

    const subjectPath = join(entry.dirPath, 'subject.txt');
    let raw: Buffer;
    try {
      raw = await readFile(subjectPath);
    } catch {
      continue;
    }

    const encoding = encodingForHost(entry.hostname);
    const text = decodeBuffer(raw, encoding);
    const lines = text.split('\n');
    const lookup = resolveBoardLookup(entry, lookupMap);

    for (const line of lines) {
      if (results.length >= MAX_RESULTS) break;
      const record = parseSubjectLine(line);
      if (record === null) continue;
      if (regex.test(record.title)) {
        results.push({
          kind: 'subject',
          boardUrl: lookup.boardUrl,
          boardTitle: lookup.boardTitle,
          threadId: record.fileName.replace('.dat', ''),
          threadTitle: record.title,
          count: record.count,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. DAT content search (all boards)
// ---------------------------------------------------------------------------

/**
 * Search all cached DAT files across all boards by regex.
 */
async function searchDatAll(
  regex: RegExp,
  searchTarget: SearchTarget,
  dataDir: string,
  boardDirs: readonly BoardDirEntry[],
  lookupMap: ReadonlyMap<string, BoardLookup>,
): Promise<readonly DatMatchResult[]> {
  const results: DatMatchResult[] = [];

  for (const entry of boardDirs) {
    if (results.length >= MAX_RESULTS) break;

    let files: string[];
    try {
      files = await readdir(entry.dirPath);
    } catch {
      continue;
    }

    const datFiles = files.filter((f) => f.endsWith('.dat'));
    if (datFiles.length === 0) continue;

    const encoding = encodingForHost(entry.hostname);
    const lookup = resolveBoardLookup(entry, lookupMap);

    for (const datFile of datFiles) {
      if (results.length >= MAX_RESULTS) break;

      let raw: Buffer;
      try {
        raw = await readFile(join(entry.dirPath, datFile));
      } catch {
        continue;
      }

      const text = decodeBuffer(raw, encoding);
      const responses = parseDat(text);

      const threadId = datFile.replace('.dat', '');
      const firstRes = responses[0];
      const threadTitle = firstRes !== undefined && firstRes.title.length > 0
        ? firstRes.title
        : threadId;

      for (const res of responses) {
        if (results.length >= MAX_RESULTS) break;

        const matchField = getMatchField(res, searchTarget);
        if (matchField !== null && regex.test(matchField)) {
          results.push({
            kind: 'dat',
            boardUrl: lookup.boardUrl,
            boardTitle: lookup.boardTitle,
            threadId,
            threadTitle,
            resNumber: res.number,
            matchedLine: truncateMatch(matchField, 120),
          });
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Cross-board local search: searches boards, subjects, and/or DAT caches
 * depending on the given scope.
 */
export async function searchLocalAll(
  query: LocalSearchAllQuery,
  dataDir: string,
): Promise<readonly LocalSearchAllResult[]> {
  const flags = query.caseSensitive ? '' : 'i';
  let regex: RegExp;
  try {
    regex = new RegExp(query.pattern, flags);
  } catch {
    logger.warn(`Invalid search pattern: ${query.pattern}`);
    return [];
  }

  const menu = loadBBSMenuCache(dataDir);
  const categories = menu ?? { categories: [] };

  const scope = query.scope;
  const results: LocalSearchAllResult[] = [];

  // Board name search (in-memory, fast)
  if (scope === LocalSearchScope.Boards || scope === LocalSearchScope.All) {
    const boardResults = searchBoards(regex, categories);
    results.push(...boardResults);
    if (results.length >= MAX_RESULTS) {
      logger.info(`Cross-board search hit limit at board search (${String(results.length)} results)`);
      return results.slice(0, MAX_RESULTS);
    }
  }

  // Subject / DAT search require disk walk
  if (
    scope === LocalSearchScope.Subjects ||
    scope === LocalSearchScope.DatCache ||
    scope === LocalSearchScope.All
  ) {
    const boardDirs = await walkBoardDirs(dataDir);
    const lookupMap = buildBoardLookupMap(categories);

    if (scope === LocalSearchScope.Subjects || scope === LocalSearchScope.All) {
      const subjectResults = await searchSubjects(regex, dataDir, boardDirs, lookupMap);
      results.push(...subjectResults);
      if (results.length >= MAX_RESULTS) {
        logger.info(`Cross-board search hit limit at subject search (${String(results.length)} results)`);
        return results.slice(0, MAX_RESULTS);
      }
    }

    if (scope === LocalSearchScope.DatCache || scope === LocalSearchScope.All) {
      const remaining = MAX_RESULTS - results.length;
      if (remaining > 0) {
        const datResults = await searchDatAll(regex, query.target, dataDir, boardDirs, lookupMap);
        results.push(...datResults);
      }
    }
  }

  logger.info(`Cross-board search found ${String(results.length)} results for "${query.pattern}" (scope: ${scope})`);
  return results.slice(0, MAX_RESULTS);
}
