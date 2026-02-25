/**
 * Next-thread ("次スレ") detection utility.
 *
 * On 5ch/2ch, when a thread reaches 1000 posts it is "over" and a continuation
 * thread is typically created with an incremented series number, e.g.:
 *   "ブルアカ★1" → "ブルアカ★2"
 *   "雑談スレ Part12" → "雑談スレ Part13"
 *   "日常スレ その45" → "日常スレ その46"
 *
 * This module provides `findNextThread()` which searches the board's subject
 * list for the most likely continuation thread.
 */
import type { SubjectRecord } from '@shared/domain';

/** Minimum threshold (inclusive) for the "thread is over" banner to appear. */
export const NEXT_THREAD_RESPONSE_THRESHOLD = 1000;

/** Minimum threshold for the "次スレを探す" toolbar button to appear. */
export const NEXT_THREAD_BUTTON_THRESHOLD = 950;

/**
 * Find the rightmost number in a title and split the title around it.
 *
 * The "series number" in 5ch thread titles is almost always the rightmost
 * numeric sequence (e.g. "★1", "Part 1", "その1", "1" at end of title).
 *
 * Returns null when no positive integer is found.
 */
export function extractRightmostNumber(
  title: string,
): { before: string; num: number; after: string } | null {
  let lastMatch: RegExpExecArray | null = null;
  const pattern = /(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(title)) !== null) {
    lastMatch = m;
  }

  if (lastMatch === null || lastMatch[1] === undefined) return null;
  const num = parseInt(lastMatch[1], 10);
  if (isNaN(num) || num <= 0) return null;

  const before = title.slice(0, lastMatch.index);
  const after = title.slice(lastMatch.index + lastMatch[1].length);
  return { before, num, after };
}

/**
 * Normalized common-prefix similarity between two strings.
 * Returns a value in [0, 1] where 1 means identical.
 *
 * Prefix-based matching is intentionally used: thread title prefixes are
 * stable between series (the text before the number rarely changes).
 */
function prefixSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  let common = 0;
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) break;
    common++;
  }
  return common / Math.max(a.length, b.length);
}

/**
 * Search the board's subject list for the continuation thread of `currentTitle`.
 *
 * Algorithm:
 * 1. Extract the rightmost number N from the current title.
 * 2. For each candidate in subjects, look for the same rightmost number = N+1.
 * 3. Score each candidate by prefix-similarity of the text before/after the number.
 * 4. Return the highest-scoring candidate above the similarity threshold.
 *
 * @param currentTitle  Title of the current (over) thread.
 * @param currentFileName  DAT filename (e.g. "1234567890.dat") — excluded from results.
 * @param subjects  Subject list for the same board.
 * @returns The best matching next-thread SubjectRecord, or undefined if none found.
 */
export function findNextThread(
  currentTitle: string,
  currentFileName: string,
  subjects: readonly SubjectRecord[],
): SubjectRecord | undefined {
  const current = extractRightmostNumber(currentTitle);
  if (current === null) return undefined;

  const nextNum = current.num + 1;

  // Similarity threshold: the text *before* the number must share at least
  // this fraction of characters as a common prefix.
  const THRESHOLD = 0.6;

  let bestMatch: SubjectRecord | undefined;
  let bestScore = 0;

  for (const subject of subjects) {
    if (subject.fileName === currentFileName) continue;

    const candidate = extractRightmostNumber(subject.title);
    if (candidate === null || candidate.num !== nextNum) continue;

    // Weight: text before the number is the primary identifier (0.75),
    // text after (e.g. "】" or " ★") is secondary (0.25).
    const beforeScore = prefixSimilarity(current.before, candidate.before);
    const afterScore = prefixSimilarity(current.after, candidate.after);
    const score = beforeScore * 0.75 + afterScore * 0.25;

    if (score >= THRESHOLD && score > bestScore) {
      bestScore = score;
      bestMatch = subject;
    }
  }

  return bestMatch;
}
