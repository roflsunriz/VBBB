/**
 * DAT parsing tests.
 * Covers 5-field format, missing fields, CRLF/LF, old comma format.
 */
import { describe, it, expect } from 'vitest';
import { parseDatLine, parseDat } from '../../src/main/services/dat';

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
