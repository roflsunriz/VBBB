import { describe, it, expect } from 'vitest';
import {
  parseTabSav,
  serializeTabSav,
  replaceTabUrls,
  loadSessionState,
  saveSessionState,
  saveTabsSync,
  saveSessionStateSync,
  loadSavedTabs,
} from '../../src/main/services/tab-persistence';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('parseTabSav', () => {
  it('parses valid tab lines', () => {
    const content =
      'https://news.5ch.net/newsplus/\t1234567890\tTest Thread\nhttps://example.com/board/\t9876543210\tAnother';
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
    // scrollTop and scrollResNumber default to 0 when absent
    expect(result).toBe('https://a.com/\t111\tFirst\t0\t0\nhttps://b.com/\t222\tSecond\t0\t0');
  });

  it('serializes tabs with scrollTop', () => {
    const tabs = [{ boardUrl: 'https://a.com/', threadId: '111', title: 'First', scrollTop: 500 }];
    const result = serializeTabSav(tabs);
    expect(result).toBe('https://a.com/\t111\tFirst\t500\t0');
  });

  it('round-trips correctly', () => {
    const original = [{ boardUrl: 'https://example.com/board/', threadId: '999', title: 'Test' }];
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

describe('loadSessionState', () => {
  it('returns default when no file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    const result = loadSessionState(dir);
    expect(result).toStrictEqual({ selectedBoardUrl: null });
  });

  it('returns default for invalid JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'session.json'), 'not-json');
    const result = loadSessionState(dir);
    expect(result).toStrictEqual({ selectedBoardUrl: null });
  });
});

describe('saveSessionState', () => {
  it('persists session to file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    mkdirSync(dir, { recursive: true });
    await saveSessionState(dir, { selectedBoardUrl: 'https://example.5ch.net/board/' });
    const content = readFileSync(join(dir, 'session.json'), 'utf-8');
    const parsed = JSON.parse(content) as { selectedBoardUrl: string };
    expect(parsed.selectedBoardUrl).toBe('https://example.5ch.net/board/');
  });

  it('round-trips correctly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    mkdirSync(dir, { recursive: true });
    const state = {
      selectedBoardUrl: 'https://news.5ch.net/newsplus/',
      activeThreadTabId: undefined,
      boardTabUrls: undefined,
      activeBoardTabId: undefined,
    };
    await saveSessionState(dir, state);
    const loaded = loadSessionState(dir);
    expect(loaded).toStrictEqual(state);
  });

  it('round-trips with board tabs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    mkdirSync(dir, { recursive: true });
    const state = {
      selectedBoardUrl: 'https://news.5ch.net/newsplus/',
      activeThreadTabId: 'https://news.5ch.net/newsplus/:1234567890',
      boardTabUrls: ['https://news.5ch.net/newsplus/', 'https://eagle.5ch.net/livejupiter/'],
      activeBoardTabId: 'https://eagle.5ch.net/livejupiter/',
    };
    await saveSessionState(dir, state);
    const loaded = loadSessionState(dir);
    expect(loaded).toStrictEqual(state);
  });
});

describe('saveTabsSync', () => {
  it('writes tabs synchronously and can be loaded back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    mkdirSync(dir, { recursive: true });
    const tabs = [
      { boardUrl: 'https://a.com/', threadId: '111', title: 'First', scrollTop: 100 },
      { boardUrl: 'https://b.com/', threadId: '222', title: 'Second' },
      { boardUrl: 'https://c.com/', threadId: '333', title: 'Third', scrollTop: 300 },
      { boardUrl: 'https://d.com/', threadId: '444', title: 'Fourth' },
    ];
    saveTabsSync(dir, tabs);
    const loaded = loadSavedTabs(dir);
    expect(loaded).toHaveLength(4);
    expect(loaded[0]?.boardUrl).toBe('https://a.com/');
    expect(loaded[0]?.scrollTop).toBe(100);
    expect(loaded[1]?.threadId).toBe('222');
    expect(loaded[2]?.title).toBe('Third');
    expect(loaded[3]?.title).toBe('Fourth');
  });

  it('creates backup file when overwriting', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    mkdirSync(dir, { recursive: true });
    // First save
    saveTabsSync(dir, [{ boardUrl: 'https://a.com/', threadId: '1', title: 'Old' }]);
    // Second save overwrites
    saveTabsSync(dir, [
      { boardUrl: 'https://a.com/', threadId: '1', title: 'New' },
      { boardUrl: 'https://b.com/', threadId: '2', title: 'Added' },
    ]);
    const bakPath = join(dir, 'tab.sav.bak');
    expect(existsSync(bakPath)).toBe(true);
    const bakContent = readFileSync(bakPath, 'utf-8');
    expect(bakContent).toContain('Old');
    const loaded = loadSavedTabs(dir);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.title).toBe('New');
  });

  it('creates directory if missing', () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'vbbb-test-')), 'subdir');
    saveTabsSync(dir, [{ boardUrl: 'https://a.com/', threadId: '1', title: 'Test' }]);
    expect(existsSync(join(dir, 'tab.sav'))).toBe(true);
  });
});

describe('saveSessionStateSync', () => {
  it('writes session synchronously and can be loaded back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    mkdirSync(dir, { recursive: true });
    const state = {
      selectedBoardUrl: 'https://news.5ch.net/newsplus/',
      activeThreadTabId: 'https://news.5ch.net/newsplus/:1234567890',
      boardTabUrls: ['https://news.5ch.net/newsplus/', 'https://eagle.5ch.net/livejupiter/'],
      activeBoardTabId: 'https://eagle.5ch.net/livejupiter/',
    };
    saveSessionStateSync(dir, state);
    const loaded = loadSessionState(dir);
    expect(loaded).toStrictEqual(state);
  });

  it('creates backup file when overwriting', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vbbb-test-'));
    mkdirSync(dir, { recursive: true });
    saveSessionStateSync(dir, { selectedBoardUrl: 'https://old.com/' });
    saveSessionStateSync(dir, { selectedBoardUrl: 'https://new.com/' });
    const bakPath = join(dir, 'session.json.bak');
    expect(existsSync(bakPath)).toBe(true);
    const loaded = loadSessionState(dir);
    expect(loaded.selectedBoardUrl).toBe('https://new.com/');
  });
});
