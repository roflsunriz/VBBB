/**
 * subject.txt fetch, parse, and Age/Sage/New/Archive determination.
 */
import { join } from 'node:path';
import {
  AgeSage,
  type Board,
  BoardType,
  type SubjectFetchResult,
  type SubjectRecord,
  type ThreadIndex,
} from '@shared/domain';
import { KOKOMADE_UNSET, ZERO_DATE_HEX, FOLDER_IDX_VERSION, SOH } from '@shared/file-format';
import { decodeHtmlEntities } from '@shared/html-entities';
import { SubjectLineSchema } from '@shared/zod-schemas';
import { createLogger } from '../logger';
import { decodeBuffer, encodeString, sanitizeForIdx, unsanitizeFromIdx } from './encoding';
import { atomicWriteFile, getBoardDir, readFileSafe, readFileSafeAsync } from './file-io';
import { httpFetch } from './http-client';

const logger = createLogger('subject');

/**
 * Parse a single line of subject.txt.
 * Format: "1234567890.dat<>Title (123)"
 * Fallback: comma-separated (old format).
 */
export function parseSubjectLine(line: string): SubjectRecord | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  let delimiter = '<>';
  let parts = trimmed.split(delimiter);

  // Fallback to comma delimiter (old format)
  if (parts.length < 2) {
    delimiter = ',';
    parts = trimmed.split(delimiter);
  }
  if (parts.length < 2) return null;

  let fileName = parts[0]?.trim();
  const rest = parts.slice(1).join(delimiter).trim();

  if (fileName === undefined || rest === undefined) return null;

  // Machi/JBBS-compatible subject lines may use ".cgi" filenames.
  // Normalize to ".dat" so downstream handling remains consistent.
  if (fileName.endsWith('.cgi')) {
    fileName = fileName.replace(/\.cgi$/, '.dat');
  }
  if (!fileName.endsWith('.dat')) return null;

  // Extract count from end: (123), (123), <123>
  let title = rest;
  let count = 0;

  const countPatterns = [
    /\((\d+)\)\s*$/, // (123)
    /\uff08(\d+)\uff09\s*$/, // (123)
    /<(\d+)>\s*$/, // <123>
  ];

  for (const pattern of countPatterns) {
    const match = pattern.exec(title);
    if (match?.[1] !== undefined) {
      count = parseInt(match[1], 10);
      title = title.substring(0, match.index).trim();
      break;
    }
  }

  // Decode numeric character references (e.g. &#127825; → 🍎) in thread titles
  title = decodeHtmlEntities(title);

  const validated = SubjectLineSchema.safeParse({ fileName, title, count });
  if (!validated.success) return null;

  return validated.data;
}

/**
 * Parse entire subject.txt content.
 */
export function parseSubjectTxt(content: string): SubjectRecord[] {
  const records: SubjectRecord[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const record = parseSubjectLine(line);
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

/**
 * Determine Age/Sage/New/Archive for each thread.
 */
export function determineAgeSage(
  newSubjects: readonly SubjectRecord[],
  existingIndex: readonly ThreadIndex[],
): Map<string, AgeSage> {
  const result = new Map<string, AgeSage>();
  const existingMap = new Map<string, ThreadIndex>();
  for (const idx of existingIndex) {
    existingMap.set(idx.fileName, idx);
  }

  // Track which existing threads appear in new subject
  const seenFileNames = new Set<string>();

  let processCounter = 0;
  for (const subject of newSubjects) {
    processCounter++;
    seenFileNames.add(subject.fileName);

    const existing = existingMap.get(subject.fileName);
    if (existing === undefined) {
      // Unknown thread = New
      result.set(subject.fileName, AgeSage.New);
    } else if (existing.no > processCounter) {
      // Thread moved up = Age
      result.set(subject.fileName, AgeSage.Age);
    } else if (existing.count < subject.count) {
      // Count increased but rank didn't go up = Sage
      result.set(subject.fileName, AgeSage.Sage);
    } else {
      result.set(subject.fileName, AgeSage.None);
    }
  }

  // Threads in old but not in new = Archive
  for (const existing of existingIndex) {
    if (!seenFileNames.has(existing.fileName)) {
      result.set(existing.fileName, AgeSage.Archive);
    }
  }

  return result;
}

/**
 * Fetch subject.txt for a board.
 */
const SUBJECT_LASTMOD_FILE = 'subject-lastmod.txt';

export async function fetchSubject(board: Board, dataDir: string): Promise<SubjectFetchResult> {
  const subjectUrl = `${board.url}subject.txt`;
  const boardDir = getBoardDir(dataDir, board.url);
  const localPath = join(boardDir, 'subject.txt');

  // Read saved Last-Modified for conditional GET
  const [localContent, lastModBuf] = await Promise.all([
    readFileSafeAsync(localPath),
    readFileSafeAsync(join(boardDir, SUBJECT_LASTMOD_FILE)),
  ]);
  const ifModifiedSince =
    lastModBuf !== null && localContent !== null ? lastModBuf.toString('utf-8').trim() : undefined;

  const encoding =
    board.boardType === BoardType.Type2ch || board.boardType === BoardType.MachiBBS
      ? 'Shift_JIS'
      : 'EUC-JP';

  logger.info(
    `Fetching ${subjectUrl}${ifModifiedSince !== undefined ? ` (If-Modified-Since: ${ifModifiedSince})` : ''}`,
  );

  const response = await httpFetch({
    url: subjectUrl,
    method: 'GET',
    ifModifiedSince,
  });

  if (response.status === 304) {
    if (localContent !== null) {
      const text = decodeBuffer(localContent, encoding);
      logger.info(
        `subject.txt not modified, using cache (${String(parseSubjectTxt(text).length)} threads)`,
      );
      return { threads: parseSubjectTxt(text), notModified: true };
    }
    return { threads: [], notModified: true };
  }

  if (response.status !== 200) {
    throw new Error(`Failed to fetch subject.txt: HTTP ${String(response.status)}`);
  }

  // Save raw response and Last-Modified header in parallel
  const savePromises: Promise<void>[] = [atomicWriteFile(localPath, response.body)];
  if (response.lastModified !== undefined) {
    savePromises.push(atomicWriteFile(join(boardDir, SUBJECT_LASTMOD_FILE), response.lastModified));
  }
  await Promise.all(savePromises);

  const text = decodeBuffer(response.body, encoding);
  const threads = parseSubjectTxt(text);

  // Build and save updated Folder.idx
  const existingIndex = loadFolderIdx(boardDir);
  const ageSageMap = determineAgeSage(threads, existingIndex);
  const updatedIndex = buildUpdatedIndex(threads, existingIndex, ageSageMap);
  await saveFolderIdx(boardDir, updatedIndex);

  logger.info(`Parsed ${String(threads.length)} threads from subject.txt`);

  return { threads, notModified: false };
}

// ---------------------------------------------------------------------------
// Folder.idx I/O
// ---------------------------------------------------------------------------

function intToHex(n: number): string {
  if (n < 0) {
    return (n >>> 0).toString(16);
  }
  return n.toString(16);
}

function hexToInt(hex: string): number {
  const val = parseInt(hex, 16);
  // Handle 32-bit signed overflow (e.g. ffffffff -> -1)
  if (val > 0x7fffffff) {
    return val - 0x100000000;
  }
  return val;
}

/**
 * Parse Folder.idx content to ThreadIndex array.
 */
export function parseFolderIdx(content: string): ThreadIndex[] {
  const lines = content.split('\n');
  if (lines.length === 0) return [];

  // First line is version
  const version = lines[0]?.trim();
  if (version !== FOLDER_IDX_VERSION) {
    logger.warn(`Unexpected Folder.idx version: ${version ?? 'empty'}`);
  }

  const indices: ThreadIndex[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim().length === 0) continue;

    const fields = line.split(SOH);
    if (fields.length < 15) continue;

    indices.push({
      no: hexToInt(fields[0] ?? '0'),
      fileName: fields[1] ?? '',
      title: unsanitizeFromIdx(fields[2] ?? ''),
      count: hexToInt(fields[3] ?? '0'),
      size: hexToInt(fields[4] ?? '0'),
      roundDate: fields[5] === ZERO_DATE_HEX ? null : (fields[5] ?? null),
      lastModified: fields[6] === ZERO_DATE_HEX ? null : (fields[6] ?? null),
      kokomade: hexToInt(fields[7] ?? 'ffffffff'),
      newReceive: hexToInt(fields[8] ?? '0'),
      unRead: (fields[10] ?? '0') === '1',
      scrollTop: hexToInt(fields[11] ?? '0'),
      allResCount: hexToInt(fields[12] ?? '0'),
      newResCount: hexToInt(fields[13] ?? '0'),
      ageSage: hexToInt(fields[14] ?? '0') as AgeSage,
      // Field 15: scrollResNumber (optional; 0 if absent for backward compat)
      scrollResNumber: fields.length > 15 ? hexToInt(fields[15] ?? '0') : 0,
      // Field 16: scrollResOffset (optional; 0 if absent for backward compat)
      scrollResOffset: fields.length > 16 ? hexToInt(fields[16] ?? '0') : 0,
    });
  }

  return indices;
}

/**
 * Serialize ThreadIndex array to Folder.idx content.
 */
export function serializeFolderIdx(indices: readonly ThreadIndex[]): string {
  const lines: string[] = [FOLDER_IDX_VERSION];

  for (const idx of indices) {
    const fields = [
      intToHex(idx.no),
      idx.fileName,
      sanitizeForIdx(idx.title),
      intToHex(idx.count),
      intToHex(idx.size),
      idx.roundDate ?? ZERO_DATE_HEX,
      idx.lastModified ?? ZERO_DATE_HEX,
      intToHex(idx.kokomade),
      intToHex(idx.newReceive),
      '0', // unused field
      idx.unRead ? '1' : '0',
      intToHex(idx.scrollTop),
      intToHex(idx.allResCount),
      intToHex(idx.newResCount),
      intToHex(idx.ageSage),
      intToHex(idx.scrollResNumber),
      intToHex(idx.scrollResOffset),
    ];
    lines.push(fields.join(SOH));
  }

  return lines.join('\n');
}

/**
 * Load Folder.idx from disk.
 */
export function loadFolderIdx(boardDir: string): ThreadIndex[] {
  const content = readFileSafe(join(boardDir, 'Folder.idx'));
  if (content === null) return [];
  return parseFolderIdx(decodeBuffer(content, 'Shift_JIS'));
}

/**
 * Save Folder.idx to disk.
 */
export async function saveFolderIdx(
  boardDir: string,
  indices: readonly ThreadIndex[],
): Promise<void> {
  const content = serializeFolderIdx(indices);
  const encoded = encodeString(content, 'Shift_JIS');
  await atomicWriteFile(join(boardDir, 'Folder.idx'), encoded);
}

/**
 * Build updated ThreadIndex list from new subject.txt and existing index.
 */
export function buildUpdatedIndex(
  subjects: readonly SubjectRecord[],
  existingIndex: readonly ThreadIndex[],
  ageSageMap: Map<string, AgeSage>,
): ThreadIndex[] {
  const existingMap = new Map<string, ThreadIndex>();
  for (const idx of existingIndex) {
    existingMap.set(idx.fileName, idx);
  }

  const updatedIndices: ThreadIndex[] = [];

  for (let i = 0; i < subjects.length; i++) {
    const subject = subjects[i];
    if (subject === undefined) continue;
    const existing = existingMap.get(subject.fileName);
    const ageSage = ageSageMap.get(subject.fileName) ?? AgeSage.None;

    if (existing !== undefined) {
      updatedIndices.push({
        ...existing,
        no: i + 1,
        title: subject.title,
        allResCount: subject.count,
        newResCount: subject.count - existing.count,
        ageSage,
      });
    } else {
      updatedIndices.push({
        no: i + 1,
        fileName: subject.fileName,
        title: subject.title,
        count: 0,
        size: 0,
        roundDate: null,
        lastModified: null,
        kokomade: KOKOMADE_UNSET,
        newReceive: 0,
        unRead: true,
        scrollTop: 0,
        scrollResNumber: 0,
        scrollResOffset: 0,
        allResCount: subject.count,
        newResCount: subject.count,
        ageSage,
      });
    }
  }

  // Add archived threads that are still in existing index
  for (const existing of existingIndex) {
    const ageSage = ageSageMap.get(existing.fileName);
    if (ageSage === AgeSage.Archive) {
      updatedIndices.push({
        ...existing,
        ageSage: AgeSage.Archive,
      });
    }
  }

  return updatedIndices;
}
