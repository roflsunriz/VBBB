import { describe, it, expect } from 'vitest';
import type { Board } from '../../src/types/domain';
import { detectTransfers } from '../../src/main/services/board-transfer';

function makeBoard(url: string, bbsId: string): Board {
  return {
    title: bbsId,
    url,
    bbsId,
    serverUrl: new URL(url).origin + '/',
    boardType: '2ch',
  };
}

describe('detectTransfers', () => {
  it('detects host change with same path as a transfer', () => {
    const oldBoards = [
      makeBoard('https://old.5ch.net/newsplus/', 'newsplus'),
    ];
    const newBoards = [
      makeBoard('https://new.5ch.net/newsplus/', 'newsplus'),
    ];
    const transfers = detectTransfers(oldBoards, newBoards);
    expect(transfers.size).toBe(1);
    expect(transfers.get('https://old.5ch.net/newsplus/')).toBe('https://new.5ch.net/newsplus/');
  });

  it('does not detect transfer when URL is unchanged', () => {
    const boards = [makeBoard('https://same.5ch.net/board/', 'board')];
    const transfers = detectTransfers(boards, boards);
    expect(transfers.size).toBe(0);
  });

  it('handles new boards gracefully', () => {
    const oldBoards = [makeBoard('https://a.5ch.net/aa/', 'aa')];
    const newBoards = [
      makeBoard('https://a.5ch.net/aa/', 'aa'),
      makeBoard('https://b.5ch.net/bb/', 'bb'),
    ];
    const transfers = detectTransfers(oldBoards, newBoards);
    expect(transfers.size).toBe(0);
  });

  it('detects multiple transfers', () => {
    const oldBoards = [
      makeBoard('https://old1.5ch.net/a/', 'a'),
      makeBoard('https://old2.5ch.net/b/', 'b'),
    ];
    const newBoards = [
      makeBoard('https://new1.5ch.net/a/', 'a'),
      makeBoard('https://new2.5ch.net/b/', 'b'),
    ];
    const transfers = detectTransfers(oldBoards, newBoards);
    expect(transfers.size).toBe(2);
  });
});
