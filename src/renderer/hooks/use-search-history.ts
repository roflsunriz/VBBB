/**
 * Hook for persisting search input history to localStorage.
 * Deduplicates entries and keeps the most recent at the top.
 */
import { useState, useCallback } from 'react';

const MAX_HISTORY_ITEMS = 20;
const MIN_QUERY_LENGTH = 1;

export interface UseSearchHistoryResult {
  readonly history: readonly string[];
  readonly addToHistory: (query: string) => void;
  readonly removeFromHistory: (query: string) => void;
}

function loadHistory(storageKey: string): readonly string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return (parsed as unknown[]).filter((s): s is string => typeof s === 'string');
      }
    }
  } catch {
    // Fall through to empty array
  }
  return [];
}

export function useSearchHistory(storageKey: string): UseSearchHistoryResult {
  const [history, setHistory] = useState<readonly string[]>(() => loadHistory(storageKey));

  const addToHistory = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < MIN_QUERY_LENGTH) return;
      setHistory((prev) => {
        const filtered = prev.filter((s) => s !== trimmed);
        const next = [trimmed, ...filtered].slice(0, MAX_HISTORY_ITEMS);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  const removeFromHistory = useCallback(
    (query: string) => {
      setHistory((prev) => {
        const next = prev.filter((s) => s !== query);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  return { history, addToHistory, removeFromHistory };
}
