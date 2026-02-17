/**
 * Diagnostic console modal.
 * Displays structured log entries from the main process for debugging.
 * Features: level filter, auto-scroll, clear, copy-all.
 */
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { mdiClose, mdiContentCopy, mdiContentSave, mdiDeleteOutline, mdiRefresh, mdiFilterOutline, mdiMagnify } from '@mdi/js';
import type { DiagLogEntry, DiagLogLevel, DiagSearchField } from '@shared/diagnostic';
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
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [searchField, setSearchField] = useState<DiagSearchField>('all');
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

  const filteredLogs = useMemo(() => {
    let result: readonly DiagLogEntry[] = filter === 'all' ? logs : logs.filter((l) => l.level === filter);
    const query = searchText.trim().toLowerCase();
    if (query !== '') {
      result = result.filter((entry) => {
        switch (searchField) {
          case 'tag':
            return entry.tag.toLowerCase().includes(query);
          case 'message':
            return entry.message.toLowerCase().includes(query);
          case 'timestamp':
            return formatTimestamp(entry.timestamp).includes(query);
          case 'all':
            return (
              entry.tag.toLowerCase().includes(query) ||
              entry.message.toLowerCase().includes(query) ||
              formatTimestamp(entry.timestamp).includes(query)
            );
          default: {
            const _exhaustive: never = searchField;
            return _exhaustive;
          }
        }
      });
    }
    return result;
  }, [logs, filter, searchText, searchField]);

  const formatLogsToText = useCallback((): string => {
    return filteredLogs
      .map((l) => `[${formatTimestamp(l.timestamp)}] [${l.tag}] ${LEVEL_LABELS[l.level]}: ${l.message}`)
      .join('\n');
  }, [filteredLogs]);

  const handleCopyAll = useCallback(async () => {
    const text = formatLogsToText();
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(true);
      setTimeout(() => { setCopyFeedback(false); }, 1500);
    } catch {
      // Fallback: ignore clipboard errors
    }
  }, [formatLogsToText]);

  const handleSaveToFile = useCallback(async () => {
    const text = formatLogsToText();
    try {
      const result = await window.electronApi.invoke('diag:save-logs', text);
      if (result.saved) {
        setSaveFeedback('保存しました');
        setTimeout(() => { setSaveFeedback(null); }, 2000);
      }
    } catch {
      setSaveFeedback('保存に失敗しました');
      setTimeout(() => { setSaveFeedback(null); }, 2000);
    }
  }, [formatLogsToText]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current === null) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  return (
    <div className="flex h-full flex-col rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
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

        <div className="mx-2 h-4 w-px bg-[var(--color-border-primary)]" />

        {/* Search */}
        <div className="flex items-center gap-1">
          <MdiIcon path={mdiMagnify} size={12} className="text-[var(--color-text-muted)]" />
          <select
            value={searchField}
            onChange={(e) => { setSearchField(e.target.value as DiagSearchField); }}
            className="rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] focus:outline-none"
            aria-label="検索対象フィールド"
          >
            <option value="all">全フィールド</option>
            <option value="tag">タグ</option>
            <option value="message">メッセージ</option>
            <option value="timestamp">時刻</option>
          </select>
          <div className="relative">
            <input
              type="text"
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); }}
              placeholder="検索..."
              className="w-36 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 pr-5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              aria-label="ログ検索"
            />
            {searchText !== '' && (
              <button
                type="button"
                onClick={() => { setSearchText(''); }}
                className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                title="検索をクリア"
              >
                <MdiIcon path={mdiClose} size={10} />
              </button>
            )}
          </div>
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
          onClick={() => { void handleSaveToFile(); }}
          className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title={saveFeedback ?? 'ログをファイルに保存'}
        >
          <MdiIcon path={mdiContentSave} size={14} className={saveFeedback === '保存しました' ? 'text-[var(--color-success)]' : ''} />
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
