/**
 * JBBS subject.txt fetch and parse service.
 * JBBS subject.txt has the same format as 2ch: "threadid.cgi,title(count)"
 * But URL construction differs.
 */
import { join } from 'node:path';
import type { Board, SubjectFetchResult, SubjectRecord } from '@shared/domain';
import { createLogger } from '../../logger';
import { decodeBuffer } from '../encoding';
import { atomicWriteFile, getBoardDir, readFileSafe } from '../file-io';
import { httpFetch } from '../http-client';

const logger = createLogger('jbbs-subject');

/**
 * Get the encoding for reading JBBS subject.txt.
 * JBBS (まちBBS) uses EUC-JP; Shitaraba uses Shift_JIS.
 */
function getReadEncoding(board: Board): 'EUC-JP' | 'Shift_JIS' {
  return board.boardType === 'jbbs' ? 'EUC-JP' : 'Shift_JIS';
}

/**
 * Build the subject.txt URL for a JBBS board.
 * Pattern: https://jbbs.shitaraba.net/{dir}/{bbs}/subject.txt
 */
function getSubjectUrl(board: Board): string {
  const dir = board.jbbsDir ?? '';
  return `${board.serverUrl}${dir}/${board.bbsId}/subject.txt`;
}

/**
 * Parse a JBBS subject.txt line.
 * Format: "1234567890.cgi,Title(123)" — note .cgi instead of .dat
 */
export function parseJBBSSubjectLine(line: string): SubjectRecord | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  // Split on first comma
  const commaIdx = trimmed.indexOf(',');
  if (commaIdx < 0) return null;

  let fileName = trimmed.substring(0, commaIdx).trim();
  const rest = trimmed.substring(commaIdx + 1).trim();

  // JBBS uses .cgi extension; normalize to .dat for consistency
  if (fileName.endsWith('.cgi')) {
    fileName = fileName.replace(/\.cgi$/, '.dat');
  }

  if (!fileName.endsWith('.dat')) return null;

  // Extract count from end: (123)
  const countPatterns = [
    /\((\d+)\)\s*$/,
    /\uff08(\d+)\uff09\s*$/,
  ];

  let title = rest;
  let count = 0;

  for (const pattern of countPatterns) {
    const match = pattern.exec(title);
    if (match?.[1] !== undefined) {
      count = parseInt(match[1], 10);
      title = title.substring(0, match.index).trim();
      break;
    }
  }

  return { fileName, title, count };
}

/**
 * Parse entire JBBS subject.txt content.
 */
export function parseJBBSSubjectTxt(content: string): SubjectRecord[] {
  const records: SubjectRecord[] = [];
  for (const line of content.split('\n')) {
    const record = parseJBBSSubjectLine(line);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

/**
 * Fetch JBBS subject.txt.
 */
export async function fetchJBBSSubject(
  board: Board,
  dataDir: string,
): Promise<SubjectFetchResult> {
  const subjectUrl = getSubjectUrl(board);
  const boardDir = getBoardDir(dataDir, board.url);
  const localPath = join(boardDir, 'subject.txt');
  const encoding = getReadEncoding(board);

  logger.info(`JBBS fetching subject: ${subjectUrl}`);

  try {
    const response = await httpFetch({ url: subjectUrl, method: 'GET' });

    if (response.status === 304) {
      const localContent = readFileSafe(localPath);
      if (localContent !== null) {
        const text = decodeBuffer(localContent, encoding);
        return { threads: parseJBBSSubjectTxt(text), notModified: true };
      }
      return { threads: [], notModified: true };
    }

    if (response.status !== 200) {
      throw new Error(`JBBS subject.txt fetch failed: HTTP ${String(response.status)}`);
    }

    await atomicWriteFile(localPath, response.body);
    const text = decodeBuffer(response.body, encoding);
    const threads = parseJBBSSubjectTxt(text);

    logger.info(`JBBS parsed ${String(threads.length)} threads`);
    return { threads, notModified: false };
  } catch (err) {
    // Try local cache on error
    const localContent = readFileSafe(localPath);
    if (localContent !== null) {
      const text = decodeBuffer(localContent, encoding);
      logger.warn(`JBBS fetch failed, using cache: ${err instanceof Error ? err.message : String(err)}`);
      return { threads: parseJBBSSubjectTxt(text), notModified: true };
    }
    throw err;
  }
}
