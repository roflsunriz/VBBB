import { describe, it, expect } from 'vitest';
import {
  parseRoundBoard, serializeRoundBoard,
  parseRoundItem, serializeRoundItem,
} from '../../src/main/services/round-list';

describe('parseRoundBoard', () => {
  it('parses board entries with version line', () => {
    const content = '2.00\nhttps://news.5ch.net/newsplus/#1ニュース速報+#1ニュース巡回';
    const entries = parseRoundBoard(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe('https://news.5ch.net/newsplus/');
    expect(entries[0]?.boardTitle).toBe('ニュース速報+');
    expect(entries[0]?.roundName).toBe('ニュース巡回');
  });

  it('handles multiple entries', () => {
    const content = '2.00\nhttps://a.com/#1Board A#1Round A\nhttps://b.com/#1Board B#1Round B';
    const entries = parseRoundBoard(content);
    expect(entries).toHaveLength(2);
  });

  it('skips empty lines', () => {
    const content = '2.00\n\nhttps://a.com/#1Board#1Round\n';
    const entries = parseRoundBoard(content);
    expect(entries).toHaveLength(1);
  });
});

describe('serializeRoundBoard', () => {
  it('serializes with version header', () => {
    const entries = [{ url: 'https://a.com/', boardTitle: 'Board A', roundName: 'Round' }];
    const result = serializeRoundBoard(entries);
    expect(result).toBe('2.00\nhttps://a.com/#1Board A#1Round');
  });

  it('round-trips correctly', () => {
    const original = [
      { url: 'https://a.com/', boardTitle: 'A', roundName: 'R1' },
      { url: 'https://b.com/', boardTitle: 'B', roundName: 'R2' },
    ];
    const serialized = serializeRoundBoard(original);
    const parsed = parseRoundBoard(serialized);
    expect(parsed).toStrictEqual(original);
  });
});

describe('parseRoundItem', () => {
  it('parses item entries', () => {
    const content = '2.00\nhttps://news.5ch.net/newsplus/#1ニュース速報+#11234567890.dat#1Test Thread#1ニュース巡回';
    const entries = parseRoundItem(content);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe('https://news.5ch.net/newsplus/');
    expect(entries[0]?.fileName).toBe('1234567890.dat');
    expect(entries[0]?.threadTitle).toBe('Test Thread');
  });
});

describe('serializeRoundItem', () => {
  it('round-trips correctly', () => {
    const original = [{
      url: 'https://a.com/',
      boardTitle: 'A',
      fileName: '123.dat',
      threadTitle: 'Thread',
      roundName: 'R',
    }];
    const serialized = serializeRoundItem(original);
    const parsed = parseRoundItem(serialized);
    expect(parsed).toStrictEqual(original);
  });
});
