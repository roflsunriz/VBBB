/**
 * Tests for URL parsing utilities.
 * Covers: parseThreadUrl (feature 11: webview thread link)
 *         parseExternalBoardUrl (feature 10: add board dialog)
 */
import { describe, it, expect } from 'vitest';
import {
  parseThreadUrl,
  parseExternalBoardUrl,
  parseAnyThreadUrl,
  buildResPermalink,
} from '../../src/types/url-parser';
import { BoardType } from '../../src/types/domain';

// ---------------------------------------------------------------------------
// parseThreadUrl – 5ch thread URL parsing (feature 11)
// ---------------------------------------------------------------------------
describe('parseThreadUrl', () => {
  it('parses a standard 5ch thread URL', () => {
    const result = parseThreadUrl('https://eagle.5ch.net/test/read.cgi/livejupiter/1234567890/');
    expect(result).not.toBeNull();
    expect(result?.boardUrl).toBe('https://eagle.5ch.net/livejupiter/');
    expect(result?.threadId).toBe('1234567890');
    expect(result?.title).toBe('livejupiter/1234567890');
  });

  it('parses a URL with trailing range specifier (l50)', () => {
    const result = parseThreadUrl('https://hayabusa9.5ch.net/test/read.cgi/news/9876543210/l50');
    expect(result).not.toBeNull();
    expect(result?.boardUrl).toBe('https://hayabusa9.5ch.net/news/');
    expect(result?.threadId).toBe('9876543210');
  });

  it('parses a URL without trailing slash', () => {
    const result = parseThreadUrl('https://mi.5ch.net/test/read.cgi/news4vip/1111111111');
    expect(result).not.toBeNull();
    expect(result?.boardUrl).toBe('https://mi.5ch.net/news4vip/');
    expect(result?.threadId).toBe('1111111111');
  });

  it('returns null for a non-thread URL', () => {
    expect(parseThreadUrl('https://www.google.com/')).toBeNull();
  });

  it('returns null for a board-only URL', () => {
    expect(parseThreadUrl('https://eagle.5ch.net/livejupiter/')).toBeNull();
  });

  it('returns null for an invalid URL', () => {
    expect(parseThreadUrl('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseThreadUrl('')).toBeNull();
  });

  it('handles http (non-https) URLs', () => {
    const result = parseThreadUrl('http://old.2ch.net/test/read.cgi/board/1234567890/');
    expect(result).not.toBeNull();
    expect(result?.boardUrl).toBe('http://old.2ch.net/board/');
  });

  it('returns null for URL with missing threadId', () => {
    expect(parseThreadUrl('https://eagle.5ch.net/test/read.cgi/board/')).toBeNull();
  });

  it('returns null for URL with non-numeric threadId', () => {
    expect(parseThreadUrl('https://eagle.5ch.net/test/read.cgi/board/abc/')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseExternalBoardUrl – Shitaraba/JBBS/Machi URL parsing (feature 10)
// ---------------------------------------------------------------------------
describe('parseExternalBoardUrl', () => {
  // Shitaraba board
  it('parses a Shitaraba board URL', () => {
    const result = parseExternalBoardUrl('https://jbbs.shitaraba.jp/game/12345/');
    expect(result).not.toBeNull();
    expect(result?.board.boardType).toBe(BoardType.Shitaraba);
    expect(result?.board.bbsId).toBe('12345');
    expect(result?.board.jbbsDir).toBe('game');
    expect(result?.board.url).toBe('https://jbbs.shitaraba.jp/game/12345/');
    expect(result?.threadId).toBeUndefined();
  });

  // Shitaraba thread
  it('parses a Shitaraba thread URL', () => {
    const result = parseExternalBoardUrl(
      'https://jbbs.shitaraba.jp/bbs/read.cgi/game/12345/1234567890/',
    );
    expect(result).not.toBeNull();
    expect(result?.board.boardType).toBe(BoardType.Shitaraba);
    expect(result?.board.bbsId).toBe('12345');
    expect(result?.board.jbbsDir).toBe('game');
    expect(result?.threadId).toBe('1234567890');
  });

  // JBBS board (livedoor)
  it('parses a JBBS (livedoor) board URL', () => {
    const result = parseExternalBoardUrl('https://jbbs.livedoor.jp/computer/99999/');
    expect(result).not.toBeNull();
    expect(result?.board.boardType).toBe(BoardType.JBBS);
    expect(result?.board.bbsId).toBe('99999');
    expect(result?.board.jbbsDir).toBe('computer');
    expect(result?.threadId).toBeUndefined();
  });

  // JBBS thread (livedoor)
  it('parses a JBBS (livedoor) thread URL', () => {
    const result = parseExternalBoardUrl(
      'https://jbbs.livedoor.jp/bbs/read.cgi/computer/99999/1111111111/',
    );
    expect(result).not.toBeNull();
    expect(result?.board.boardType).toBe(BoardType.JBBS);
    expect(result?.threadId).toBe('1111111111');
  });

  // Machi board
  it('parses a Machi BBS board URL', () => {
    const result = parseExternalBoardUrl('https://machi.to/hokkaidou/');
    expect(result).not.toBeNull();
    expect(result?.board.boardType).toBe(BoardType.MachiBBS);
    expect(result?.board.bbsId).toBe('hokkaidou');
    expect(result?.board.url).toBe('https://machi.to/hokkaidou/');
    expect(result?.threadId).toBeUndefined();
  });

  // Machi thread
  it('parses a Machi BBS thread URL', () => {
    const result = parseExternalBoardUrl('https://machi.to/bbs/read.cgi/hokkaidou/1234567890/');
    expect(result).not.toBeNull();
    expect(result?.board.boardType).toBe(BoardType.MachiBBS);
    expect(result?.board.bbsId).toBe('hokkaidou');
    expect(result?.threadId).toBe('1234567890');
  });

  it('parses a Shitaraba dat URL as thread', () => {
    const result = parseExternalBoardUrl('https://jbbs.shitaraba.jp/game/12345/dat/1234567890.dat');
    expect(result).not.toBeNull();
    expect(result?.board.boardType).toBe(BoardType.Shitaraba);
    expect(result?.board.bbsId).toBe('12345');
    expect(result?.threadId).toBe('1234567890');
  });

  it('parses a Machi dat URL as thread', () => {
    const result = parseExternalBoardUrl('https://machi.to/tokyo/dat/1182428917.dat');
    expect(result).not.toBeNull();
    expect(result?.board.boardType).toBe(BoardType.MachiBBS);
    expect(result?.board.bbsId).toBe('tokyo');
    expect(result?.threadId).toBe('1182428917');
  });

  // Error cases
  it('returns null for unsupported URL', () => {
    expect(parseExternalBoardUrl('https://www.google.com/')).toBeNull();
  });

  it('returns null for invalid URL', () => {
    expect(parseExternalBoardUrl('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseExternalBoardUrl('')).toBeNull();
  });

  it('returns null for 5ch URL (not external)', () => {
    expect(parseExternalBoardUrl('https://eagle.5ch.net/livejupiter/')).toBeNull();
  });

  // Edge cases
  it('trims whitespace from input', () => {
    const result = parseExternalBoardUrl('  https://jbbs.shitaraba.jp/game/12345/  ');
    expect(result).not.toBeNull();
    expect(result?.board.bbsId).toBe('12345');
  });

  it('handles Shitaraba with single path segment as null', () => {
    const result = parseExternalBoardUrl('https://jbbs.shitaraba.jp/game/');
    // Only "game" - needs at least 2 segments (dir/boardId)
    // "game" is segment[0], but segment[1] is undefined
    // pathSegments = ['game'] -> length < 2 -> null
    expect(result).toBeNull();
  });
});

describe('parseAnyThreadUrl', () => {
  it('parses 5ch read.cgi thread URL', () => {
    const result = parseAnyThreadUrl('https://eagle.5ch.net/test/read.cgi/livejupiter/1234567890/');
    expect(result).not.toBeNull();
    expect(result?.board.url).toBe('https://eagle.5ch.net/livejupiter/');
    expect(result?.board.boardType).toBe(BoardType.Type2ch);
    expect(result?.threadId).toBe('1234567890');
    expect(result?.titleHint).toBe('');
  });

  it('parses Shitaraba read.cgi thread URL', () => {
    const result = parseAnyThreadUrl(
      'https://jbbs.shitaraba.jp/bbs/read.cgi/game/12345/1234567890/',
    );
    expect(result).not.toBeNull();
    expect(result?.board.url).toBe('https://jbbs.shitaraba.jp/game/12345/');
    expect(result?.board.boardType).toBe(BoardType.Shitaraba);
    expect(result?.threadId).toBe('1234567890');
  });

  it('parses Machi read.cgi thread URL', () => {
    const result = parseAnyThreadUrl('https://machi.to/bbs/read.cgi/tokyo/1182428917/');
    expect(result).not.toBeNull();
    expect(result?.board.url).toBe('https://machi.to/tokyo/');
    expect(result?.board.boardType).toBe(BoardType.MachiBBS);
    expect(result?.threadId).toBe('1182428917');
  });

  it('parses dat URL', () => {
    const result = parseAnyThreadUrl('https://machi.to/tokyo/dat/1182428917.dat');
    expect(result).not.toBeNull();
    expect(result?.board.url).toBe('https://machi.to/tokyo/');
    expect(result?.board.boardType).toBe(BoardType.MachiBBS);
    expect(result?.threadId).toBe('1182428917');
  });

  it('returns null for board URL without thread', () => {
    expect(parseAnyThreadUrl('https://machi.to/tokyo/')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildResPermalink – Permalink URL generation for response copy
// ---------------------------------------------------------------------------
describe('buildResPermalink', () => {
  it('builds 5ch permalink', () => {
    expect(buildResPermalink('https://hayabusa9.5ch.net/news/', '1234567890', 123)).toBe(
      'https://hayabusa9.5ch.net/test/read.cgi/news/1234567890/123',
    );
  });

  it('builds 5ch permalink for another board', () => {
    expect(buildResPermalink('https://eagle.5ch.net/livejupiter/', '9876543210', 1)).toBe(
      'https://eagle.5ch.net/test/read.cgi/livejupiter/9876543210/1',
    );
  });

  it('builds bbspink permalink (same format as 5ch)', () => {
    expect(buildResPermalink('https://mercury.bbspink.com/test/', '1111111111', 50)).toBe(
      'https://mercury.bbspink.com/test/read.cgi/test/1111111111/50',
    );
  });

  it('builds Shitaraba permalink', () => {
    expect(buildResPermalink('https://jbbs.shitaraba.jp/game/12345/', '1234567890', 10)).toBe(
      'https://jbbs.shitaraba.jp/bbs/read.cgi/game/12345/1234567890/10',
    );
  });

  it('builds JBBS (livedoor) permalink', () => {
    expect(buildResPermalink('https://jbbs.livedoor.jp/computer/99999/', '1111111111', 5)).toBe(
      'https://jbbs.livedoor.jp/bbs/read.cgi/computer/99999/1111111111/5',
    );
  });

  it('builds Machi BBS permalink', () => {
    expect(buildResPermalink('https://machi.to/hokkaidou/', '1234567890', 42)).toBe(
      'https://machi.to/bbs/read.cgi/hokkaidou/1234567890/42',
    );
  });

  it('returns empty string for invalid URL', () => {
    expect(buildResPermalink('not-a-url', '123', 1)).toBe('');
  });

  it('returns empty string for empty board URL', () => {
    expect(buildResPermalink('', '123', 1)).toBe('');
  });

  it('handles http (non-https) URLs', () => {
    expect(buildResPermalink('http://old.2ch.net/board/', '1234567890', 99)).toBe(
      'http://old.2ch.net/test/read.cgi/board/1234567890/99',
    );
  });

  it('roundtrip: parse then build produces consistent URL', () => {
    const parsed = parseAnyThreadUrl('https://hayabusa9.5ch.net/test/read.cgi/news/1234567890/');
    expect(parsed).not.toBeNull();
    if (parsed !== null) {
      const permalink = buildResPermalink(parsed.board.url, parsed.threadId, 42);
      expect(permalink).toBe('https://hayabusa9.5ch.net/test/read.cgi/news/1234567890/42');
    }
  });

  it('roundtrip: Shitaraba parse then build', () => {
    const parsed = parseAnyThreadUrl(
      'https://jbbs.shitaraba.jp/bbs/read.cgi/game/12345/1234567890/',
    );
    expect(parsed).not.toBeNull();
    if (parsed !== null) {
      const permalink = buildResPermalink(parsed.board.url, parsed.threadId, 7);
      expect(permalink).toBe('https://jbbs.shitaraba.jp/bbs/read.cgi/game/12345/1234567890/7');
    }
  });

  it('roundtrip: Machi BBS parse then build', () => {
    const parsed = parseAnyThreadUrl('https://machi.to/bbs/read.cgi/tokyo/1182428917/');
    expect(parsed).not.toBeNull();
    if (parsed !== null) {
      const permalink = buildResPermalink(parsed.board.url, parsed.threadId, 15);
      expect(permalink).toBe('https://machi.to/bbs/read.cgi/tokyo/1182428917/15');
    }
  });
});
