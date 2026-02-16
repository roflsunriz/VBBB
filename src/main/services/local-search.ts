/**
 * Local DAT file search (grep) service.
 * Searches DAT files under a board directory by regex pattern.
 */
import { readdirSync } from 'node:fs';
import type { LocalSearchQuery, SearchResult } from '@shared/search';
import { SearchTarget } from '@shared/search';
import { createLogger } from '../logger';
import { decodeBuffer } from './encoding';
import { getBoardDir, readFileSafe } from './file-io';
import { parseDat } from './dat';

const logger = createLogger('local-search');

const MAX_RESULTS = 500;

/**
 * Search local DAT files for the given query.
 */
export function searchLocal(
  query: LocalSearchQuery,
  dataDir: string,
): SearchResult[] {
  const boardDir = getBoardDir(dataDir, query.boardUrl);
  const results: SearchResult[] = [];

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

    const text = decodeBuffer(content, 'Shift_JIS');
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
