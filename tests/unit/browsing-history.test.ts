import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addHistoryEntry, clearBrowsingHistory, getBrowsingHistory } from '../../src/main/services/browsing-history';

beforeEach(() => {
  clearBrowsingHistory();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
});

describe('browsing history', () => {
  it('adds an entry to the history', () => {
    addHistoryEntry('https://board.example/', '1234', 'Test Thread');
    const history = getBrowsingHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.threadId).toBe('1234');
    expect(history[0]?.title).toBe('Test Thread');
    expect(history[0]?.lastVisited).toBe('2025-06-15T12:00:00.000Z');
  });

  it('moves duplicate entries to the front', () => {
    addHistoryEntry('https://board.example/', '111', 'First');
    vi.setSystemTime(new Date('2025-06-15T13:00:00Z'));
    addHistoryEntry('https://board.example/', '222', 'Second');
    vi.setSystemTime(new Date('2025-06-15T14:00:00Z'));
    addHistoryEntry('https://board.example/', '111', 'First Updated');

    const history = getBrowsingHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.threadId).toBe('111');
    expect(history[0]?.title).toBe('First Updated');
    expect(history[1]?.threadId).toBe('222');
  });

  it('respects max entry limit', () => {
    for (let i = 0; i < 250; i++) {
      addHistoryEntry('https://board.example/', String(i), `Thread ${String(i)}`);
    }
    const history = getBrowsingHistory();
    expect(history.length).toBeLessThanOrEqual(200);
    // Most recent should be at front
    expect(history[0]?.threadId).toBe('249');
  });

  it('clears all history', () => {
    addHistoryEntry('https://board.example/', '1', 'Test');
    clearBrowsingHistory();
    expect(getBrowsingHistory()).toHaveLength(0);
  });
});
