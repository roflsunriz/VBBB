/**
 * History panel (F32).
 *
 * Displays recently visited threads. Allows re-opening, searching,
 * and clearing history.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { mdiMagnify, mdiClose, mdiDelete, mdiRefresh } from '@mdi/js';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

export function HistoryPanel(): React.JSX.Element {
  const browsingHistory = useBBSStore((s) => s.browsingHistory);
  const loadBrowsingHistory = useBBSStore((s) => s.loadBrowsingHistory);
  const clearBrowsingHistory = useBBSStore((s) => s.clearBrowsingHistory);
  const openThread = useBBSStore((s) => s.openThread);

  const [filter, setFilter] = useState('');

  // Load history on mount
  useEffect(() => {
    void loadBrowsingHistory();
  }, [loadBrowsingHistory]);

  const filteredHistory = useMemo(() => {
    if (filter.trim().length === 0) return browsingHistory;
    const lower = filter.toLowerCase();
    return browsingHistory.filter(
      (e) => e.title.toLowerCase().includes(lower) || e.boardUrl.toLowerCase().includes(lower),
    );
  }, [browsingHistory, filter]);

  const handleOpen = useCallback(
    (boardUrl: string, threadId: string, title: string) => {
      void openThread(boardUrl, threadId, title);
    },
    [openThread],
  );

  const handleClear = useCallback(() => {
    void clearBrowsingHistory();
  }, [clearBrowsingHistory]);

  const handleRefresh = useCallback(() => {
    void loadBrowsingHistory();
  }, [loadBrowsingHistory]);

  /** Format ISO date to relative or short string */
  const formatDate = useCallback((isoDate: string): string => {
    try {
      const d = new Date(isoDate);
      const diffMs = Date.now() - d.getTime();
      if (diffMs < 0) return '';
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return 'たった今';
      if (diffMin < 60) return `${String(diffMin)}分前`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${String(diffHour)}時間前`;
      const diffDay = Math.floor(diffHour / 24);
      if (diffDay < 30) return `${String(diffDay)}日前`;
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${String(d.getFullYear())}/${month}/${day}`;
    } catch {
      return '';
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border-secondary)] px-2 py-1">
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          履歴 ({browsingHistory.length})
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleRefresh}
          className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="更新"
        >
          <MdiIcon path={mdiRefresh} size={12} />
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-error)]"
          title="履歴をすべて削除"
        >
          <MdiIcon path={mdiDelete} size={12} />
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border-secondary)] px-2 py-1">
        <MdiIcon path={mdiMagnify} size={11} className="shrink-0 text-[var(--color-text-muted)]" />
        <input
          type="text"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); }}
          placeholder="履歴を検索..."
          className="min-w-0 flex-1 bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
        />
        {filter.length > 0 && (
          <button
            type="button"
            onClick={() => { setFilter(''); }}
            className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="検索をクリア"
          >
            <MdiIcon path={mdiClose} size={11} />
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filteredHistory.length === 0 && (
          <p className="p-3 text-center text-xs text-[var(--color-text-muted)]">
            {browsingHistory.length === 0 ? '履歴はありません' : '一致する履歴はありません'}
          </p>
        )}
        {filteredHistory.map((entry) => (
          <button
            key={`${entry.boardUrl}-${entry.threadId}`}
            type="button"
            onClick={() => { handleOpen(entry.boardUrl, entry.threadId, entry.title); }}
            className="flex w-full flex-col gap-0.5 border-b border-[var(--color-border-secondary)] px-2 py-1.5 text-left hover:bg-[var(--color-bg-hover)]"
          >
            <span className="truncate text-xs text-[var(--color-text-secondary)]">{entry.title}</span>
            <span className="text-[10px] text-[var(--color-text-muted)]">{formatDate(entry.lastVisited)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
