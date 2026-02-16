/**
 * Diagnostic console modal.
 * Displays structured log entries from the main process for debugging.
 * Features: level filter, auto-scroll, clear, copy-all.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { mdiClose, mdiContentCopy, mdiDeleteOutline, mdiRefresh, mdiFilterOutline } from '@mdi/js';
import type { DiagLogEntry, DiagLogLevel } from '@shared/diagnostic';
import { MdiIcon } from '../common/MdiIcon';

interface ConsoleModalProps {
  readonly onClose: () => void;
}

const LEVEL_COLORS: Record<DiagLogLevel, string> = {
  info: 'text-[var(--color-text-secondary)]',
  warn: 'text-[var(--color-warning)]',
  error: 'text-[var(--color-error)]',
};

const LEVEL_LABELS: Record<DiagLogLevel, string> = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERR ',
};

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
  } catch {
    return iso;
  }
}

export function ConsoleModal({ onClose }: ConsoleModalProps): React.JSX.Element {
  const [logs, setLogs] = useState<readonly DiagLogEntry[]>([]);
  const [filter, setFilter] = useState<DiagLogLevel | 'all'>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const entries = await window.electronApi.invoke('diag:get-logs');
      setLogs(entries);
    } catch {
      // Ignore fetch errors
    }
  }, []);

  // Poll for new logs while the modal is open
  useEffect(() => {
    void fetchLogs();
    const interval = setInterval(() => { void fetchLogs(); }, 1000);
    return () => { clearInterval(interval); };
  }, [fetchLogs]);

  // Auto-scroll to bottom when logs change
  useEffect(() => {
    if (autoScroll && scrollRef.current !== null) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClear = useCallback(async () => {
    try {
      await window.electronApi.invoke('diag:clear-logs');
      setLogs([]);
    } catch {
      // Ignore
    }
  }, []);

  const handleCopyAll = useCallback(async () => {
    const filtered = filter === 'all' ? logs : logs.filter((l) => l.level === filter);
    const text = filtered
      .map((l) => `[${formatTimestamp(l.timestamp)}] [${l.tag}] ${LEVEL_LABELS[l.level]}: ${l.message}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => { setCopyFeedback(false); }, 1500);
    } catch {
      // Fallback: ignore clipboard errors
    }
  }, [logs, filter]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current === null) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const filteredLogs = filter === 'all' ? logs : logs.filter((l) => l.level === filter);

  return (
    <div className="flex max-h-[80vh] flex-col rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-primary)] px-3 py-2">
        <span className="text-sm font-bold text-[var(--color-text-primary)]">
          診断コンソール
        </span>

        <div className="mx-2 h-4 w-px bg-[var(--color-border-primary)]" />

        {/* Filter */}
        <div className="flex items-center gap-1">
          <MdiIcon path={mdiFilterOutline} size={12} className="text-[var(--color-text-muted)]" />
          <select
            value={filter}
            onChange={(e) => { setFilter(e.target.value as DiagLogLevel | 'all'); }}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
          >
            <option value="all">全て</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
          </select>
        </div>

        <span className="text-xs text-[var(--color-text-muted)]">
          {String(filteredLogs.length)} / {String(logs.length)} 件
        </span>

        <div className="flex-1" />

        {/* Actions */}
        <button
          type="button"
          onClick={() => { void fetchLogs(); }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="更新"
        >
          <MdiIcon path={mdiRefresh} size={14} />
        </button>
        <button
          type="button"
          onClick={() => { void handleCopyAll(); }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title={copyFeedback ? 'コピー済み' : 'ログをコピー'}
        >
          <MdiIcon path={mdiContentCopy} size={14} className={copyFeedback ? 'text-[var(--color-success)]' : ''} />
        </button>
        <button
          type="button"
          onClick={() => { void handleClear(); }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-error)]"
          title="クリア"
        >
          <MdiIcon path={mdiDeleteOutline} size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="閉じる"
        >
          <MdiIcon path={mdiClose} size={14} />
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-[300px] flex-1 overflow-auto bg-[var(--color-bg-primary)] p-2 font-mono text-xs leading-relaxed"
      >
        {filteredLogs.length === 0 ? (
          <p className="py-8 text-center text-[var(--color-text-muted)]">
            ログエントリはありません
          </p>
        ) : (
          filteredLogs.map((entry, idx) => (
            <div
              key={`${entry.timestamp}-${String(idx)}`}
              className={`whitespace-pre-wrap break-all border-b border-[var(--color-border-primary)]/30 py-0.5 ${LEVEL_COLORS[entry.level]}`}
            >
              <span className="text-[var(--color-text-muted)]">
                {formatTimestamp(entry.timestamp)}
              </span>
              {' '}
              <span className="font-semibold">
                [{entry.tag}]
              </span>
              {' '}
              <span className={entry.level === 'error' ? 'font-bold' : ''}>
                {LEVEL_LABELS[entry.level]}:
              </span>
              {' '}
              {entry.message}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--color-border-primary)] px-3 py-1.5">
        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => { setAutoScroll(e.target.checked); }}
            className="accent-[var(--color-accent)]"
          />
          自動スクロール
        </label>
        <span className="text-xs text-[var(--color-text-muted)]">
          1秒ごとに自動更新
        </span>
      </div>
    </div>
  );
}
