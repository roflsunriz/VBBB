/**
 * Next-thread template generator.
 *
 * Generates a pre-filled subject and message body for creating the next
 * thread in a series, based on the current thread's >>1 content.
 *
 * Processing:
 * 1. Convert >>1 HTML body to plain text.
 * 2. Detect `!extend:` VIPQ2 commands and prepend 2 additional copies.
 * 3. Remove system-generated `VIPQ2_EXTDAT:` lines.
 * 4. Replace the previous thread URL with the current thread URL.
 * 5. Increment the rightmost number in the thread title.
 */
import { decodeHtmlEntities } from '@shared/html-entities';
import { extractRightmostNumber } from './next-thread-detect';

/** Regex matching a `!extend:...` command line (case-insensitive). */
const EXTEND_CMD_PATTERN = /^!extend:[^\n]*/i;

/** Regex matching the system-generated VIPQ2_EXTDAT line. */
const VIPQ2_EXTDAT_PATTERN = /^VIPQ2_EXTDAT:.*$/;

/**
 * Regex matching 5ch/2ch thread URLs.
 * Covers patterns like:
 *   https://server.5ch.net/test/read.cgi/board/threadId/
 *   http://server.2ch.net/test/read.cgi/board/threadId
 */
const THREAD_URL_PATTERN =
  /https?:\/\/[a-z0-9]+\.(?:5ch\.net|2ch\.net|bbspink\.com)\/test\/read\.cgi\/[a-z0-9_]+\/\d+\/?/gi;

/**
 * Convert BBS HTML body to plain text.
 *
 * - `<br>` → newline
 * - Strip remaining HTML tags
 * - Decode HTML entities
 */
export function htmlBodyToText(html: string): string {
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]*>/g, '');
  text = decodeHtmlEntities(text);
  return text;
}

/**
 * Extract the first `!extend:` command from the lines.
 * Returns the full command string (e.g. `!extend:checked:vvvvvv:1000:512`)
 * or null if none found.
 */
function findExtendCommand(lines: readonly string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (EXTEND_CMD_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Increment the rightmost number in a thread title.
 *
 * Examples:
 *   "ブルアカ★1"  →  "ブルアカ★2"
 *   "雑談スレ Part12"  →  "雑談スレ Part13"
 */
export function incrementTitleNumber(title: string): string {
  const parsed = extractRightmostNumber(title);
  if (parsed === null) return title;
  return `${parsed.before}${String(parsed.num + 1)}${parsed.after}`;
}

export interface NextThreadTemplate {
  /** Suggested subject (thread title) with incremented series number. */
  readonly subject: string;
  /** Pre-filled message body. */
  readonly message: string;
}

export interface NextThreadTemplateInput {
  /** Current thread's >>1 body (HTML). */
  readonly firstPostBody: string;
  /** Current thread title. */
  readonly currentTitle: string;
  /** Current thread's board URL (e.g. "https://news.5ch.net/newsplus/"). */
  readonly boardUrl: string;
  /** Current thread ID (numeric string, e.g. "1234567890"). */
  readonly threadId: string;
}

/**
 * Generate a next-thread template from the current thread's >>1.
 *
 * @returns Subject + message body ready for the new thread editor.
 */
export function generateNextThreadTemplate(input: NextThreadTemplateInput): NextThreadTemplate {
  const { firstPostBody, currentTitle, boardUrl, threadId } = input;

  const subject = incrementTitleNumber(currentTitle);

  const bodyText = htmlBodyToText(firstPostBody);
  const lines = bodyText.split('\n');

  const extendCmd = findExtendCommand(lines);

  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (VIPQ2_EXTDAT_PATTERN.test(trimmed)) return false;
    return true;
  });

  const currentThreadUrl = buildThreadUrl(boardUrl, threadId);

  const replacedLines = filteredLines.map((line) =>
    line.replace(THREAD_URL_PATTERN, currentThreadUrl),
  );

  let messageLines: string[];
  if (extendCmd !== null) {
    const extendLines = [extendCmd, extendCmd];
    messageLines = [...extendLines, ...replacedLines];
  } else {
    messageLines = replacedLines;
  }

  const message = messageLines.join('\n').trim();

  return { subject, message };
}

/**
 * Build a thread URL from board URL and thread ID.
 * Example: "https://news.5ch.net/newsplus/" + "1234567890"
 *          → "https://news.5ch.net/test/read.cgi/newsplus/1234567890/"
 */
function buildThreadUrl(boardUrl: string, threadId: string): string {
  try {
    const url = new URL(boardUrl);
    const boardId = url.pathname.replace(/^\/|\/$/g, '');
    return `${url.origin}/test/read.cgi/${boardId}/${threadId}/`;
  } catch {
    return boardUrl;
  }
}
