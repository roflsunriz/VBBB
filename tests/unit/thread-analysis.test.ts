import { describe, expect, it } from 'vitest';
import type { Res } from '../../src/types/domain';
import { extractWatchoi } from '../../src/renderer/utils/thread-analysis';

const makeRes = (name: string): Res => ({
  number: 1,
  name,
  mail: '',
  dateTime: '2026/02/27(金) 12:34:56 ID:AbCdEfGh',
  body: 'test',
  title: '',
});

describe('extractWatchoi', () => {
  it('extracts watchoi without trailing close parenthesis', () => {
    const info = extractWatchoi(makeRes('名無しさん (ﾜｯﾁｮｲ ABCD-EFGH)'));
    expect(info).not.toBeNull();
    expect(info?.label).toBe('ﾜｯﾁｮｲ ABCD-EFGH');
    expect(info?.prefix).toBe('ﾜｯﾁｮｲ');
    expect(info?.ipHash).toBe('ABCD');
    expect(info?.uaHash).toBe('EFGH');
  });

  it('extracts watchoi from complex name with donguri and IP', () => {
    const info = extractWatchoi(
      makeRes('名無しさん 警備員[Lv.0][新芽] ﾜｯﾁｮｲ A+/1-bC9/ [2400:4153:2b21:e400:*]'),
    );
    expect(info).not.toBeNull();
    expect(info?.label).toBe('ﾜｯﾁｮｲ A+/1-bC9/ [2400:4153:2b21:e400:*]');
    expect(info?.prefix).toBe('ﾜｯﾁｮｲ');
    expect(info?.ipHash).toBe('A+/1');
    expect(info?.uaHash).toBe('bC9/');
  });

  it('supports name with watchoi only (no IP)', () => {
    const info = extractWatchoi(makeRes('名無しさん ﾜｯﾁｮｲ Zz9+-/AbC'));
    expect(info).not.toBeNull();
    expect(info?.label).toBe('ﾜｯﾁｮｲ Zz9+-/AbC');
  });
});
