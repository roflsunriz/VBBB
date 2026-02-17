/**
 * Shared HTML entity decoder.
 * Uses a single-pass regex so that decoded output is never re-scanned.
 *
 * This prevents double-decoding: "&amp;lt;" correctly becomes "&lt;"
 * (not "<"), because each &…; sequence is matched and replaced exactly once.
 */

/** Named HTML entities recognised by BBS content. */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Safely convert a numeric codepoint to the corresponding character.
 * Returns the original match text for out-of-range / NaN codepoints
 * so that the string is never corrupted.
 */
function safeFromCodePoint(codePoint: number, original: string): string {
  if (Number.isNaN(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return original;
  }
  return String.fromCodePoint(codePoint);
}

/**
 * Decode HTML entities found in BBS content (subject.txt titles, DAT fields, etc.).
 *
 * Supported patterns (single-pass, no double-decoding):
 *  - `&#127825;`   (decimal numeric character reference)
 *  - `&#x1F34E;`   (hexadecimal numeric character reference)
 *  - `&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&nbsp;`
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-fA-F]+)|#(\d+)|(\w+));/g,
    (match: string, hex: string | undefined, dec: string | undefined, name: string | undefined): string => {
      if (hex !== undefined) {
        return safeFromCodePoint(parseInt(hex, 16), match);
      }
      if (dec !== undefined) {
        return safeFromCodePoint(parseInt(dec, 10), match);
      }
      if (name !== undefined) {
        const entity = NAMED_ENTITIES[name];
        return entity !== undefined ? entity : match;
      }
      return match;
    },
  );
}
