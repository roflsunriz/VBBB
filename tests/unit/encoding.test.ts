/**
 * Encoding utility tests.
 * Covers httpEncode, sanitize/unsanitize for Folder.idx.
 */
import { describe, it, expect } from 'vitest';
import {
  httpEncode,
  replaceWithNCR,
  sanitizeForIdx,
  unsanitizeFromIdx,
} from '../../src/main/services/encoding';

describe('httpEncode', () => {
  it('keeps alphanumeric and safe characters as-is', () => {
    expect(httpEncode('abc123', 'Shift_JIS')).toBe('abc123');
    expect(httpEncode('*-.@_', 'Shift_JIS')).toBe('*-.@_');
  });

  it('encodes spaces as + (application/x-www-form-urlencoded)', () => {
    expect(httpEncode('hello world', 'Shift_JIS')).toBe('hello+world');
  });

  it('encodes Japanese text in Shift_JIS', () => {
    const encoded = httpEncode('テスト', 'Shift_JIS');
    // テスト in Shift_JIS is 0x83 0x65 0x83 0x58 0x83 0x67
    expect(encoded).toBe('%83e%83X%83g');
  });

  it('normalizes wave dash to a legacy-compatible byte sequence', () => {
    expect(httpEncode('\u301C', 'Shift_JIS')).toBe('%81%60');
    expect(httpEncode('\u301C', 'EUC-JP')).toBe('%A1%C1');
  });
});

describe('replaceWithNCR', () => {
  it('keeps Shift_JIS-compatible text unchanged', () => {
    expect(replaceWithNCR('テストabc123')).toBe('テストabc123');
  });

  it('converts a single-codepoint emoji to NCR', () => {
    expect(replaceWithNCR('hello\u{1F600}')).toBe('hello&#128512;');
  });

  it('converts multi-codepoint emoji (skin tone) to per-codepoint NCR', () => {
    // 👋🏾 = U+1F44B (128075) + U+1F3FE (127998)
    expect(replaceWithNCR('x\u{1F44B}\u{1F3FE}y')).toBe('x&#128075;&#127998;y');
  });

  it('keeps CP932 extended characters like ① and ～', () => {
    // These are in Windows-31J (CP932) but not in strict Shift_JIS
    expect(replaceWithNCR('\u2460')).toBe('\u2460'); // ①
    expect(replaceWithNCR('\uFF5E')).toBe('\uFF5E'); // ～
  });

  it('normalizes wave dash to fullwidth tilde instead of NCR', () => {
    expect(replaceWithNCR('\u301C')).toBe('\uFF5E');
    expect(replaceWithNCR('いいよね\u301C')).toBe('いいよね\uFF5E');
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
