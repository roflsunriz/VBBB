/**
 * BBS menu parsing, fetch, and cache tests.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../../src/main/services/http-client', () => ({
  httpFetch: vi.fn(),
}));

import {
  parseBBSMenuHtml,
  normalizeBBSMenuSourceUrls,
  fetchBBSMenu,
  saveBBSMenuCache,
  loadBBSMenuCache,
} from '../../src/main/services/bbs-menu';
import { httpFetch } from '../../src/main/services/http-client';
import type { HttpResponse } from '../../src/types/api';
import { DEFAULT_BBS_MENU_URLS } from '../../src/types/file-format';
import { encodeString } from '../../src/main/services/encoding';

const mockHttpFetch = httpFetch as unknown as Mock<typeof httpFetch>;

const TEST_DOMAIN = '5ch.io';

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return {
    status: 200,
    headers: {},
    body: Buffer.from(''),
    ...overrides,
  };
}

/** Shift_JIS encode HTML for BBS menu mock responses (bbsmenu.html is Shift_JIS encoded). */
function sjisBuffer(text: string): Buffer {
  return encodeString(text, 'Shift_JIS');
}

let tmpDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = await mkdtemp(join(tmpdir(), 'vbbb-bbs-menu-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('normalizeBBSMenuSourceUrls', () => {
  it('returns input URLs that are valid http/https', () => {
    const result = normalizeBBSMenuSourceUrls([
      'https://menu.5ch.net/bbsmenu.html',
      'http://menu.example.com/bbsmenu.html',
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('https://menu.5ch.net/bbsmenu.html');
  });

  it('trims whitespace from URLs', () => {
    const result = normalizeBBSMenuSourceUrls(['  https://menu.5ch.net/bbsmenu.html  ']);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('https://menu.5ch.net/bbsmenu.html');
  });

  it('filters out non-http/https URLs', () => {
    const result = normalizeBBSMenuSourceUrls([
      'ftp://bad.example.com/',
      'https://good.example.com/',
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('https://good.example.com/');
  });

  it('deduplicates identical URLs', () => {
    const result = normalizeBBSMenuSourceUrls([
      'https://menu.5ch.net/bbsmenu.html',
      'https://menu.5ch.net/bbsmenu.html',
    ]);
    expect(result).toHaveLength(1);
  });

  it('falls back to DEFAULT_BBS_MENU_URLS when all URLs are invalid', () => {
    const result = normalizeBBSMenuSourceUrls(['', 'not-a-url', 'ftp://nope/']);
    expect(result).toStrictEqual([...DEFAULT_BBS_MENU_URLS]);
  });

  it('falls back to DEFAULT_BBS_MENU_URLS for empty array', () => {
    const result = normalizeBBSMenuSourceUrls([]);
    expect(result).toStrictEqual([...DEFAULT_BBS_MENU_URLS]);
  });
});

describe('fetchBBSMenu', () => {
  const SIMPLE_HTML = `<b>ニュース</b><br>
<a href=https://news.5ch.io/newsplus/>ニュース速報+</a><br>
<b>生活</b><br>
<a href=https://cooking.5ch.io/cook/>料理</a><br>`;

  it('fetches and parses from a single source URL', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({ status: 200, body: sjisBuffer(SIMPLE_HTML) }),
    );

    const menu = await fetchBBSMenu(['https://menu.5ch.net/bbsmenu.html'], TEST_DOMAIN);
    expect(menu.categories.length).toBeGreaterThan(0);
    expect(menu.categories[0]?.name).toBe('ニュース');
    expect(menu.categories[0]?.boards[0]?.title).toBe('ニュース速報+');
  });

  it('merges categories from multiple sources', async () => {
    const html1 = `<b>ニュース</b><br>
<a href=https://news.5ch.io/newsplus/>ニュース速報+</a><br>`;
    const html2 = `<b>生活</b><br>
<a href=https://cooking.5ch.io/cook/>料理</a><br>`;

    mockHttpFetch
      .mockResolvedValueOnce(makeResponse({ status: 200, body: sjisBuffer(html1) }))
      .mockResolvedValueOnce(makeResponse({ status: 200, body: sjisBuffer(html2) }));

    const menu = await fetchBBSMenu(
      ['https://menu1.example.com/', 'https://menu2.example.com/'],
      TEST_DOMAIN,
    );
    const names = menu.categories.map((c) => c.name);
    expect(names).toContain('ニュース');
    expect(names).toContain('生活');
  });

  it('throws when all sources fail', async () => {
    mockHttpFetch.mockRejectedValue(new Error('Network error'));

    await expect(
      fetchBBSMenu(['https://menu.example.com/'], TEST_DOMAIN),
    ).rejects.toThrow('Failed to fetch all BBS menu sources');
  });

  it('succeeds with partial source failure (at least one succeeds)', async () => {
    mockHttpFetch
      .mockRejectedValueOnce(new Error('Source 1 failed'))
      .mockResolvedValueOnce(makeResponse({ status: 200, body: sjisBuffer(SIMPLE_HTML) }));

    const menu = await fetchBBSMenu(
      ['https://fail.example.com/', 'https://ok.example.com/'],
      TEST_DOMAIN,
    );
    expect(menu.categories.length).toBeGreaterThan(0);
  });

  it('ignores non-200 HTTP responses', async () => {
    mockHttpFetch
      .mockResolvedValueOnce(makeResponse({ status: 500, body: Buffer.from('') }))
      .mockResolvedValueOnce(makeResponse({ status: 200, body: sjisBuffer(SIMPLE_HTML) }));

    const menu = await fetchBBSMenu(
      ['https://fail.example.com/', 'https://ok.example.com/'],
      TEST_DOMAIN,
    );
    expect(menu.categories.length).toBeGreaterThan(0);
  });
});

describe('saveBBSMenuCache / loadBBSMenuCache', () => {
  it('round-trips through save and load', async () => {
    const menu = parseBBSMenuHtml(
      `<b>テスト</b><br>
<a href=https://test.5ch.io/board/>テスト板</a><br>`,
      TEST_DOMAIN,
    );

    await saveBBSMenuCache(tmpDir, menu);
    const loaded = loadBBSMenuCache(tmpDir, TEST_DOMAIN);

    expect(loaded).not.toBeNull();
    expect(loaded?.categories).toHaveLength(1);
    expect(loaded?.categories[0]?.name).toBe('テスト');
    expect(loaded?.categories[0]?.boards[0]?.title).toBe('テスト板');
  });

  it('returns null when no cache file exists', () => {
    const result = loadBBSMenuCache(tmpDir, TEST_DOMAIN);
    expect(result).toBeNull();
  });

  it('normalizes domain in loaded cache', async () => {
    const menu = parseBBSMenuHtml(
      `<b>テスト</b><br>
<a href=https://test.5ch.net/board/>テスト板</a><br>`,
      '5ch.net',
    );

    await saveBBSMenuCache(tmpDir, menu);

    // Load with a different domain — URLs get re-normalized
    const loaded = loadBBSMenuCache(tmpDir, 'example.com');
    expect(loaded).not.toBeNull();
    // URL should have been normalized to the new domain
    expect(loaded?.categories[0]?.boards[0]?.url).toContain('example.com');
  });
});

describe('parseBBSMenuHtml', () => {
  it('parses categories and boards from HTML', () => {
    const html = `
      <b>ニュース</b><br>
      <a href=https://news.5ch.io/newsplus/>ニュース速報+</a><br>
      <a href=https://news.5ch.io/mnewsplus/>芸スポ速報+</a><br>
      <b>生活</b><br>
      <a href=https://cooking.5ch.io/cook/>料理</a><br>
    `;

    const menu = parseBBSMenuHtml(html, TEST_DOMAIN);
    expect(menu.categories).toHaveLength(2);

    const news = menu.categories[0]!;
    expect(news.name).toBe('ニュース');
    expect(news.boards).toHaveLength(2);
    expect(news.boards[0]?.title).toBe('ニュース速報+');
    expect(news.boards[0]?.url).toContain('5ch.io');
    expect(news.boards[0]?.bbsId).toBe('newsplus');

    const life = menu.categories[1]!;
    expect(life.name).toBe('生活');
    expect(life.boards).toHaveLength(1);
  });

  it('normalizes .2ch.net to configured domain', () => {
    const html = `
      <b>テスト</b><br>
      <a href=https://test.2ch.net/board/>Board</a><br>
    `;
    const menu = parseBBSMenuHtml(html, TEST_DOMAIN);
    expect(menu.categories[0]?.boards[0]?.url).toContain('.5ch.io');
    expect(menu.categories[0]?.boards[0]?.url).not.toContain('.2ch.net');
  });

  it('normalizes legacy .5ch.net to configured domain', () => {
    const html = `
      <b>テスト</b><br>
      <a href=https://news.5ch.net/newsplus/>ニュース速報+</a><br>
    `;
    const menu = parseBBSMenuHtml(html, TEST_DOMAIN);
    expect(menu.categories[0]?.boards[0]?.url).toContain('.5ch.io');
    expect(menu.categories[0]?.boards[0]?.url).not.toContain('.5ch.net');
  });

  it('skips ignored categories', () => {
    const html = `
      <b>おすすめ</b><br>
      <a href=https://rec.5ch.io/board/>Board</a><br>
      <b>実用</b><br>
      <a href=https://tools.5ch.io/board2/>Board2</a><br>
    `;
    const menu = parseBBSMenuHtml(html, TEST_DOMAIN);
    expect(menu.categories).toHaveLength(1);
    expect(menu.categories[0]?.name).toBe('実用');
  });

  it('skips non-5ch/2ch URLs', () => {
    const html = `
      <b>外部</b><br>
      <a href=https://example.com/board/>External</a><br>
      <a href=https://news.5ch.io/test/>5ch Board</a><br>
    `;
    const menu = parseBBSMenuHtml(html, TEST_DOMAIN);
    expect(menu.categories[0]?.boards).toHaveLength(1);
    expect(menu.categories[0]?.boards[0]?.title).toBe('5ch Board');
  });

  it('handles empty HTML', () => {
    const menu = parseBBSMenuHtml('', TEST_DOMAIN);
    expect(menu.categories).toHaveLength(0);
  });

  it('accepts bbspink.com boards', () => {
    const html = `
      <b>ピンク</b><br>
      <a href=https://pinkch.bbspink.com/pinkch/>ピンク</a><br>
    `;
    const menu = parseBBSMenuHtml(html, TEST_DOMAIN);
    expect(menu.categories[0]?.boards).toHaveLength(1);
    expect(menu.categories[0]?.boards[0]?.url).toContain('bbspink.com');
  });
});
