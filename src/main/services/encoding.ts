/**
 * Encoding layer for Shift_JIS / EUC-JP / UTF-8 conversion.
 * Internal processing uses UTF-8 (Unicode). Encoding/decoding happens at I/O boundaries.
 */
import iconv from 'iconv-lite';
import { type EncodingType } from '@shared/api';

/**
 * Legacy Japanese encodings use compatibility mappings for a handful of code
 * points. Normalize them before encode checks so user input like U+301C (〜)
 * is sent as the representable U+FF5E (～) instead of degrading to '?' or NCR.
 */
const LEGACY_JAPANESE_COMPAT_MAP: Readonly<Record<string, string>> = {
  '\u301C': '\uFF5E', // wave dash -> fullwidth tilde
  '\u2016': '\u2225', // double vertical line -> parallel to
  '\u2212': '\uFF0D', // minus sign -> fullwidth hyphen-minus
  '\u00A2': '\uFFE0', // cent sign -> fullwidth cent sign
  '\u00A3': '\uFFE1', // pound sign -> fullwidth pound sign
  '\u00AC': '\uFFE2', // not sign -> fullwidth not sign
  '\u2014': '\u2015', // em dash -> horizontal bar
};

function normalizeForLegacyJapaneseEncoding(text: string, encoding: EncodingType): string {
  if (encoding !== 'Shift_JIS' && encoding !== 'EUC-JP') {
    return text;
  }

  let normalized = '';
  for (const char of text) {
    normalized += LEGACY_JAPANESE_COMPAT_MAP[char] ?? char;
  }
  return normalized;
}

function encodeStringEucJp(text: string): Buffer {
  const parts: Buffer[] = [];

  for (const char of text) {
    if (char === '\uFF5E') {
      // Prefer the plane-1 EUC-JP wave-dash bytes (A1 C1). iconv-lite encodes
      // U+FF5E as the plane-2 sequence 8F A2 B7, but legacy BBS servers on
      // JBBS/したらば often mishandle that form and store replacement chars.
      parts.push(Buffer.from([0xa1, 0xc1]));
      continue;
    }

    parts.push(iconv.encode(char, 'EUC-JP'));
  }

  return Buffer.concat(parts);
}

/**
 * Decode a buffer from the specified encoding to a UTF-8 string.
 */
export function decodeBuffer(buffer: Buffer, encoding: EncodingType): string {
  return iconv.decode(buffer, encoding);
}

/**
 * Encode a UTF-8 string to a buffer in the specified encoding.
 */
export function encodeString(text: string, encoding: EncodingType): Buffer {
  const normalized = normalizeForLegacyJapaneseEncoding(text, encoding);
  if (encoding === 'EUC-JP') {
    return encodeStringEucJp(normalized);
  }
  return iconv.encode(normalized, encoding);
}

/**
 * Perform HTTP percent-encoding compatible with 2ch/5ch
 * (application/x-www-form-urlencoded format).
 *
 * Characters 0-9, a-z, A-Z, *, -, ., @, _ are kept as-is.
 * Space (0x20) is encoded as '+' (NOT '%20') per the
 * application/x-www-form-urlencoded standard — this matches
 * OkHttp's FormBody behaviour used by Slevo.
 * All other bytes are encoded as %XX (uppercase hex).
 */
export function httpEncode(text: string, encoding: EncodingType): string {
  const encoded = encodeString(text, encoding);
  const parts: string[] = [];
  for (const byte of encoded) {
    if (byte === 0x20) {
      parts.push('+');
    } else {
      const char = String.fromCharCode(byte);
      if (/[0-9a-zA-Z*\-.@_]/.test(char)) {
        parts.push(char);
      } else {
        parts.push(`%${byte.toString(16).toUpperCase().padStart(2, '0')}`);
      }
    }
  }
  return parts.join('');
}

/**
 * Replace characters that cannot be represented in the given encoding
 * with Numeric Character References (NCR: `&#codepoint;`).
 *
 * Processing is done per Unicode grapheme cluster (via Intl.Segmenter) so
 * that multi-codepoint sequences like skin-tone emoji (👋🏾 = U+1F44B U+1F3FE)
 * are correctly split into per-codepoint NCRs rather than being broken at
 * surrogate pair boundaries.
 *
 * This must be applied to all form field values BEFORE encoding to
 * Shift_JIS / EUC-JP.
 *
 * @param input    - The input string.
 * @param encoding - Target encoding to check against (default: 'Shift_JIS').
 */
export function replaceWithNCR(input: string, encoding: EncodingType = 'Shift_JIS'): string {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  const parts: string[] = [];

  for (const { segment } of segmenter.segment(input)) {
    const normalized = normalizeForLegacyJapaneseEncoding(segment, encoding);
    if (canEncodeInEncoding(normalized, encoding)) {
      parts.push(normalized);
    } else {
      // Convert each codepoint in the grapheme cluster to NCR
      for (const char of segment) {
        const cp = char.codePointAt(0);
        if (cp !== undefined) {
          parts.push(`&#${String(cp)};`);
        }
      }
    }
  }

  return parts.join('');
}

/**
 * Check whether a string segment can be fully encoded in the given encoding.
 * iconv-lite replaces unencodable characters with '?' (0x3F), so we
 * encode then decode and verify round-trip fidelity.
 */
function canEncodeInEncoding(segment: string, encoding: EncodingType): boolean {
  const encoded = iconv.encode(segment, encoding);
  const decoded = iconv.decode(encoded, encoding);
  return decoded === segment;
}

/**
 * Sanitize HTML entities for Folder.idx title storage.
 * & -> &amp;  " -> &quot;
 */
export function sanitizeForIdx(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * Reverse sanitize from Folder.idx.
 * Order matters: &quot; first, then &amp;
 */
export function unsanitizeFromIdx(text: string): string {
  return text.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
