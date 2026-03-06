/**
 * DAT parsing and fetchDat tests.
 * Covers 5-field format, missing fields, CRLF/LF, old comma format, and network fetch scenarios.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../../src/main/services/http-client', () => ({
  httpFetch: vi.fn(),
}));

import { parseDatLine, parseDat, fetchDat } from '../../src/main/services/dat';
import { DatFetchStatus, BoardType } from '../../src/types/domain';
import type { Board } from '../../src/types/domain';
import { httpFetch } from '../../src/main/services/http-client';
import type { HttpResponse } from '../../src/types/api';
import { encodeString } from '../../src/main/services/encoding';

const mockHttpFetch = httpFetch as unknown as Mock<typeof httpFetch>;

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return { status: 200, headers: {}, body: Buffer.from(''), ...overrides };
}

const TEST_BOARD: Board = {
  title: 'Test Board',
  url: 'https://test.5ch.io/board/',
  bbsId: 'board',
  serverUrl: 'https://test.5ch.io/',
  boardType: BoardType.Type2ch,
};

const TEST_THREAD_ID = '1234567890';
// ASCII-only DAT content: Shift_JIS == UTF-8 for pure ASCII, so no encoding mismatch
const SIMPLE_DAT_TEXT =
  'Nanashi<>sage<>2024/01/01 00:00:00<>Body text<>Thread Title\nNanashi<><>2024/01/01 00:01:00<>Reply 2<>\n';
const SIMPLE_DAT = encodeString(SIMPLE_DAT_TEXT, 'Shift_JIS');

let tmpDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = await mkdtemp(join(tmpdir(), 'vbbb-dat-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('parseDatLine', () => {
  it('parses standard 5-field DAT line', () => {
    const line =
      '名無しさん<>sage<>2024/01/15(月) 12:34:56.78 ID:AbCdEfGh0<>本文テキスト<>スレッドタイトル';
    const res = parseDatLine(line, 1);
    expect(res).not.toBeNull();
    expect(res?.number).toBe(1);
    expect(res?.name).toBe('名無しさん');
    expect(res?.mail).toBe('sage');
    expect(res?.dateTime).toBe('2024/01/15(月) 12:34:56.78 ID:AbCdEfGh0');
    expect(res?.body).toBe('本文テキスト');
    expect(res?.title).toBe('スレッドタイトル');
  });

  it('handles empty body with &nbsp;', () => {
    const line = '名前<>mail<>datetime<><>';
    const res = parseDatLine(line, 5);
    expect(res?.body).toBe('&nbsp;');
  });

  it('handles missing title field (normal for res > 1)', () => {
    const line = '名前<>sage<>2024/01/01 00:00:00<>本文';
    const res = parseDatLine(line, 2);
    expect(res?.title).toBe('');
  });

  it('preserves leading whitespace in body for AA rendering', () => {
    const line = '名前<>sage<>date<>  本文先頭空白<>';
    const res = parseDatLine(line, 1);
    expect(res?.body).toBe('  本文先頭空白');
  });

  it('returns null for empty lines', () => {
    expect(parseDatLine('', 1)).toBeNull();
    expect(parseDatLine('  ', 1)).toBeNull();
  });

  it('handles body with HTML tags (br)', () => {
    const line = '名前<>sage<>date<>行1 <br> 行2<>';
    const res = parseDatLine(line, 1);
    expect(res?.body).toBe('行1 <br> 行2');
  });

  it('handles body with anchor references', () => {
    const line = '名前<>sage<>date<>&gt;&gt;123 レスアンカー<>';
    const res = parseDatLine(line, 1);
    expect(res?.body).toContain('&gt;&gt;123');
  });

  it('parses machi offlaw line correctly', () => {
    const line =
      '1<>スロウライダー<><>2007/06/21(木) 21:28:37 ID:y9R9FVbw<>前スレ<br>本文<>◇◆【酉の市】足立区花畑 ８【発祥の地】◆◇<>6D68-DA39-5033';
    const res = parseDatLine(line, 1);
    expect(res).not.toBeNull();
    expect(res?.number).toBe(1);
    expect(res?.name).toBe('スロウライダー');
    expect(res?.mail).toBe('');
    expect(res?.dateTime).toContain('2007/06/21');
    expect(res?.body).toContain('前スレ');
    expect(res?.title).toBe('◇◆【酉の市】足立区花畑 ８【発祥の地】◆◇');
    expect(res?.id).toBe('6D68-DA39-5033');
  });
});

describe('parseDat', () => {
  it('parses multiple DAT lines', () => {
    const content = [
      '名前1<>sage<>date1<>本文1<>タイトル',
      '名前2<>sage<>date2<>本文2<>',
      '名前3<><>date3<>本文3<>',
    ].join('\n');

    const results = parseDat(content);
    expect(results).toHaveLength(3);
    expect(results[0]?.number).toBe(1);
    expect(results[1]?.number).toBe(2);
    expect(results[2]?.number).toBe(3);
    expect(results[2]?.mail).toBe('');
  });

  it('handles CRLF line endings', () => {
    const content = '名前<>sage<>date<>本文1<>タイトル\r\n名前<>sage<>date<>本文2<>\r\n';
    const results = parseDat(content);
    expect(results).toHaveLength(2);
  });

  it('skips empty lines in DAT', () => {
    const content = '名前<>sage<>date<>本文<>タイトル\n\n名前2<>sage<>date<>本文2<>';
    const results = parseDat(content);
    expect(results).toHaveLength(2);
  });

  it('keeps response numbers from machi offlaw DAT', () => {
    const content = [
      '2<>東京都名無区<><>2007/06/23(土) 08:46:56 ID:f/Z6X5rc<>二日遅れの２げと<>CE5A-DA39-35B1',
      '4<>東京都名無区<><>2007/07/14(土) 21:07:59 ID:7dkDAO6o<>本文2<>FFEA-DA39-2232',
    ].join('\n');
    const results = parseDat(content);
    expect(results).toHaveLength(2);
    expect(results[0]?.number).toBe(2);
    expect(results[1]?.number).toBe(4);
  });
});

describe('fetchDat', () => {
  it('returns Full status on HTTP 200 (first fetch)', async () => {
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 200, body: SIMPLE_DAT }));

    const result = await fetchDat(TEST_BOARD, TEST_THREAD_ID, tmpDir);
    expect(result.status).toBe(DatFetchStatus.Full);
    expect(result.responses).toHaveLength(2);
    expect(result.responses[0]?.title).toBe('Thread Title');
  });

  it('returns error status on non-200/302/404 HTTP status', async () => {
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 503, body: Buffer.from('') }));

    const result = await fetchDat(TEST_BOARD, TEST_THREAD_ID, tmpDir);
    expect(result.status).toBe(DatFetchStatus.Error);
    expect(result.responses).toHaveLength(0);
    expect(result.errorMessage).toContain('503');
  });

  it('tries kako fallback on HTTP 302 (dat fallen)', async () => {
    // ASCII-only archived DAT (Shift_JIS safe)
    const archivedDatText = 'Nanashi<>sage<>2023/01/01<>Archive body<>Archived Thread\n';
    const archivedDat = encodeString(archivedDatText, 'Shift_JIS');

    // First call (full fetch): 302 dat fallen
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 302, body: Buffer.from('') }));
    // kako .dat.gz: 404
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 404, body: Buffer.from('') }));
    // kako .dat: 200 with archived content
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 200, body: archivedDat }));

    const result = await fetchDat(TEST_BOARD, TEST_THREAD_ID, tmpDir);
    expect(result.status).toBe(DatFetchStatus.Archived);
    expect(result.responses[0]?.title).toBe('Archived Thread');
  });

  it('returns DatFallen status when kako also fails and no local cache', async () => {
    // Full fetch: 302
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 302, body: Buffer.from('') }));
    // All kako URLs fail
    mockHttpFetch.mockResolvedValue(makeResponse({ status: 404, body: Buffer.from('') }));

    const result = await fetchDat(TEST_BOARD, TEST_THREAD_ID, tmpDir);
    expect(result.status).toBe(DatFetchStatus.DatFallen);
    expect(result.responses).toHaveLength(0);
  });

  it('returns Partial status on HTTP 206 differential fetch', async () => {
    // First: full fetch to populate local file
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 200, body: SIMPLE_DAT }));
    await fetchDat(TEST_BOARD, TEST_THREAD_ID, tmpDir);

    // Second: differential 206 response with new line appended
    const newLineText = 'Nanashi<><>2024/01/01 00:02:00<>Reply 3<>\n';
    const newLine = encodeString(newLineText, 'Shift_JIS');
    // The 206 response starts with the overlap bytes (DAT_ADJUST_MARGIN bytes)
    // then includes the new data. We need the overlap to match.
    const { DAT_ADJUST_MARGIN } = await import('../../src/types/file-format');
    const overlapBytes = SIMPLE_DAT.subarray(SIMPLE_DAT.length - DAT_ADJUST_MARGIN);
    const diffBody = Buffer.concat([overlapBytes, newLine]);

    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 206, body: diffBody }));

    const result = await fetchDat(TEST_BOARD, TEST_THREAD_ID, tmpDir);
    expect(result.status).toBe(DatFetchStatus.Partial);
    expect(result.responses.length).toBeGreaterThanOrEqual(2);
  });
});
