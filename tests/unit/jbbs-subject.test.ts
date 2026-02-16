import { describe, it, expect } from 'vitest';
import { parseJBBSSubjectLine, parseJBBSSubjectTxt } from '../../src/main/services/plugins/jbbs-subject';

describe('parseJBBSSubjectLine', () => {
  it('parses a standard JBBS subject line with .cgi extension', () => {
    const line = '1234567890.cgi,テストスレッド(42)';
    const record = parseJBBSSubjectLine(line);

    expect(record).not.toBeNull();
    expect(record?.fileName).toBe('1234567890.dat');
    expect(record?.title).toBe('テストスレッド');
    expect(record?.count).toBe(42);
  });

  it('parses a line with .dat extension', () => {
    const line = '1234567890.dat,テストスレッド(10)';
    const record = parseJBBSSubjectLine(line);

    expect(record).not.toBeNull();
    expect(record?.fileName).toBe('1234567890.dat');
    expect(record?.title).toBe('テストスレッド');
    expect(record?.count).toBe(10);
  });

  it('parses full-width count parentheses', () => {
    const line = '1234567890.cgi,テスト\uFF0855\uFF09';
    const record = parseJBBSSubjectLine(line);

    expect(record).not.toBeNull();
    expect(record?.count).toBe(55);
    expect(record?.title).toBe('テスト');
  });

  it('returns null for empty line', () => {
    expect(parseJBBSSubjectLine('')).toBeNull();
    expect(parseJBBSSubjectLine('  ')).toBeNull();
  });

  it('returns null for line without comma', () => {
    expect(parseJBBSSubjectLine('1234567890.cgi')).toBeNull();
  });

  it('returns null for line with invalid extension', () => {
    expect(parseJBBSSubjectLine('1234567890.txt,Title(5)')).toBeNull();
  });

  it('handles zero count', () => {
    const line = '1234567890.cgi,新スレ(0)';
    const record = parseJBBSSubjectLine(line);
    expect(record?.count).toBe(0);
  });

  it('handles title with commas', () => {
    const line = '1234567890.cgi,タイトル,サブタイトル(100)';
    const record = parseJBBSSubjectLine(line);
    expect(record?.title).toBe('タイトル,サブタイトル');
    expect(record?.count).toBe(100);
  });
});

describe('parseJBBSSubjectTxt', () => {
  it('parses multiple lines', () => {
    const content = [
      '1111111111.cgi,スレッド1(10)',
      '2222222222.cgi,スレッド2(20)',
      '3333333333.cgi,スレッド3(30)',
    ].join('\n');

    const records = parseJBBSSubjectTxt(content);
    expect(records).toHaveLength(3);
    expect(records[0]?.fileName).toBe('1111111111.dat');
    expect(records[2]?.count).toBe(30);
  });

  it('handles empty content', () => {
    expect(parseJBBSSubjectTxt('')).toHaveLength(0);
  });

  it('skips invalid lines', () => {
    const content = [
      '1111111111.cgi,Valid(10)',
      '',
      'invalid',
      '2222222222.cgi,Also Valid(20)',
    ].join('\n');

    const records = parseJBBSSubjectTxt(content);
    expect(records).toHaveLength(2);
  });
});
