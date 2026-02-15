/**
 * Encoding layer for Shift_JIS / EUC-JP / UTF-8 conversion.
 * Internal processing uses UTF-8 (Unicode). Encoding/decoding happens at I/O boundaries.
 */
import iconv from 'iconv-lite';
import { type EncodingType } from '@shared/api';

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
  return iconv.encode(text, encoding);
}

/**
 * Perform HTTP percent-encoding compatible with 2ch/5ch.
 * Characters 0-9, a-z, A-Z, *, -, ., @, _ are kept as-is.
 * All other bytes are encoded as %XX (uppercase hex).
 */
export function httpEncode(text: string, encoding: EncodingType): string {
  const encoded = encodeString(text, encoding);
  const parts: string[] = [];
  for (const byte of encoded) {
    const char = String.fromCharCode(byte);
    if (/[0-9a-zA-Z*\-.@_]/.test(char)) {
      parts.push(char);
    } else {
      parts.push(`%${byte.toString(16).toUpperCase().padStart(2, '0')}`);
    }
  }
  return parts.join('');
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
