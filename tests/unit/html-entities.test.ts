/**
 * HTML entity decoding tests.
 * Covers named entities, decimal/hex numeric character references,
 * surrogate-pair codepoints (emoji), edge cases, and double-encoding.
 */
import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities } from '../../src/types/html-entities';

describe('decodeHtmlEntities', () => {
  // --- Named entities ---------------------------------------------------
  it('decodes &amp;', () => {
    expect(decodeHtmlEntities('A &amp; B')).toBe('A & B');
  });

  it('decodes &lt; and &gt;', () => {
    expect(decodeHtmlEntities('&lt;b&gt;bold&lt;/b&gt;')).toBe('<b>bold</b>');
  });

  it('decodes &quot;', () => {
    expect(decodeHtmlEntities('say &quot;hello&quot;')).toBe('say "hello"');
  });

  it('decodes &apos;', () => {
    expect(decodeHtmlEntities('it&apos;s')).toBe("it's");
  });

  it('decodes &nbsp;', () => {
    expect(decodeHtmlEntities('a&nbsp;b')).toBe('a b');
  });

  // --- Decimal numeric character references -----------------------------
  it('decodes ASCII decimal NCR &#39;', () => {
    expect(decodeHtmlEntities('it&#39;s')).toBe("it's");
  });

  it('decodes &#039; (leading zero)', () => {
    expect(decodeHtmlEntities('it&#039;s')).toBe("it's");
  });

  it('decodes BMP codepoint &#9829; (♥)', () => {
    expect(decodeHtmlEntities('I &#9829; you')).toBe('I \u2665 you');
  });

  it('decodes supplementary plane emoji &#127825; (🍑)', () => {
    // U+1F351 = 127825 (peach emoji)
    expect(decodeHtmlEntities('&#127825;おいしい')).toBe('\u{1F351}おいしい');
  });

  it('decodes &#128512; (😀) — codepoint above U+FFFF', () => {
    expect(decodeHtmlEntities('Hello&#128512;World')).toBe('Hello\u{1F600}World');
  });

  // --- Hexadecimal numeric character references -------------------------
  it('decodes hex NCR &#x1F34E; (🍎)', () => {
    expect(decodeHtmlEntities('&#x1F34E;')).toBe('\u{1F34E}');
  });

  it('decodes lowercase hex NCR &#x1f34e;', () => {
    expect(decodeHtmlEntities('&#x1f34e;')).toBe('\u{1F34E}');
  });

  it('decodes mixed hex &#x26; (&)', () => {
    expect(decodeHtmlEntities('&#x26;')).toBe('&');
  });

  // --- Multiple entities in one string ----------------------------------
  it('decodes multiple mixed entities', () => {
    const input = '&lt;&#127825;&gt; &amp; &#x1F600;';
    expect(decodeHtmlEntities(input)).toBe('<\u{1F351}> & \u{1F600}');
  });

  // --- Double-encoded sequences -----------------------------------------
  it('does not double-decode &amp;#127825; (double-encoded)', () => {
    // &amp;#127825; should become the literal string &#127825;, NOT the emoji
    expect(decodeHtmlEntities('&amp;#127825;')).toBe('&#127825;');
  });

  it('does not double-decode &amp;lt;', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });

  // --- Edge cases -------------------------------------------------------
  it('returns empty string unchanged', () => {
    expect(decodeHtmlEntities('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(decodeHtmlEntities('こんにちは世界')).toBe('こんにちは世界');
  });

  it('handles invalid codepoint gracefully (out of range)', () => {
    // &#9999999; is above U+10FFFF — should be left as-is
    expect(decodeHtmlEntities('&#9999999;')).toBe('&#9999999;');
  });

  it('handles &#0; (null codepoint) gracefully', () => {
    // U+0000 is technically valid but risky; fromCodePoint(0) returns \0
    expect(decodeHtmlEntities('&#0;')).toBe('\0');
  });

  it('handles incomplete entity (no semicolon) — no decode', () => {
    expect(decodeHtmlEntities('&#127825')).toBe('&#127825');
  });

  it('preserves non-entity ampersands', () => {
    expect(decodeHtmlEntities('A & B')).toBe('A & B');
  });
});
