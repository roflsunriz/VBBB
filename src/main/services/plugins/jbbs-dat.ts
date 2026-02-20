/**
 * JBBS DAT fetch and parse service.
 * Handles rawmode.cgi responses and 7-field DAT format.
 *
 * JBBS DAT format (7 fields):
 *   ResNumber<>Name<>Mail<>DateTime<>Body<>ThreadTitle<>ID
 *
 * Note: rawmode.cgi returns data that may have missing res numbers (abon gaps).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Board, DatFetchResult, Res } from '@shared/domain';
import { BoardType, DatFetchStatus } from '@shared/domain';
import { createLogger } from '../../logger';
import { decodeBuffer } from '../encoding';
import { atomicWriteFile, getBoardDir, readFileSafe } from '../file-io';
import { httpFetch } from '../http-client';

const logger = createLogger('jbbs-dat');

/**
 * Get the encoding for a JBBS board's DAT responses.
 * JBBS/したらば uses EUC-JP for read and write.
 */
function getReadEncoding(board: Board): 'EUC-JP' | 'Shift_JIS' {
  return board.boardType === BoardType.Type2ch ? 'Shift_JIS' : 'EUC-JP';
}

/**
 * Parse a single JBBS DAT line (7-field format).
 * Format: "ResNumber<>Name<>Mail<>DateTime<>Body<>ThreadTitle<>ID"
 */
export function parseJBBSDatLine(line: string): Res | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  const parts = trimmed.split('<>');
  if (parts.length < 5) return null;

  const resNumberStr = parts[0] ?? '';
  const resNumber = parseInt(resNumberStr, 10);
  if (Number.isNaN(resNumber) || resNumber < 1) return null;

  const name = parts[1] ?? '';
  const mail = parts[2] ?? '';
  const dateTime = parts[3] ?? '';
  let body = parts[4] ?? '';
  const title = parts[5] ?? '';
  const id = parts[6] ?? '';

  // Empty body -> &nbsp; (leading whitespace preserved for AA rendering)
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
    id: id.length > 0 ? id : undefined,
  };
}

/**
 * Parse entire JBBS DAT content into Res array.
 * Handles gaps in res numbers (abon).
 */
export function parseJBBSDat(content: string): Res[] {
  const responses: Res[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const res = parseJBBSDatLine(line);
    if (res !== null) {
      responses.push(res);
    }
  }
  return responses;
}

/**
 * Build the rawmode.cgi URL for a JBBS thread.
 */
function getRawModeUrl(board: Board, threadId: string, startFrom?: number): string {
  const dir = board.jbbsDir ?? '';
  const base = `${board.serverUrl}bbs/rawmode.cgi/${dir}/${board.bbsId}/${threadId}/`;
  if (startFrom !== undefined && startFrom > 1) {
    return `${base}${String(startFrom)}-`;
  }
  return base;
}

/**
 * Fetch JBBS DAT with differential support.
 */
export async function fetchJBBSDat(
  board: Board,
  threadId: string,
  dataDir: string,
): Promise<DatFetchResult> {
  const boardDir = getBoardDir(dataDir, board.url);
  const localPath = join(boardDir, `${threadId}.dat`);
  const encoding = getReadEncoding(board);

  const localExists = existsSync(localPath);
  let existingResCount = 0;

  if (localExists) {
    // Count existing responses to know where to start differential fetch
    const localContent = readFileSafe(localPath);
    if (localContent !== null) {
      const text = decodeBuffer(localContent, encoding);
      const existing = parseJBBSDat(text);
      existingResCount = existing.length;
    }
  }

  // For JBBS, differential fetch uses res number range, not byte range
  if (existingResCount > 0) {
    const startFrom = existingResCount + 1;
    const diffUrl = getRawModeUrl(board, threadId, startFrom);

    logger.info(`JBBS differential fetch from res ${String(startFrom)}: ${diffUrl}`);

    try {
      const response = await httpFetch({ url: diffUrl, method: 'GET' });

      if (response.status === 200) {
        const diffText = decodeBuffer(response.body, encoding);
        const newResponses = parseJBBSDat(diffText);

        if (newResponses.length > 0) {
          // Append new data to local file
          const newDataBuffer = Buffer.concat([Buffer.from('\n'), response.body]);
          const existingContent = readFileSafe(localPath);
          if (existingContent !== null) {
            const merged = Buffer.concat([existingContent, newDataBuffer]);
            await atomicWriteFile(localPath, merged);
          }
        }

        // Read the full merged file
        const fullContent = readFileSafe(localPath);
        if (fullContent !== null) {
          const fullText = decodeBuffer(fullContent, encoding);
          return {
            status: DatFetchStatus.Partial,
            responses: parseJBBSDat(fullText),
            lastModified: response.lastModified ?? null,
            size: fullContent.length,
          };
        }
      }

      if (response.status === 304) {
        const localContent = readFileSafe(localPath);
        if (localContent !== null) {
          const text = decodeBuffer(localContent, encoding);
          return {
            status: DatFetchStatus.NotModified,
            responses: parseJBBSDat(text),
            lastModified: null,
            size: localContent.length,
          };
        }
      }
    } catch (err) {
      logger.warn(`JBBS differential fetch failed, trying full fetch: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Full fetch
  return fetchJBBSDatFull(board, threadId, dataDir);
}

/**
 * Check if a JBBS/Shitaraba response indicates the thread is in storage (DAT落ち).
 * Shitaraba returns HTTP 200 with "ERROR: STORAGE IN" in response header values
 * when the thread has been moved to storage (archive).
 * Reference: gikoNaviG2 ShitarabaJBBSPlugIn.dpr
 */
function isShitarabaStorageResponse(headers: Readonly<Record<string, string>>): boolean {
  return Object.values(headers).some((v) => v.includes('STORAGE IN'));
}

async function fetchJBBSDatFull(
  board: Board,
  threadId: string,
  dataDir: string,
): Promise<DatFetchResult> {
  const boardDir = getBoardDir(dataDir, board.url);
  const localPath = join(boardDir, `${threadId}.dat`);
  const encoding = getReadEncoding(board);
  const url = getRawModeUrl(board, threadId);

  logger.info(`JBBS full fetch: ${url}`);

  try {
    const response = await httpFetch({ url, method: 'GET' });

    // Detect DAT落ち: non-200 response, OR Shitaraba "ERROR: STORAGE IN" header on 200
    const isDatFallen = response.status !== 200 ||
      isShitarabaStorageResponse(response.headers);

    if (isDatFallen) {
      const reason = response.status !== 200
        ? `HTTP ${String(response.status)}`
        : 'STORAGE IN header';
      logger.info(`JBBS DAT fallen (${reason}): ${url}`);

      // Try read_archive.cgi
      const archiveUrl = `${board.serverUrl}bbs/read_archive.cgi/${board.jbbsDir ?? ''}/${board.bbsId}/${threadId}/`;
      logger.info(`JBBS trying archive: ${archiveUrl}`);
      try {
        const archiveResponse = await httpFetch({ url: archiveUrl, method: 'GET' });
        if (archiveResponse.status === 200) {
          await atomicWriteFile(localPath, archiveResponse.body);
          const text = decodeBuffer(archiveResponse.body, encoding);
          return {
            status: DatFetchStatus.Archived,
            responses: parseJBBSDat(text),
            lastModified: archiveResponse.lastModified ?? null,
            size: archiveResponse.body.length,
          };
        }
      } catch {
        // Archive also failed — fall through to local cache
      }

      // Archive not found — try local cache (responses up to before DAT落ち)
      const localContent = readFileSafe(localPath);
      if (localContent !== null) {
        logger.info(`JBBS DAT fallen, serving from local cache: ${localPath}`);
        const text = decodeBuffer(localContent, encoding);
        return {
          status: DatFetchStatus.DatFallen,
          responses: parseJBBSDat(text),
          lastModified: null,
          size: localContent.length,
        };
      }

      return {
        status: DatFetchStatus.DatFallen,
        responses: [],
        lastModified: null,
        size: 0,
        errorMessage: `JBBS DAT fallen (${reason}, no archive or local cache)`,
      };
    }

    await atomicWriteFile(localPath, response.body);
    const text = decodeBuffer(response.body, encoding);
    return {
      status: DatFetchStatus.Full,
      responses: parseJBBSDat(text),
      lastModified: response.lastModified ?? null,
      size: response.body.length,
    };
  } catch (err) {
    return {
      status: DatFetchStatus.Error,
      responses: [],
      lastModified: null,
      size: 0,
      errorMessage: `JBBS fetch error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
