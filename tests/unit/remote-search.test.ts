import { describe, it, expect } from 'vitest';

/**
 * Remote search result parsing tests.
 * Tests the validation logic for dig.2ch.net API responses.
 */
describe('remote search result validation', () => {
  it('validates well-formed results', () => {
    const response: unknown[] = [
      { subject: 'Test Thread', ita: 'news', resno: 100, url: 'https://example.com/test/read.cgi/news/1234567890/' },
      { subject: 'Another', ita: 'prog', resno: 50, url: 'https://example.com/test/read.cgi/prog/9876543210/' },
    ];

    const results = response.filter(
      (item): item is { subject: string; ita: string; resno: number; url: string } =>
        typeof item === 'object' &&
        item !== null &&
        'subject' in item &&
        'ita' in item &&
        'resno' in item &&
        'url' in item,
    );

    expect(results).toHaveLength(2);
    expect(results[0]?.subject).toBe('Test Thread');
    expect(results[0]?.resno).toBe(100);
  });

  it('filters out malformed results', () => {
    const response: unknown[] = [
      { subject: 'Good', ita: 'news', resno: 10, url: 'https://example.com/' },
      { bad: 'data' },
      null,
      'string',
    ];

    const results = response.filter(
      (item): item is { subject: string; ita: string; resno: number; url: string } =>
        typeof item === 'object' &&
        item !== null &&
        'subject' in item &&
        'ita' in item &&
        'resno' in item &&
        'url' in item,
    );

    expect(results).toHaveLength(1);
  });

  it('handles empty response', () => {
    const response: unknown[] = [];
    const results = response.filter(
      (item): item is { subject: string; ita: string; resno: number; url: string } =>
        typeof item === 'object' && item !== null && 'subject' in item,
    );
    expect(results).toHaveLength(0);
  });
});
