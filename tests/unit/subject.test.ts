/**
 * subject.txt parsing tests.
 * Covers <> format, comma format, count bracket variations, Age/Sage/New/Archive.
 */
import { describe, it, expect } from 'vitest';
import { parseSubjectLine, parseSubjectTxt, determineAgeSage, parseFolderIdx, serializeFolderIdx } from '../../src/main/services/subject';
import { AgeSage, type ThreadIndex } from '../../src/types/domain';
import { FOLDER_IDX_VERSION } from '../../src/types/file-format';

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
      makeIndex(2, '111.dat', 10),  // was at position 2, now at 1 -> Age
      makeIndex(1, '222.dat', 20),  // was at position 1, now at 2
    ];
    const result = determineAgeSage(subjects, existing);
    expect(result.get('111.dat')).toBe(AgeSage.Age);
  });

  it('marks threads with more posts but same/lower rank as Sage', () => {
    const subjects = [
      { fileName: '111.dat', title: 'A', count: 10 },
      { fileName: '222.dat', title: 'B', count: 25 },  // count increased
    ];
    const existing = [
      makeIndex(1, '111.dat', 10),
      makeIndex(2, '222.dat', 20),  // count was 20, now 25, but rank same
    ];
    const result = determineAgeSage(subjects, existing);
    expect(result.get('222.dat')).toBe(AgeSage.Sage);
  });

  it('marks threads not in new list as Archive', () => {
    const subjects = [{ fileName: '111.dat', title: 'A', count: 10 }];
    const existing = [
      makeIndex(1, '111.dat', 10),
      makeIndex(2, '222.dat', 20),
    ];
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
