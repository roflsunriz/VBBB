/**
 * Lightweight status console panel.
 * Displays real-time status events (network, board, thread, post, media)
 * in a compact log view at the bottom of the left pane.
 */
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import {
  mdiWeb,
  mdiBulletinBoard,
  mdiFormatListBulleted,
  mdiSend,
  mdiImage,
  mdiChevronDown,
  mdiChevronUp,
  mdiDeleteOutline,
  mdiFilterOutline,
} from '@mdi/js';
import type { StatusLogCategory, StatusLogLevel } from '@shared/status-log';
import { useStatusLogStore } from '../../stores/status-log-store';
import { MdiIcon } from '../common/MdiIcon';
import { TopResizeHandle } from '../common/TopResizeHandle';

const PANEL_MIN_HEIGHT = 60;
const PANEL_MAX_HEIGHT = 400;
const PANEL_DEFAULT_HEIGHT = 120;
const STORAGE_KEY_HEIGHT = 'vbbb-status-console-height';
const STORAGE_KEY_VISIBLE = 'vbbb-status-console-visible';

/** Category icon paths */
const CATEGORY_ICONS: Record<StatusLogCategory, string> = {
  network: mdiWeb,
  board: mdiBulletinBoard,
  thread: mdiFormatListBulleted,
  post: mdiSend,
  media: mdiImage,
};

/** Category display labels */
const CATEGORY_LABELS: Record<StatusLogCategory, string> = {
  network: 'NET',
  board: '板',
  thread: 'スレ',
  post: '投稿',
  media: 'メディア',
};

/** Level-based text color classes */
const LEVEL_COLORS: Record<StatusLogLevel, string> = {
  info: 'text-[var(--color-text-secondary)]',
  success: 'text-[var(--color-success)]',
  warn: 'text-[var(--color-warning)]',
  error: 'text-[var(--color-error)]',
};

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function loadPersistedHeight(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_HEIGHT);
    if (raw !== null) {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= PANEL_MIN_HEIGHT && n <= PANEL_MAX_HEIGHT) return n;
    }
  } catch {
    // Ignore storage errors
  }
  return PANEL_DEFAULT_HEIGHT;
}

function loadPersistedVisible(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VISIBLE);
    if (raw !== null) return raw === 'true';
  } catch {
    // Ignore storage errors
  }
  return true;
}

const ALL_CATEGORIES: readonly StatusLogCategory[] = ['network', 'board', 'thread', 'post', 'media'];

export function StatusConsole(): React.JSX.Element {
  const entries = useStatusLogStore((s) => s.entries);
  const filterCategory = useStatusLogStore((s) => s.filterCategory);
  const setFilterCategory = useStatusLogStore((s) => s.setFilterCategory);
  const clearLogs = useStatusLogStore((s) => s.clearLogs);
  const setVisible = useStatusLogStore((s) => s.setVisible);
  const visible = useStatusLogStore((s) => s.visible);

  const [height, setHeight] = useState(loadPersistedHeight);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  // Sync persisted visibility on mount
  useEffect(() => {
    setVisible(loadPersistedVisible());
  }, [setVisible]);

  const filteredEntries = useMemo(() => {
    if (filterCategory === null) return entries;
    return entries.filter((e) => e.category === filterCategory);
  }, [entries, filterCategory]);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current !== null) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredEntries]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current === null) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 30;
  }, []);

  const handleToggle = useCallback(() => {
    const next = !visible;
    setVisible(next);
    try {
      localStorage.setItem(STORAGE_KEY_VISIBLE, String(next));
    } catch {
      // Ignore storage errors
    }
  }, [visible, setVisible]);

  const handleResize = useCallback((deltaY: number) => {
    setHeight((h) => Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, h - deltaY)));
  }, []);

  const handleResizeEnd = useCallback(() => {
    setHeight((h) => {
      try {
        localStorage.setItem(STORAGE_KEY_HEIGHT, String(h));
      } catch {
        // Ignore storage errors
      }
      return h;
    });
  }, []);

  const handleCategoryClick = useCallback(
    (cat: StatusLogCategory) => {
      setFilterCategory(filterCategory === cat ? null : cat);
    },
    [filterCategory, setFilterCategory],
  );

  return (
    <div className="flex shrink-0 flex-col border-t border-[var(--color-border-primary)]">
      {/* Header bar (always visible) */}
      <button
        type="button"
        onClick={handleToggle}
        className="flex h-6 shrink-0 items-center gap-1 bg-[var(--color-bg-secondary)] px-2 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]"
      >
        <MdiIcon path={visible ? mdiChevronDown : mdiChevronUp} size={12} />
        <span className="font-medium">ステータス</span>
        <span className="ml-auto text-[10px] tabular-nums">{String(entries.length)}</span>
      </button>

      {/* Expandable panel */}
      {visible && (
        <>
          <TopResizeHandle onResize={handleResize} onResizeEnd={handleResizeEnd} />
          {/* Filter bar */}
          <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-1.5 py-0.5">
            <MdiIcon path={mdiFilterOutline} size={10} className="mr-0.5 text-[var(--color-text-muted)]" />
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => { handleCategoryClick(cat); }}
                className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] transition-colors ${
                  filterCategory === cat
                    ? 'bg-[var(--color-accent)]/20 text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
                }`}
                title={CATEGORY_LABELS[cat]}
              >
                <MdiIcon path={CATEGORY_ICONS[cat]} size={10} />
                <span>{CATEGORY_LABELS[cat]}</span>
              </button>
            ))}
            <div className="flex-1" />
            <button
              type="button"
              onClick={clearLogs}
              className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-error)]"
              title="クリア"
            >
              <MdiIcon path={mdiDeleteOutline} size={11} />
            </button>
          </div>

          {/* Log entries */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="overflow-auto bg-[var(--color-bg-primary)] font-mono text-[10px] leading-relaxed"
            style={{ height }}
          >
            {filteredEntries.length === 0 ? (
              <p className="py-4 text-center text-[var(--color-text-muted)]">
                ステータスログなし
              </p>
            ) : (
              filteredEntries.map((entry) => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-1 border-b border-[var(--color-border-primary)]/20 px-1.5 py-px ${LEVEL_COLORS[entry.level]}`}
                >
                  <MdiIcon
                    path={CATEGORY_ICONS[entry.category]}
                    size={10}
                    className="mt-0.5 shrink-0 opacity-60"
                  />
                  <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className="min-w-0 break-all">
                    {entry.message}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
