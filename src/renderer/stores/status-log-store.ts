/**
 * Zustand store for the lightweight status console.
 * Holds a ring-buffer of recent StatusLogEntry items (renderer-side only).
 */
import { create } from 'zustand';
import type { StatusLogCategory, StatusLogEntry, StatusLogLevel } from '@shared/status-log';

const MAX_ENTRIES = 200;

interface StatusLogState {
  /** Status log entries (newest last) */
  readonly entries: readonly StatusLogEntry[];

  /** Whether the status console panel is visible */
  readonly visible: boolean;

  /** Active category filter (null = show all) */
  readonly filterCategory: StatusLogCategory | null;

  /** Push a new status log entry */
  readonly pushLog: (category: StatusLogCategory, level: StatusLogLevel, message: string) => void;

  /** Clear all entries */
  readonly clearLogs: () => void;

  /** Toggle panel visibility */
  readonly toggleVisible: () => void;

  /** Set panel visibility explicitly */
  readonly setVisible: (visible: boolean) => void;

  /** Set category filter */
  readonly setFilterCategory: (category: StatusLogCategory | null) => void;
}

let nextId = 1;

export const useStatusLogStore = create<StatusLogState>((set) => ({
  entries: [],
  visible: true,
  filterCategory: null,

  pushLog: (category, level, message) => {
    const entry: StatusLogEntry = {
      id: nextId++,
      category,
      level,
      message,
      timestamp: Date.now(),
    };
    set((state) => {
      const updated = [...state.entries, entry];
      if (updated.length > MAX_ENTRIES) {
        return { entries: updated.slice(updated.length - MAX_ENTRIES) };
      }
      return { entries: updated };
    });
  },

  clearLogs: () => {
    set({ entries: [] });
  },

  toggleVisible: () => {
    set((state) => ({ visible: !state.visible }));
  },

  setVisible: (visible) => {
    set({ visible });
  },

  setFilterCategory: (category) => {
    set({ filterCategory: category });
  },
}));
