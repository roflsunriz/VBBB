import { describe, it, expect } from 'vitest';
import { parseTabSav, serializeTabSav, replaceTabUrls } from '../../src/main/services/tab-persistence';

describe('parseTabSav', () => {
  it('parses valid tab lines', () => {
    const content = 'https://news.5ch.net/newsplus/\t1234567890\tTest Thread\nhttps://example.com/board/\t9876543210\tAnother';
    const tabs = parseTabSav(content);
    expect(tabs).toHaveLength(2);
    expect(tabs[0]?.boardUrl).toBe('https://news.5ch.net/newsplus/');
    expect(tabs[0]?.threadId).toBe('1234567890');
    expect(tabs[0]?.title).toBe('Test Thread');
  });

  it('skips empty lines', () => {
    const content = '\nhttps://example.com/\t123\tTitle\n\n';
    const tabs = parseTabSav(content);
    expect(tabs).toHaveLength(1);
  });

  it('skips lines with missing fields', () => {
    const content = '\t\t\nhttps://example.com/\t123\tTitle';
    const tabs = parseTabSav(content);
    expect(tabs).toHaveLength(1);
  });

  it('returns empty for empty content', () => {
    expect(parseTabSav('')).toHaveLength(0);
  });
});

describe('serializeTabSav', () => {
  it('serializes tabs correctly', () => {
    const tabs = [
      { boardUrl: 'https://a.com/', threadId: '111', title: 'First' },
      { boardUrl: 'https://b.com/', threadId: '222', title: 'Second' },
    ];
    const result = serializeTabSav(tabs);
    expect(result).toBe('https://a.com/\t111\tFirst\nhttps://b.com/\t222\tSecond');
  });

  it('round-trips correctly', () => {
    const original = [
      { boardUrl: 'https://example.com/board/', threadId: '999', title: 'Test' },
    ];
    const serialized = serializeTabSav(original);
    const parsed = parseTabSav(serialized);
    expect(parsed).toStrictEqual(original);
  });
});

describe('replaceTabUrls', () => {
  it('replaces matching board URLs', () => {
    const tabs = [
      { boardUrl: 'https://old.5ch.net/board/', threadId: '123', title: 'Test' },
      { boardUrl: 'https://other.com/', threadId: '456', title: 'Other' },
    ];
    const urlMap = new Map([['https://old.5ch.net/board/', 'https://new.5ch.net/board/']]);
    const result = replaceTabUrls(tabs, urlMap);
    expect(result[0]?.boardUrl).toBe('https://new.5ch.net/board/');
    expect(result[1]?.boardUrl).toBe('https://other.com/');
  });
});
