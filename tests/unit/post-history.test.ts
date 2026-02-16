import { describe, it, expect } from 'vitest';
import { serializeHistoryEntry, parseSentIni } from '../../src/main/services/post-history';
import type { PostHistoryEntry } from '../../src/types/post-history';

describe('serializeHistoryEntry', () => {
  it('serializes a post history entry', () => {
    const entry: PostHistoryEntry = {
      timestamp: '2025-06-15T12:00:00.000Z',
      boardUrl: 'https://news.5ch.net/newsplus/',
      threadId: '1234567890',
      name: 'Test',
      mail: 'sage',
      message: 'Hello world',
    };
    const result = serializeHistoryEntry(entry);
    expect(result).toContain('[2025-06-15T12:00:00.000Z]');
    expect(result).toContain('BoardUrl=https://news.5ch.net/newsplus/');
    expect(result).toContain('ThreadId=1234567890');
    expect(result).toContain('Name=Test');
    expect(result).toContain('Mail=sage');
    expect(result).toContain('Message=Hello world');
  });

  it('escapes newlines in message', () => {
    const entry: PostHistoryEntry = {
      timestamp: '2025-06-15T12:00:00.000Z',
      boardUrl: 'https://example.com/',
      threadId: '123',
      name: '',
      mail: '',
      message: 'Line 1\nLine 2\nLine 3',
    };
    const result = serializeHistoryEntry(entry);
    expect(result).toContain('Message=Line 1\\nLine 2\\nLine 3');
  });
});

describe('parseSentIni', () => {
  it('parses a single entry', () => {
    const content = [
      '[2025-06-15T12:00:00.000Z]',
      'BoardUrl=https://example.com/',
      'ThreadId=123',
      'Name=User',
      'Mail=sage',
      'Message=Hello',
      '',
    ].join('\n');
    const entries = parseSentIni(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.timestamp).toBe('2025-06-15T12:00:00.000Z');
    expect(entries[0]?.boardUrl).toBe('https://example.com/');
    expect(entries[0]?.message).toBe('Hello');
  });

  it('parses multiple entries', () => {
    const content = [
      '[2025-06-15T12:00:00.000Z]',
      'BoardUrl=https://a.com/',
      'ThreadId=111',
      'Name=',
      'Mail=',
      'Message=First',
      '',
      '[2025-06-15T13:00:00.000Z]',
      'BoardUrl=https://b.com/',
      'ThreadId=222',
      'Name=',
      'Mail=',
      'Message=Second',
      '',
    ].join('\n');
    const entries = parseSentIni(content);
    expect(entries).toHaveLength(2);
  });

  it('restores escaped newlines', () => {
    const content = [
      '[2025-06-15T12:00:00.000Z]',
      'BoardUrl=https://example.com/',
      'ThreadId=123',
      'Name=',
      'Mail=',
      'Message=Line 1\\nLine 2',
      '',
    ].join('\n');
    const entries = parseSentIni(content);
    expect(entries[0]?.message).toBe('Line 1\nLine 2');
  });

  it('round-trips correctly', () => {
    const entry: PostHistoryEntry = {
      timestamp: '2025-06-15T12:00:00.000Z',
      boardUrl: 'https://example.com/',
      threadId: '999',
      name: 'Tester',
      mail: 'sage',
      message: 'Multi\nline\npost',
    };
    const serialized = serializeHistoryEntry(entry);
    const parsed = parseSentIni(serialized);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toStrictEqual(entry);
  });

  it('handles empty content', () => {
    expect(parseSentIni('')).toHaveLength(0);
  });
});
