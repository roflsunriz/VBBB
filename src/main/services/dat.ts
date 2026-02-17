/**
 * DAT fetch service with differential fetch, 16-byte overlap check, and fallback.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type Board, BoardType, DatFetchStatus, type DatFetchResult, type Res } from '@shared/domain';
import { DAT_ADJUST_MARGIN } from '@shared/file-format';
import { createLogger } from '../logger';
import { applyDatReplace, loadReplaceRules } from './dat-replace';
import { decodeBuffer } from './encoding';
import { atomicAppendFile, atomicWriteFile, getBoardDir, readFileLastBytes, readFileSafe } from './file-io';
import { httpFetch } from './http-client';
import { getUpliftSid } from './uplift-auth';

const logger = createLogger('dat');

function isLikelyMachiDateTime(value: string): boolean {
  return /^\d{4}\/\d{2}\/\d{2}\([^)]*\)\s+\d{2}:\d{2}:\d{2}/.test(value);
}

function parseMachiOfflawDat(parts: readonly string[]): Res | null {
  if (parts.length < 6) return null;

  const resNumberRaw = parts[0];
  if (resNumberRaw === undefined || !/^\d+$/.test(resNumberRaw)) return null;

  const resNumber = parseInt(resNumberRaw, 10);
  if (Number.isNaN(resNumber) || resNumber < 1) return null;

  const name = parts[1] ?? '';
  const mail = parts[2] ?? '';
  const dateTime = parts[3] ?? '';
  if (!isLikelyMachiDateTime(dateTime)) return null;
  let body = parts[4] ?? '';

  const hasTitleField = parts.length >= 7;
  const title = hasTitleField ? (parts[5] ?? '') : '';
  const idCandidate = hasTitleField ? parts[6] : parts[5];

  if (body.trim().length === 0) {
    body = '&nbsp;';
  }

  return {
    number: resNumber,
    name,
    mail,
    dateTime,
    body,
    title,
    id: idCandidate !== undefined && idCandidate.length > 0 ? idCandidate : undefined,
  };
}

/**
 * Parse a single DAT line (5ch/2ch format).
 * Format: "Name<>Mail<>DateTime<>Body<>Title"
 */
export function parseDatLine(line: string, lineNumber: number): Res | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let parts: string[];
  if (trimmed.includes('<>')) {
    parts = trimmed.split('<>');
  } else {
    // Old comma-separated format fallback
    // First, escape actual <> as &lt;&gt;, then convert commas to <>
    let converted = trimmed.replace(/<>/g, '&lt;&gt;');
    // Convert full-width comma to temporary marker
    converted = converted.replace(/\uff0c/g, '\x00FWCOMMA\x00');
    converted = converted.replace(/,/g, '<>');
    converted = converted.replace(/\x00FWCOMMA\x00/g, ',');
    parts = converted.split('<>');
  }

  const machiOfflaw = parseMachiOfflawDat(parts);
  if (machiOfflaw !== null) {
    return machiOfflaw;
  }

  const name = parts[0] ?? '';
  const mail = parts[1] ?? '';
  const dateTime = parts[2] ?? '';
  let body = parts[3] ?? '';
  const title = parts[4] ?? '';

  // Empty body -> &nbsp; (leading whitespace preserved for AA rendering)
  if (body.trim().length === 0) {
    body = '&nbsp;';
  }

  return {
    number: lineNumber,
    name,
    mail,
    dateTime,
    body,
    title,
  };
}

/**
 * Parse an entire DAT file content into Res array.
 */
export function parseDat(content: string): Res[] {
  const responses: Res[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const res = parseDatLine(line, i + 1);
    if (res !== null) {
      responses.push(res);
    }
  }
  return responses;
}

/**
 * Get the DAT URL for a thread.
 */
function getDatUrl(board: Board, threadId: string): string {
  if (isMachiBoard(board)) {
    return `${board.serverUrl}bbs/offlaw.cgi/${board.bbsId}/${threadId}/`;
  }
  return `${board.url}dat/${threadId}.dat`;
}

function isMachiBoard(board: Board): boolean {
  try {
    return new URL(board.url).hostname.toLowerCase().includes('machi.to');
  } catch {
    return false;
  }
}

/**
 * Get the oyster URL for UPLIFT past-log access.
 * Returns undefined if not logged in.
 */
function getOysterUrl(board: Board, threadId: string): string | undefined {
  const sid = getUpliftSid();
  if (sid.length === 0) return undefined;
  const prefix4 = threadId.substring(0, 4);
  return `${board.url}oyster/${prefix4}/${threadId}.dat?sid=${encodeURIComponent(sid)}`;
}

/**
 * Get the kako (archive) URLs for a thread.
 * Includes oyster URL (UPLIFT) at the front if logged in.
 */
function getKakoUrls(board: Board, threadId: string): string[] {
  const urls: string[] = [];

  // UPLIFT oyster URL gets priority if available
  const oysterUrl = getOysterUrl(board, threadId);
  if (oysterUrl !== undefined) {
    urls.push(oysterUrl);
  }

  if (threadId.length <= 9) {
    // 9 digits or less
    const prefix3 = threadId.substring(0, 3);
    urls.push(`${board.url}kako/${prefix3}/${threadId}.dat.gz`);
    urls.push(`${board.url}kako/${prefix3}/${threadId}.dat`);
  } else {
    // 10 digits or more
    const prefix4 = threadId.substring(0, 4);
    const prefix5 = threadId.substring(0, 5);
    urls.push(`${board.url}kako/${prefix4}/${prefix5}/${threadId}.dat.gz`);
    urls.push(`${board.url}kako/${prefix4}/${prefix5}/${threadId}.dat`);
  }
  return urls;
}

/**
 * Fetch DAT with differential support.
 */
export async function fetchDat(board: Board, threadId: string, dataDir: string): Promise<DatFetchResult> {
  const boardDir = getBoardDir(dataDir, board.url);
  const localPath = join(boardDir, `${threadId}.dat`);
  const datUrl = getDatUrl(board, threadId);

  const encoding = (board.boardType === BoardType.Type2ch || board.boardType === BoardType.MachiBBS)
    ? 'Shift_JIS'
    : 'EUC-JP';
  const localExists = existsSync(localPath);
  let localSize = 0;
  if (localExists) {
    localSize = statSync(localPath).size;
  }

  // Attempt differential fetch if we have local data
  if (localExists && localSize > DAT_ADJUST_MARGIN) {
    logger.info(`Differential fetch for ${datUrl} (local size: ${String(localSize)})`);

    const rangeStart = localSize - DAT_ADJUST_MARGIN;
    const response = await httpFetch({
      url: datUrl,
      method: 'GET',
      range: `bytes=${String(rangeStart)}-`,
      acceptGzip: false, // MUST NOT send gzip with Range
    });

    // Load replacement rules
  const replaceRules = loadReplaceRules(dataDir);

  if (response.status === 206) {
      // Differential response — verify 16-byte overlap
      const localTail = readFileLastBytes(localPath, DAT_ADJUST_MARGIN);
      if (localTail !== null) {
        // Strip CR from local tail for comparison
        const cleanLocalTail = Buffer.from(
          Array.from(localTail).filter((b) => b !== 0x0d),
        );
        const responseFront = response.body.subarray(0, cleanLocalTail.length);

        if (cleanLocalTail.equals(responseFront)) {
          // Match — append new data (skip overlap)
          const newData = response.body.subarray(cleanLocalTail.length);
          if (newData.length > 0) {
            await atomicAppendFile(localPath, newData);
          }

          const fullContent = readFileSafe(localPath);
          if (fullContent === null) {
            return { status: DatFetchStatus.Error, responses: [], lastModified: null, size: 0, errorMessage: 'Failed to read merged DAT' };
          }
          const text = applyDatReplace(decodeBuffer(fullContent, encoding), replaceRules);
          return {
            status: DatFetchStatus.Partial,
            responses: parseDat(text),
            lastModified: response.lastModified ?? null,
            size: fullContent.length,
          };
        }

        // Mismatch — server-side abone detected, do full refetch
        logger.warn('16-byte overlap mismatch, performing full refetch');
        return fetchDatFull(board, threadId, dataDir);
      }
    }

    if (response.status === 304) {
      // Not modified
      const fullContent = readFileSafe(localPath);
      if (fullContent !== null) {
        const text = decodeBuffer(fullContent, encoding);
        return {
          status: DatFetchStatus.NotModified,
          responses: parseDat(text),
          lastModified: null,
          size: fullContent.length,
        };
      }
    }

    if (response.status === 416) {
      // Range not satisfiable — full refetch
      logger.warn('HTTP 416 — performing full refetch');
      return fetchDatFull(board, threadId, dataDir);
    }

    if (response.status === 302) {
      // DAT fallen — try kako
      return fetchDatKako(board, threadId, dataDir, encoding);
    }

    // If differential didn't work, try full fetch
    if (response.status === 200) {
      await atomicWriteFile(localPath, response.body);
      const text = decodeBuffer(response.body, encoding);
      return {
        status: DatFetchStatus.Full,
        responses: parseDat(text),
        lastModified: response.lastModified ?? null,
        size: response.body.length,
      };
    }
  }

  // Full fetch (no local or local too small)
  return fetchDatFull(board, threadId, dataDir);
}

async function fetchDatFull(board: Board, threadId: string, dataDir: string): Promise<DatFetchResult> {
  const boardDir = getBoardDir(dataDir, board.url);
  const localPath = join(boardDir, `${threadId}.dat`);
  const datUrl = getDatUrl(board, threadId);
  const encoding = (board.boardType === BoardType.Type2ch || board.boardType === BoardType.MachiBBS)
    ? 'Shift_JIS'
    : 'EUC-JP';
  const replaceRules = loadReplaceRules(dataDir);

  const response = await httpFetch({
    url: datUrl,
    method: 'GET',
  });

  if (response.status === 302) {
    return fetchDatKako(board, threadId, dataDir, encoding);
  }

  if (response.status !== 200) {
    return {
      status: DatFetchStatus.Error,
      responses: [],
      lastModified: null,
      size: 0,
      errorMessage: `HTTP ${String(response.status)}`,
    };
  }

  await atomicWriteFile(localPath, response.body);
  const text = applyDatReplace(decodeBuffer(response.body, encoding), replaceRules);
  return {
    status: DatFetchStatus.Full,
    responses: parseDat(text),
    lastModified: response.lastModified ?? null,
    size: response.body.length,
  };
}

async function fetchDatKako(
  board: Board,
  threadId: string,
  dataDir: string,
  encoding: 'Shift_JIS' | 'EUC-JP',
): Promise<DatFetchResult> {
  const boardDir = getBoardDir(dataDir, board.url);
  const localPath = join(boardDir, `${threadId}.dat`);
  const kakoUrls = getKakoUrls(board, threadId);

  for (const kakoUrl of kakoUrls) {
    logger.info(`Trying kako: ${kakoUrl}`);
    try {
      const response = await httpFetch({ url: kakoUrl, method: 'GET' });
      if (response.status === 200) {
        await atomicWriteFile(localPath, response.body);
        const text = decodeBuffer(response.body, encoding);
        return {
          status: DatFetchStatus.Archived,
          responses: parseDat(text),
          lastModified: response.lastModified ?? null,
          size: response.body.length,
        };
      }
    } catch {
      // Try next URL
    }
  }

  return {
    status: DatFetchStatus.Error,
    responses: [],
    lastModified: null,
    size: 0,
    errorMessage: 'DAT not found (kako fallback failed)',
  };
}
