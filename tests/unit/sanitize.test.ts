/**
 * Sanitization tests.
 * Covers DOMPurify HTML sanitization and dangerous URL scheme rejection.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeHtml, isSafeUrl, stripHtml } from '../../src/renderer/hooks/use-sanitize';

describe('sanitizeHtml', () => {
  it('allows safe HTML tags', () => {
    const result = sanitizeHtml('<b>bold</b> <br> <a href="https://example.com">link</a>');
    expect(result).toContain('<b>bold</b>');
    expect(result).toContain('<br>');
    expect(result).toContain('<a');
  });

  it('removes script tags', () => {
    const result = sanitizeHtml('<script>alert("xss")</script>text');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toContain('text');
  });

  it('removes event handlers', () => {
    const result = sanitizeHtml('<img onerror="alert(1)" src="x">');
    expect(result).not.toContain('onerror');
  });

  it('removes javascript: URLs from hrefs', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
  });

  it('removes iframe and object tags', () => {
    const result = sanitizeHtml(
      '<iframe src="evil.html"></iframe><object data="evil.swf"></object>',
    );
    expect(result).not.toContain('<iframe');
    expect(result).not.toContain('<object');
  });
});

describe('isSafeUrl', () => {
  it('allows https URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
  });

  it('allows http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  it('rejects javascript: scheme', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('JAVASCRIPT:alert(1)')).toBe(false);
  });

  it('rejects vbscript: scheme', () => {
    expect(isSafeUrl('vbscript:code')).toBe(false);
  });

  it('rejects data: scheme', () => {
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('handles whitespace-padded URLs', () => {
    expect(isSafeUrl('  javascript:alert(1)  ')).toBe(false);
  });
});

describe('stripHtml', () => {
  it('removes all HTML tags', () => {
    expect(stripHtml('<b>bold</b> <a href="url">link</a>')).toBe('bold link');
  });
});
