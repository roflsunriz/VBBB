/**
 * subject.txt parsing, buildUpdatedIndex, and fetchSubject tests.
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
  parseSubjectLine,
  parseSubjectTxt,
  determineAgeSage,
  parseFolderIdx,
  serializeFolderIdx,
  buildUpdatedIndex,
  fetchSubject,
} from '../../src/main/services/subject';
import { AgeSage, BoardType, type ThreadIndex, type Board } from '../../src/types/domain';
import { FOLDER_IDX_VERSION, KOKOMADE_UNSET } from '../../src/types/file-format';
import { httpFetch } from '../../src/main/services/http-client';
import type { HttpResponse } from '../../src/types/api';

const mockHttpFetch = httpFetch as unknown as Mock<typeof httpFetch>;

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return { status: 200, headers: {}, body: Buffer.from(''), ...overrides };
}

const TEST_BOARD: Board = {
  title: 'テスト板',
  url: 'https://test.5ch.io/board/',
  bbsId: 'board',
  serverUrl: 'https://test.5ch.io/',
  boardType: BoardType.Type2ch,
};

let tmpDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tmpDir = await mkdtemp(join(tmpdir(), 'vbbb-subject-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('parseSubjectLine', () => {
  it('parses standard <> format with (N) count', () => {
    const result = parseSubjectLine('1234567890.dat<>テストスレッド (123)');
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe('1234567890.dat');
    expect(result?.title).toBe('テストスレッド');
    expect(result?.count).toBe(123);
  });

  it('parses full-width parentheses count （N）', () => {
    const result = parseSubjectLine('1234567890.dat<>スレッドタイトル（456）');
    expect(result).not.toBeNull();
    expect(result?.title).toBe('スレッドタイトル');
    expect(result?.count).toBe(456);
  });

  it('parses angle bracket count <N>', () => {
    const result = parseSubjectLine('1234567890.dat<>Another Thread <789>');
    expect(result).not.toBeNull();
    expect(result?.title).toBe('Another Thread');
    expect(result?.count).toBe(789);
  });

  it('parses old comma-separated format', () => {
    const result = parseSubjectLine('1234567890.dat,Old Style Thread (42)');
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe('1234567890.dat');
    expect(result?.title).toBe('Old Style Thread');
    expect(result?.count).toBe(42);
  });

  it('returns null for empty lines', () => {
    expect(parseSubjectLine('')).toBeNull();
    expect(parseSubjectLine('   ')).toBeNull();
  });

  it('returns null for lines without .dat', () => {
    expect(parseSubjectLine('invalid<>test (1)')).toBeNull();
  });

  it('handles zero count', () => {
    const result = parseSubjectLine('1234567890.dat<>Empty Thread (0)');
    expect(result).not.toBeNull();
    expect(result?.count).toBe(0);
  });

  it('normalizes .cgi filename to .dat', () => {
    const result = parseSubjectLine('1182428917.cgi,東京23区スレ (999)');
    expect(result).not.toBeNull();
    expect(result?.fileName).toBe('1182428917.dat');
    expect(result?.title).toBe('東京23区スレ');
    expect(result?.count).toBe(999);
  });
});

describe('parseSubjectTxt', () => {
  it('parses multiple lines', () => {
    const content = [
      '1111111111.dat<>Thread A (10)',
      '2222222222.dat<>Thread B (20)',
      '',
      '3333333333.dat<>Thread C (30)',
    ].join('\n');

    const results = parseSubjectTxt(content);
    expect(results).toHaveLength(3);
    expect(results[0]?.title).toBe('Thread A');
    expect(results[1]?.count).toBe(20);
    expect(results[2]?.fileName).toBe('3333333333.dat');
  });
});

describe('determineAgeSage', () => {
  const makeIndex = (no: number, fileName: string, count: number): ThreadIndex => ({
    no,
    fileName,
    title: 'test',
    count,
    size: 0,
    roundDate: null,
    lastModified: null,
    kokomade: -1,
    newReceive: 0,
    unRead: false,
    scrollTop: 0,
    scrollResNumber: 0,
    scrollResOffset: 0,
    allResCount: count,
    newResCount: 0,
    ageSage: AgeSage.None,
  });

  it('marks unknown threads as New', () => {
    const subjects = [{ fileName: '111.dat', title: 'A', count: 10 }];
    const existing: ThreadIndex[] = [];
    const result = determineAgeSage(subjects, existing);
    expect(result.get('111.dat')).toBe(AgeSage.New);
  });

  it('marks threads that moved up as Age', () => {
    const subjects = [
      { fileName: '111.dat', title: 'A', count: 11 },
      { fileName: '222.dat', title: 'B', count: 20 },
    ];
    const existing = [
      makeIndex(2, '111.dat', 10), // was at position 2, now at 1 -> Age
      makeIndex(1, '222.dat', 20), // was at position 1, now at 2
    ];
    const result = determineAgeSage(subjects, existing);
    expect(result.get('111.dat')).toBe(AgeSage.Age);
  });

  it('marks threads with more posts but same/lower rank as Sage', () => {
    const subjects = [
      { fileName: '111.dat', title: 'A', count: 10 },
      { fileName: '222.dat', title: 'B', count: 25 }, // count increased
    ];
    const existing = [
      makeIndex(1, '111.dat', 10),
      makeIndex(2, '222.dat', 20), // count was 20, now 25, but rank same
    ];
    const result = determineAgeSage(subjects, existing);
    expect(result.get('222.dat')).toBe(AgeSage.Sage);
  });

  it('marks threads not in new list as Archive', () => {
    const subjects = [{ fileName: '111.dat', title: 'A', count: 10 }];
    const existing = [makeIndex(1, '111.dat', 10), makeIndex(2, '222.dat', 20)];
    const result = determineAgeSage(subjects, existing);
    expect(result.get('222.dat')).toBe(AgeSage.Archive);
  });
});

describe('Folder.idx serialization', () => {
  it('round-trips through serialize/parse', () => {
    const indices: ThreadIndex[] = [
      {
        no: 1,
        fileName: '1689062903.dat',
        title: 'Test Thread',
        count: 100,
        size: 2560,
        roundDate: null,
        lastModified: null,
        kokomade: -1,
        newReceive: 0,
        unRead: false,
        scrollTop: 0,
        scrollResNumber: 0,
        scrollResOffset: 0,
        allResCount: 100,
        newResCount: 0,
        ageSage: AgeSage.None,
      },
    ];

    const serialized = serializeFolderIdx(indices);
    expect(serialized.startsWith(FOLDER_IDX_VERSION)).toBe(true);

    const parsed = parseFolderIdx(serialized);
    expect(parsed).toHaveLength(1);
    const first = parsed[0]!;
    expect(first.fileName).toBe('1689062903.dat');
    expect(first.title).toBe('Test Thread');
    expect(first.count).toBe(100);
    expect(first.size).toBe(2560);
    expect(first.kokomade).toBe(-1);
    expect(first.ageSage).toBe(AgeSage.None);
  });
});

describe('buildUpdatedIndex', () => {
  const makeIdx = (no: number, fileName: string, count: number): ThreadIndex => ({
    no,
    fileName,
    title: 'title',
    count,
    size: 0,
    roundDate: null,
    lastModified: null,
    kokomade: KOKOMADE_UNSET,
    newReceive: 0,
    unRead: false,
    scrollTop: 0,
    scrollResNumber: 0,
    scrollResOffset: 0,
    allResCount: count,
    newResCount: 0,
    ageSage: AgeSage.None,
  });

  it('creates new entries for unknown threads', () => {
    const subjects = [{ fileName: '111.dat', title: 'New Thread', count: 10 }];
    const ageSageMap = new Map([['111.dat', AgeSage.New]]);
    const result = buildUpdatedIndex(subjects, [], ageSageMap);

    expect(result).toHaveLength(1);
    expect(result[0]?.fileName).toBe('111.dat');
    expect(result[0]?.no).toBe(1);
    expect(result[0]?.allResCount).toBe(10);
    expect(result[0]?.unRead).toBe(true);
    expect(result[0]?.ageSage).toBe(AgeSage.New);
  });

  it('updates existing thread entries', () => {
    const existing = [makeIdx(1, '111.dat', 50)];
    const subjects = [{ fileName: '111.dat', title: 'Updated Thread', count: 60 }];
    const ageSageMap = new Map([['111.dat', AgeSage.Sage]]);
    const result = buildUpdatedIndex(subjects, existing, ageSageMap);

    expect(result).toHaveLength(1);
    expect(result[0]?.allResCount).toBe(60);
    expect(result[0]?.newResCount).toBe(10); // 60 - 50
    expect(result[0]?.ageSage).toBe(AgeSage.Sage);
    expect(result[0]?.title).toBe('Updated Thread');
  });

  it('appends archived threads at the end', () => {
    const existing = [makeIdx(1, '111.dat', 50), makeIdx(2, '222.dat', 30)];
    // Only 111 is in new subject; 222 is archived
    const subjects = [{ fileName: '111.dat', title: 'Active', count: 50 }];
    const ageSageMap = new Map<string, AgeSage>([
      ['111.dat', AgeSage.None],
      ['222.dat', AgeSage.Archive],
    ]);
    const result = buildUpdatedIndex(subjects, existing, ageSageMap);

    expect(result).toHaveLength(2);
    expect(result[0]?.fileName).toBe('111.dat');
    expect(result[1]?.fileName).toBe('222.dat');
    expect(result[1]?.ageSage).toBe(AgeSage.Archive);
  });

  it('assigns sequential no values', () => {
    const subjects = [
      { fileName: 'a.dat', title: 'A', count: 10 },
      { fileName: 'b.dat', title: 'B', count: 20 },
      { fileName: 'c.dat', title: 'C', count: 30 },
    ];
    const ageSageMap = new Map<string, AgeSage>([
      ['a.dat', AgeSage.New],
      ['b.dat', AgeSage.New],
      ['c.dat', AgeSage.New],
    ]);
    const result = buildUpdatedIndex(subjects, [], ageSageMap);

    expect(result[0]?.no).toBe(1);
    expect(result[1]?.no).toBe(2);
    expect(result[2]?.no).toBe(3);
  });
});

describe('fetchSubject', () => {
  it('returns threads on HTTP 200', async () => {
    // ASCII-only subject.txt (Shift_JIS == UTF-8 for ASCII range)
    const content = '1111111111.dat<>Thread A (10)\n2222222222.dat<>Thread B (20)\n';
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({ status: 200, body: Buffer.from(content, 'ascii') }),
    );

    const result = await fetchSubject(TEST_BOARD, tmpDir);
    expect(result.notModified).toBe(false);
    expect(result.threads).toHaveLength(2);
    expect(result.threads[0]?.title).toBe('Thread A');
    expect(result.threads[1]?.count).toBe(20);
  });

  it('returns notModified=true on HTTP 304 with cache', async () => {
    // First fetch to populate cache
    const content = '1111111111.dat<>Cached Thread (5)\n';
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({ status: 200, body: Buffer.from(content, 'ascii') }),
    );
    await fetchSubject(TEST_BOARD, tmpDir);

    // Second fetch returns 304
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 304, body: Buffer.from('') }));
    const result = await fetchSubject(TEST_BOARD, tmpDir);

    expect(result.notModified).toBe(true);
    expect(result.threads).toHaveLength(1);
    expect(result.threads[0]?.title).toBe('Cached Thread');
  });

  it('throws on non-200/304 HTTP status', async () => {
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 503, body: Buffer.from('') }));

    await expect(fetchSubject(TEST_BOARD, tmpDir)).rejects.toThrow('503');
  });

  it('sends If-Modified-Since on second fetch', async () => {
    // First fetch
    const content = '1111111111.dat<>Thread (1)\n';
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        body: Buffer.from(content, 'ascii'),
        lastModified: 'Fri, 01 Jan 2021 00:00:00 GMT',
      }),
    );
    await fetchSubject(TEST_BOARD, tmpDir);

    // Second fetch
    mockHttpFetch.mockResolvedValueOnce(makeResponse({ status: 304, body: Buffer.from('') }));
    await fetchSubject(TEST_BOARD, tmpDir);

    const secondCall = mockHttpFetch.mock.calls[1]?.[0];
    expect(secondCall?.ifModifiedSince).toBe('Fri, 01 Jan 2021 00:00:00 GMT');
  });
});
