/**
 * Encoding utility tests.
 * Covers httpEncode, sanitize/unsanitize for Folder.idx.
 */
import { describe, it, expect } from 'vitest';
import { httpEncode, sanitizeForIdx, unsanitizeFromIdx } from '../../src/main/services/encoding';

describe('httpEncode', () => {
  it('keeps alphanumeric and safe characters as-is', () => {
    expect(httpEncode('abc123', 'Shift_JIS')).toBe('abc123');
    expect(httpEncode('*-.@_', 'Shift_JIS')).toBe('*-.@_');
  });

  it('encodes spaces as %20', () => {
    expect(httpEncode('hello world', 'Shift_JIS')).toBe('hello%20world');
  });

  it('encodes Japanese text in Shift_JIS', () => {
    const encoded = httpEncode('テスト', 'Shift_JIS');
    // テスト in Shift_JIS is 0x83 0x65 0x83 0x58 0x83 0x67
    expect(encoded).toBe('%83e%83X%83g');
  });
});

describe('sanitizeForIdx', () => {
  it('escapes & and "', () => {
    expect(sanitizeForIdx('A & B "test"')).toBe('A &amp; B &quot;test&quot;');
  });

  it('does not double-escape', () => {
    expect(sanitizeForIdx('&amp;')).toBe('&amp;amp;');
  });
});

describe('unsanitizeFromIdx', () => {
  it('unescapes &quot; first, then &amp;', () => {
    expect(unsanitizeFromIdx('A &amp; B &quot;test&quot;')).toBe('A & B "test"');
  });

  it('handles &amp;quot; correctly (order matters)', () => {
    // &amp;quot; should become &quot; (not ")
    expect(unsanitizeFromIdx('&amp;quot;')).toBe('&quot;');
  });
});
