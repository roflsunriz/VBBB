/**
 * Anchor parser for 2ch/5ch style response references.
 * Converts >>N, >>N-M, >>N,M,O, >N, ＞＞N patterns into clickable links.
 */

/** Full-width digit to half-width mapping */
const FULLWIDTH_DIGIT_OFFSET = '０'.charCodeAt(0) - '0'.charCodeAt(0);

/** Normalize full-width digits to half-width */
function normalizeDigits(s: string): string {
  return s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - FULLWIDTH_DIGIT_OFFSET));
}

/**
 * Parsed anchor reference representing one or more response numbers.
 */
export interface AnchorRef {
  /** Original matched text (e.g. "&gt;&gt;123") */
  readonly raw: string;
  /** Resolved response numbers (de-duplicated, sorted) */
  readonly numbers: readonly number[];
}

/**
 * Regex for matching anchor patterns in HTML-escaped text.
 * Matches: &gt;&gt;N, &gt;N, ＞＞N, ＞N
 * With optional ranges (N-M) and lists (N,M,O).
 * Full-width digits, commas, and dashes are also recognized.
 */
const ANCHOR_PATTERN =
  /(?:&gt;|＞){1,2}([０-９\d]+(?:[,，][０-９\d]+)*(?:[-ー－][０-９\d]+)?)/g;

/**
 * Parse a single anchor body (the part after >> ) into response numbers.
 * Supports: "123", "100-105", "1,3,5"
 */
function parseAnchorBody(body: string): readonly number[] {
  const normalized = normalizeDigits(body).replace(/[，]/g, ',').replace(/[ー－]/g, '-');

  // Range pattern: N-M
  const rangeMatch = /^(\d+)-(\d+)$/.exec(normalized);
  if (rangeMatch !== null) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (start > 0 && end > 0 && end >= start && end - start <= 100) {
      const nums: number[] = [];
      for (let i = start; i <= end; i++) {
        nums.push(i);
      }
      return nums;
    }
    // Invalid range, return start only
    return start > 0 ? [start] : [];
  }

  // Comma-separated list: N,M,O
  if (normalized.includes(',')) {
    const parts = normalized.split(',');
    const nums: number[] = [];
    for (const part of parts) {
      const n = Number(part);
      if (n > 0 && !nums.includes(n)) {
        nums.push(n);
      }
    }
    return nums.sort((a, b) => a - b);
  }

  // Single number
  const n = Number(normalized);
  return n > 0 ? [n] : [];
}

/**
 * Extract all anchor references from HTML-escaped text.
 */
export function parseAnchors(html: string): readonly AnchorRef[] {
  const results: AnchorRef[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex for global regex
  ANCHOR_PATTERN.lastIndex = 0;
  while ((match = ANCHOR_PATTERN.exec(html)) !== null) {
    const body = match[1];
    if (body === undefined) continue;
    const numbers = parseAnchorBody(body);
    if (numbers.length > 0) {
      results.push({ raw: match[0], numbers });
    }
  }

  return results;
}

/**
 * Convert anchor patterns in sanitized HTML into clickable <a> links.
 * Links use fragment anchors (#res-N) for in-page navigation.
 */
export function convertAnchorsToLinks(html: string): string {
  ANCHOR_PATTERN.lastIndex = 0;
  return html.replace(ANCHOR_PATTERN, (fullMatch, body: string) => {
    const numbers = parseAnchorBody(body);
    if (numbers.length === 0) return fullMatch;

    const firstNum = numbers[0];
    if (firstNum === undefined) return fullMatch;

    // data-anchor-nums stores the referenced numbers for popup use
    const numsAttr = numbers.join(',');
    return `<a href="#res-${String(firstNum)}" class="anchor-link" data-anchor-nums="${numsAttr}">${fullMatch}</a>`;
  });
}
