import { describe, it, expect } from 'vitest';
import { parseJBBSDatLine, parseJBBSDat } from '../../src/main/services/plugins/jbbs-dat';

describe('parseJBBSDatLine', () => {
  it('parses a standard 7-field JBBS DAT line', () => {
    const line =
      '1<>名無しさん<>sage<>2024/01/15(月) 12:34:56<>本文テスト<>スレッドタイトル<>ABC123';
    const res = parseJBBSDatLine(line);

    expect(res).not.toBeNull();
    expect(res?.number).toBe(1);
    expect(res?.name).toBe('名無しさん');
    expect(res?.mail).toBe('sage');
    expect(res?.dateTime).toBe('2024/01/15(月) 12:34:56');
    expect(res?.body).toBe('本文テスト');
    expect(res?.title).toBe('スレッドタイトル');
    expect(res?.id).toBe('ABC123');
  });

  it('parses a line without ID field', () => {
    const line = '1<>名無し<>sage<>2024/01/15<>本文<>タイトル<>';
    const res = parseJBBSDatLine(line);

    expect(res).not.toBeNull();
    expect(res?.number).toBe(1);
    expect(res?.id).toBeUndefined();
  });

  it('parses a line with only 5 fields (minimal)', () => {
    const line = '3<>名前<>メール<>日時<>本文';
    const res = parseJBBSDatLine(line);

    expect(res).not.toBeNull();
    expect(res?.number).toBe(3);
    expect(res?.name).toBe('名前');
    expect(res?.body).toBe('本文');
    expect(res?.title).toBe('');
  });

  it('returns null for empty line', () => {
    expect(parseJBBSDatLine('')).toBeNull();
    expect(parseJBBSDatLine('  ')).toBeNull();
  });

  it('returns null for invalid res number', () => {
    expect(parseJBBSDatLine('abc<>名前<>sage<>日時<>本文')).toBeNull();
    expect(parseJBBSDatLine('0<>名前<>sage<>日時<>本文')).toBeNull();
    expect(parseJBBSDatLine('-1<>名前<>sage<>日時<>本文')).toBeNull();
  });

  it('returns null for too few fields', () => {
    expect(parseJBBSDatLine('1<>名前<>sage<>日時')).toBeNull();
  });

  it('handles empty body with &nbsp;', () => {
    const line = '5<>名前<>sage<>日時<>  <>';
    const res = parseJBBSDatLine(line);
    expect(res?.body).toBe('&nbsp;');
  });
});

describe('parseJBBSDat', () => {
  it('parses multiple lines', () => {
    const content = [
      '1<>名前1<>sage<>日時1<>本文1<>スレタイ<>ID1',
      '2<>名前2<><>日時2<>本文2<><>ID2',
      '5<>名前5<>sage<>日時5<>本文5<><>ID5',
    ].join('\n');

    const responses = parseJBBSDat(content);
    expect(responses).toHaveLength(3);
    expect(responses[0]?.number).toBe(1);
    expect(responses[1]?.number).toBe(2);
    expect(responses[2]?.number).toBe(5); // Gap at 3, 4 (abon)
  });

  it('handles empty content', () => {
    expect(parseJBBSDat('')).toHaveLength(0);
  });

  it('skips invalid lines', () => {
    const content = [
      '1<>名前<>sage<>日時<>本文<>タイトル<>ID',
      '', // empty
      'invalid line',
      '3<>名前<>sage<>日時<>本文<><>ID',
    ].join('\n');

    const responses = parseJBBSDat(content);
    expect(responses).toHaveLength(2);
    expect(responses[0]?.number).toBe(1);
    expect(responses[1]?.number).toBe(3);
  });

  it('preserves gaps in res numbers (abon handling)', () => {
    const content = [
      '1<>A<>sage<>2024/01/01<>First<>Title<>',
      '3<>B<>sage<>2024/01/01<>Third<><>',
      '10<>C<>sage<>2024/01/01<>Tenth<><>',
    ].join('\n');

    const responses = parseJBBSDat(content);
    expect(responses).toHaveLength(3);
    expect(responses.map((r) => r.number)).toStrictEqual([1, 3, 10]);
  });
});
