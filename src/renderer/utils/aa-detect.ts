/**
 * ASCII art (AA) detection for BBS posts.
 * Analyzes post body HTML to determine if the content is likely ASCII art,
 * enabling AA-specific font rendering for proper display.
 *
 * Detection heuristics:
 * 1. Lines with alignment spacing (3+ consecutive spaces) — strongest indicator
 * 2. Lines with AA-specific special characters (box drawing, emoticon parts, etc.)
 * 3. Combination of spacing and special characters
 *
 * Single-line posts are never classified as AA (emoticons are not AA).
 * Quote lines (starting with >) are excluded from analysis.
 */

/** Characters commonly found in 2ch-style ASCII art */
const AA_SPECIAL_CHARS = new Set([
  // Box drawing
  '─',
  '━',
  '│',
  '┃',
  '┌',
  '┐',
  '└',
  '┘',
  '├',
  '┤',
  '┬',
  '┴',
  '┼',
  '╋',
  '┏',
  '┓',
  '┗',
  '┛',
  '┣',
  '┫',
  '┳',
  '┻',
  // Lines & bars
  '＿',
  '￣',
  '＝',
  '≡',
  '∥',
  '‖',
  // Decorative symbols
  '★',
  '☆',
  '●',
  '○',
  '◎',
  '◇',
  '◆',
  '△',
  '▲',
  '▽',
  '▼',
  '□',
  '■',
  '♪',
  '♂',
  '♀',
  '♠',
  '♣',
  '♥',
  '♦',
  // Face/body parts used in AA
  'ω',
  'д',
  'Д',
  '∀',
  'ε',
  'ι',
  'ρ',
  'σ',
  'ξ',
  'ζ',
  // Half-width katakana commonly used in AA
  'ﾉ',
  'ﾐ',
  'ﾊ',
  'ﾍ',
  'ﾎ',
  'ﾑ',
  'ﾒ',
  'ﾘ',
  'ﾙ',
  'ﾝ',
  'ﾞ',
  'ﾟ',
  // Math & structural
  '∧',
  '∨',
  '∩',
  '∪',
  '⊂',
  '⊃',
  // Full-width structural
  '＜',
  '＞',
  '（',
  '）',
  '｛',
  '｝',
  '＋',
  '×',
  '÷',
  '※',
  '†',
  '‡',
  // Wave/tilde
  '〜',
  '～',
]);

/** Minimum non-empty lines required for AA classification */
const MIN_AA_LINES = 2;

/** Minimum line length (trimmed) to consider for AA analysis */
const MIN_LINE_LENGTH = 3;

/** Minimum line length (trimmed) for spacing-based detection */
const MIN_SPACING_LINE_LENGTH = 8;

/** Minimum AA special characters per line to count as AA-char line */
const MIN_AA_CHARS_PER_LINE = 2;

/** Minimum AA-char lines for secondary detection */
const MIN_AA_CHAR_LINES = 3;

/** AA-char line ratio threshold for secondary detection */
const AA_CHAR_LINE_RATIO = 0.5;

/** Pattern matching consecutive whitespace used for AA alignment */
const ALIGNMENT_SPACE_PATTERN =
  /[ \u00A0]{3,}|[\u3000]{2,}|[ \u00A0]{2,}[\u3000]|[\u3000][ \u00A0]{2,}/;

/** Quote line pattern (>>N references or green-text quotes) */
const QUOTE_LINE_PATTERN = /^>/;

/**
 * Convert body HTML to plain text for AA analysis.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"');
}

/**
 * Detect if a post body (HTML) is likely ASCII art.
 *
 * @param bodyHtml - The HTML body of a post (Res.body)
 * @returns true if the post likely contains ASCII art
 */
export function isAsciiArt(bodyHtml: string): boolean {
  const text = htmlToPlainText(bodyHtml);
  const lines = text.split('\n');

  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length < MIN_AA_LINES) return false;

  let spacingLines = 0;
  let aaCharLines = 0;
  let analyzedLines = 0;

  for (const line of nonEmptyLines) {
    const trimmed = line.trim();
    if (trimmed.length < MIN_LINE_LENGTH) continue;

    // Skip quote lines (>>N references or green-text quotes)
    if (QUOTE_LINE_PATTERN.test(trimmed)) continue;

    analyzedLines++;

    // Check for alignment spacing (strongest indicator)
    if (ALIGNMENT_SPACE_PATTERN.test(line) && trimmed.length > MIN_SPACING_LINE_LENGTH) {
      spacingLines++;
    }

    // Check for AA special characters
    let aaChars = 0;
    for (const ch of trimmed) {
      if (AA_SPECIAL_CHARS.has(ch)) aaChars++;
    }
    if (aaChars >= MIN_AA_CHARS_PER_LINE) {
      aaCharLines++;
    }
  }

  if (analyzedLines < MIN_AA_LINES) return false;

  // Primary: multiple lines with alignment spacing
  if (spacingLines >= MIN_AA_LINES) return true;

  // Secondary: many lines with AA-specific characters
  if (aaCharLines >= MIN_AA_CHAR_LINES && aaCharLines / analyzedLines >= AA_CHAR_LINE_RATIO)
    return true;

  // Tertiary: combination of spacing and AA characters
  if (spacingLines >= 1 && aaCharLines >= MIN_AA_LINES) return true;

  return false;
}
