import { describe, expect, it } from 'vitest';
import type { Res } from '../../src/types/domain';
import { extractIps } from '../../src/renderer/utils/ip-detect';

const makeRes = (overrides: Partial<Res> = {}): Res => ({
  number: 1,
  name: '名無しさん',
  mail: '',
  dateTime: '2026/01/08(木) 15:24:22 ID:PL3C9P7g',
  body: 'test',
  title: '',
  ...overrides,
});

describe('extractIps', () => {
  it('extracts machi offlaw IP identifier from id field', () => {
    expect(extractIps(makeRes({ id: '7742:4B8C:70C4:3B7E' }))).toContain('7742:4B8C:70C4:3B7E');
  });

  it('extracts 発信元 value from dateTime as IP', () => {
    expect(
      extractIps(makeRes({ dateTime: '2026/01/08(木) 15:24:22 発信元:240a:61:326c:1539:*' })),
    ).toContain('240a:61:326c:1539:*');
  });
});
