import { describe, expect, it } from 'vitest';
import { linkifyUrls } from '../../src/renderer/utils/url-linkify';

describe('linkifyUrls', () => {
  it('links https URL as-is', () => {
    const result = linkifyUrls('see https://example.com/path?q=1');
    expect(result).toContain('data-url="https://example.com/path?q=1"');
    expect(result).toContain('>https://example.com/path?q=1<');
  });

  it('normalizes non-http(s) schemes to https for opening', () => {
    const result = linkifyUrls('a ttps://a.com b hxxps://b.com c xyz://c.com');
    expect(result).toContain('data-url="https://a.com"');
    expect(result).toContain('data-url="https://b.com"');
    expect(result).toContain('data-url="https://c.com"');
    expect(result).toContain('>ttps://a.com<');
    expect(result).toContain('>hxxps://b.com<');
    expect(result).toContain('>xyz://c.com<');
  });

  it('linkifies URL without protocol and normalizes to https', () => {
    const result = linkifyUrls('go example.com/test now');
    expect(result).toContain('data-url="https://example.com/test"');
    expect(result).toContain('>example.com/test<');
  });

  it('keeps trailing punctuation outside the generated link', () => {
    const result = linkifyUrls('see example.com/test。');
    expect(result).toContain('>example.com/test<');
    expect(result).toContain('</a>。');
  });

  it('does not relink URLs already inside anchor tags', () => {
    const html = '<a href="https://already.example">https://already.example</a>';
    const result = linkifyUrls(html);
    expect(result).toBe(html);
  });
});
