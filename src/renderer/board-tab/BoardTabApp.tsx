/**
 * Board Tab application — thread list content for one board.
 * Runs in its own WebContentsView / renderer process.
 * No virtual scrolling — renders all thread rows directly.
 */
import {
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
  useDeferredValue,
  lazy,
  Suspense,
} from 'react';
import {
  mdiArrowUp,
  mdiArrowDown,
  mdiNewBox,
  mdiArchive,
  mdiLoading,
  mdiMagnify,
  mdiStar,
  mdiStarOutline,
  mdiClose,
  mdiRefresh,
  mdiPencilPlus,
} from '@mdi/js';
import { AgeSage, type SubjectRecord, type BoardSortKey, BoardType } from '@shared/domain';
import type { FavItem, FavNode } from '@shared/favorite';
import {
  AbonType,
  NgStringField as NgStringFieldEnum,
  NgStringMatchMode,
  NgTarget,
} from '@shared/ng';
import type { NgRule } from '@shared/ng';
import { useBoardTabStore } from './stores/board-tab-store';
import { MdiIcon } from '../components/common/MdiIcon';
import { SearchInputWithHistory } from '../components/common/SearchInputWithHistory';
import { ContextMenuContainer } from '../components/common/ContextMenuContainer';
import { RefreshOverlay } from '../components/common/RefreshOverlay';
import { useScrollKeyboard } from '../hooks/use-scroll-keyboard';
import type { BoardTabInitData } from '@shared/view-ipc';

const NewThreadEditor = lazy(() =>
  import('../components/post-editor/NewThreadEditor').then((m) => ({ default: m.NewThreadEditor })),
);

function computeIkioi(fileName: string, count: number): number {
  const threadTs = parseInt(fileName.replace('.dat', ''), 10);
  if (Number.isNaN(threadTs) || threadTs <= 0) return 0;
  const elapsedDays = (Date.now() / 1000 - threadTs) / 86400;
  if (elapsedDays <= 0) return 0;
  return count / elapsedDays;
}

function formatTimestamp(ts: number): string {
  if (ts <= 0) return '';
  const d = new Date(ts * 1000);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hours}:${mins}`;
}

function ageSageBadge(ageSage: number | undefined): React.JSX.Element | null {
  switch (ageSage) {
    case AgeSage.Age:
      return <MdiIcon path={mdiArrowUp} size={12} className="text-[var(--color-age)]" />;
    case AgeSage.Sage:
      return <MdiIcon path={mdiArrowDown} size={12} className="text-[var(--color-sage)]" />;
    case AgeSage.New:
      return <MdiIcon path={mdiNewBox} size={12} className="text-[var(--color-success)]" />;
    case AgeSage.Archive:
      return <MdiIcon path={mdiArchive} size={12} className="text-[var(--color-archive)]" />;
    default:
      return null;
  }
}

interface CtxMenu {
  readonly x: number;
  readonly y: number;
  readonly subject: SubjectRecord;
  readonly isFavorite: boolean;
}

function matchesThreadNg(
  rule: NgRule,
  title: string,
  boardId: string,
  threadId: string,
  resCount: number,
): boolean {
  if (rule.target !== NgTarget.Thread) return false;
  if (!rule.enabled) return false;
  if (rule.boardId !== undefined && rule.boardId !== boardId) return false;
  if (rule.threadId !== undefined) return rule.threadId === threadId;

  const { condition } = rule;

  if (condition.type === 'string') {
    if (
      condition.matchMode === NgStringMatchMode.Regexp ||
      condition.matchMode === NgStringMatchMode.RegexpNoCase
    ) {
      const pattern = condition.tokens[0];
      if (pattern === undefined) return false;
      try {
        const regex = new RegExp(
          pattern,
          condition.matchMode === NgStringMatchMode.RegexpNoCase ? 'i' : '',
        );
        const matches = regex.test(title);
        return condition.negate ? !matches : matches;
      } catch {
        return false;
      }
    }
    const matches = condition.tokens.every((t: string) => title.includes(t));
    return condition.negate ? !matches : matches;
  }

  if (condition.type === 'numeric') {
    const target = condition.target;
    if (target !== 'threadResCount') return false;
    const numVal = resCount;
    let matches: boolean;
    switch (condition.op) {
      case 'eq':
        matches = numVal === condition.value;
        break;
      case 'gte':
        matches = numVal >= condition.value;
        break;
      case 'lte':
        matches = numVal <= condition.value;
        break;
      case 'lt':
        matches = numVal < condition.value;
        break;
      case 'gt':
        matches = numVal > condition.value;
        break;
      case 'between':
        matches = numVal >= condition.value && numVal <= (condition.value2 ?? condition.value);
        break;
      default:
        matches = false;
    }
    return condition.negate ? !matches : matches;
  }

  return false;
}

const THREAD_ROW_HEIGHT = 28;

export function BoardTabApp(): React.JSX.Element {
  const board = useBoardTabStore((s) => s.board);
  const subjects = useBoardTabStore((s) => s.subjects);
  const threadIndices = useBoardTabStore((s) => s.threadIndices);
  const subjectLoading = useBoardTabStore((s) => s.subjectLoading);
  const filter = useBoardTabStore((s) => s.filter);
  const sortKey = useBoardTabStore((s) => s.sortKey);
  const sortDir = useBoardTabStore((s) => s.sortDir);
  const ngRules = useBoardTabStore((s) => s.ngRules);
  const favorites = useBoardTabStore((s) => s.favorites);
  const newThreadEditorOpen = useBoardTabStore((s) => s.newThreadEditorOpen);
  const nextThreadDraft = useBoardTabStore((s) => s.nextThreadDraft);
  const openNewThreadEditor = useBoardTabStore((s) => s.openNewThreadEditor);
  const closeNewThreadEditor = useBoardTabStore((s) => s.closeNewThreadEditor);
  const setFilter = useBoardTabStore((s) => s.setFilter);
  const setSort = useBoardTabStore((s) => s.setSort);
  const openThread = useBoardTabStore((s) => s.openThread);
  const refreshBoard = useBoardTabStore((s) => s.refreshBoard);
  const initialize = useBoardTabStore((s) => s.initialize);

  const deferredFilter = useDeferredValue(filter);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [edgeRefreshing, setEdgeRefreshing] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const handleScrollKeyboard = useScrollKeyboard(listScrollRef);
  const edgeRefreshUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeRefreshLockedRef = useRef(false);

  // Initialize on mount (pull model) or via push event from pool
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    void (async () => {
      const initData = await window.electronApi.invoke('view:board-tab-ready');
      if (initData !== null) {
        await initialize(initData);
      }
    })();
  }, [initialize]);

  // Listen for push events
  useEffect(() => {
    const unsubInit = window.electronApi.on('view:board-tab-init', (...args: unknown[]) => {
      const initData = args[0] as BoardTabInitData;
      void useBoardTabStore.getState().initialize(initData);
    });
    const unsubNg = window.electronApi.on('view:ng-rules-updated', (...args: unknown[]) => {
      const rules = args[0] as readonly NgRule[];
      useBoardTabStore.getState().setNgRules(rules);
    });
    const unsubFav = window.electronApi.on('view:favorites-updated', (...args: unknown[]) => {
      const tree = args[0] as { children: readonly FavNode[] };
      useBoardTabStore.getState().setFavorites(tree);
    });
    const unsubRefresh = window.electronApi.on('view:refresh-board', () => {
      void useBoardTabStore.getState().refreshBoard();
    });
    const unsubDraft = window.electronApi.on(
      'view:board-open-new-thread-with-draft',
      (...args: unknown[]) => {
        const data = args[0] as { subject: string; message: string };
        useBoardTabStore.getState().openNewThreadEditorWithDraft(data.subject, data.message);
      },
    );
    return () => {
      unsubInit();
      unsubNg();
      unsubFav();
      unsubRefresh();
      unsubDraft();
    };
  }, []);

  // Cleanup edge refresh timer
  useEffect(() => {
    return () => {
      if (edgeRefreshUnlockTimerRef.current !== null) {
        clearTimeout(edgeRefreshUnlockTimerRef.current);
      }
    };
  }, []);

  // Close context menu on click
  useEffect(() => {
    if (ctxMenu === null) return;
    const handler = (): void => {
      setCtxMenu(null);
    };
    document.addEventListener('click', handler);
    return () => {
      document.removeEventListener('click', handler);
    };
  }, [ctxMenu]);

  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const idx of threadIndices) {
      map.set(idx.fileName, idx.ageSage);
    }
    return map;
  }, [threadIndices]);

  const favoriteUrlToId = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (nodes: readonly FavNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'item' && node.type === 'thread') {
          map.set(node.url, node.id);
        }
        if (node.kind === 'folder') {
          walk(node.children);
        }
      }
    };
    walk(favorites.children);
    return map;
  }, [favorites]);

  const threadNgRules = useMemo(
    () => ngRules.filter((r) => r.target === NgTarget.Thread && r.enabled),
    [ngRules],
  );

  const currentBoardId = useMemo(() => {
    if (board === null) return '';
    try {
      const segments = new URL(board.url).pathname.split('/').filter((s) => s.length > 0);
      return segments[segments.length - 1] ?? '';
    } catch {
      return '';
    }
  }, [board]);

  const uniqueSubjects = useMemo(() => {
    const seen = new Set<string>();
    return subjects.filter((s) => {
      if (seen.has(s.fileName)) return false;
      seen.add(s.fileName);
      return true;
    });
  }, [subjects]);

  const filteredSubjects = useMemo(() => {
    let result = uniqueSubjects;
    if (deferredFilter.trim().length > 0) {
      const lower = deferredFilter.toLowerCase();
      result = result.filter((s) => s.title.toLowerCase().includes(lower));
    }
    if (threadNgRules.length > 0 && currentBoardId.length > 0) {
      result = result.filter((s) => {
        const threadId = s.fileName.replace('.dat', '');
        for (const rule of threadNgRules) {
          if (matchesThreadNg(rule, s.title, currentBoardId, threadId, s.count)) {
            if (rule.abonType === AbonType.Transparent) return false;
          }
        }
        return true;
      });
    }
    return result;
  }, [uniqueSubjects, deferredFilter, threadNgRules, currentBoardId]);

  const normalAbonThreads = useMemo(() => {
    if (threadNgRules.length === 0 || currentBoardId.length === 0) return new Set<string>();
    const abonSet = new Set<string>();
    for (const s of subjects) {
      const threadId = s.fileName.replace('.dat', '');
      for (const rule of threadNgRules) {
        if (
          matchesThreadNg(rule, s.title, currentBoardId, threadId, s.count) &&
          rule.abonType === AbonType.Normal
        ) {
          abonSet.add(s.fileName);
          break;
        }
      }
    }
    return abonSet;
  }, [subjects, threadNgRules, currentBoardId]);

  const sortedSubjects = useMemo(() => {
    const items = filteredSubjects.map((s, i) => ({
      ...s,
      originalIndex: i,
      ikioi: computeIkioi(s.fileName, s.count),
      completionRate: (s.count / 1000) * 100,
      firstPostTs: parseInt(s.fileName.replace('.dat', ''), 10) || 0,
    }));
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'index':
          cmp = a.originalIndex - b.originalIndex;
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'count':
          cmp = a.count - b.count;
          break;
        case 'ikioi':
          cmp = a.ikioi - b.ikioi;
          break;
        case 'completionRate':
          cmp = a.completionRate - b.completionRate;
          break;
        case 'firstPostDate':
          cmp = a.firstPostTs - b.firstPostTs;
          break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return items;
  }, [filteredSubjects, sortKey, sortDir]);

  const handleSort = useCallback(
    (key: BoardSortKey) => {
      if (sortKey === key) {
        setSort(key, sortDir === 'asc' ? 'desc' : 'asc');
      } else {
        setSort(key, 'asc');
      }
    },
    [sortKey, sortDir, setSort],
  );

  const handleOpenThread = useCallback(
    (subject: SubjectRecord) => {
      if (board === null) return;
      const threadId = subject.fileName.replace('.dat', '');
      openThread(board.url, threadId, subject.title);
    },
    [board, openThread],
  );

  const buildThreadUrl = useCallback(
    (subject: SubjectRecord): string => {
      if (board === null) return '';
      const threadId = subject.fileName.replace('.dat', '');
      return `${board.url}dat/${threadId}.dat`;
    },
    [board],
  );

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent, subject: SubjectRecord) => {
      e.stopPropagation();
      if (board === null) return;
      const threadId = subject.fileName.replace('.dat', '');
      const threadUrl = `${board.url}dat/${threadId}.dat`;
      const existingFavId = favoriteUrlToId.get(threadUrl);
      if (existingFavId !== undefined) {
        void window.electronApi.invoke('fav:remove', existingFavId);
      } else {
        const node: FavItem = {
          id: `fav-${threadId}-${String(Date.now())}`,
          kind: 'item',
          type: 'thread',
          boardType: board.boardType ?? BoardType.Type2ch,
          url: threadUrl,
          title: subject.title,
        };
        void window.electronApi.invoke('fav:add', node);
      }
    },
    [board, favoriteUrlToId],
  );

  const getFirstVisibleFileName = useCallback((): string | null => {
    const container = listScrollRef.current;
    if (container === null) return null;
    const idx = Math.floor(container.scrollTop / THREAD_ROW_HEIGHT);
    const subject = sortedSubjects[idx];
    return subject?.fileName ?? null;
  }, [sortedSubjects]);

  const clearFilterWithScrollRestore = useCallback(() => {
    const targetFileName = getFirstVisibleFileName();
    setFilter('');
    if (targetFileName !== null) {
      requestAnimationFrame(() => {
        const container = listScrollRef.current;
        if (container === null) return;
        const rows = container.children;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          if (row instanceof HTMLElement && row.dataset['fileName'] === targetFileName) {
            row.scrollIntoView({ block: 'start' });
            return;
          }
        }
      });
    }
  }, [getFirstVisibleFileName, setFilter]);

  const handleRefresh = useCallback(() => {
    if (board === null || subjectLoading) return;
    void refreshBoard();
  }, [board, subjectLoading, refreshBoard]);

  const handleListWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      const container = listScrollRef.current;
      if (container === null) return;
      if (edgeRefreshLockedRef.current || subjectLoading || board === null) return;

      const atTop = container.scrollTop <= 0;
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 5;
      const scrollingUp = e.deltaY < 0;
      const scrollingDown = e.deltaY > 0;

      if ((atTop && scrollingUp) || (atBottom && scrollingDown)) {
        edgeRefreshLockedRef.current = true;
        setEdgeRefreshing(true);
        void refreshBoard().finally(() => {
          setEdgeRefreshing(false);
        });

        if (edgeRefreshUnlockTimerRef.current !== null) {
          clearTimeout(edgeRefreshUnlockTimerRef.current);
        }
        edgeRefreshUnlockTimerRef.current = setTimeout(() => {
          edgeRefreshLockedRef.current = false;
          edgeRefreshUnlockTimerRef.current = null;
        }, 1200);
      }
    },
    [subjectLoading, board, refreshBoard],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, subject: SubjectRecord) => {
      e.preventDefault();
      e.stopPropagation();
      const threadUrl = buildThreadUrl(subject);
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        subject,
        isFavorite: favoriteUrlToId.has(threadUrl),
      });
    },
    [buildThreadUrl, favoriteUrlToId],
  );

  const handleCtxAddNg = useCallback(
    (abonType: AbonType) => {
      if (ctxMenu !== null && board !== null) {
        const threadId = ctxMenu.subject.fileName.replace('.dat', '');
        const rule: NgRule = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
          condition: {
            type: 'string',
            matchMode: NgStringMatchMode.Plain,
            fields: [NgStringFieldEnum.ThreadTitle],
            tokens: [ctxMenu.subject.title],
            negate: false,
          },
          target: NgTarget.Thread,
          abonType,
          boardId: currentBoardId.length > 0 ? currentBoardId : undefined,
          threadId,
          enabled: true,
        };
        void window.electronApi.invoke('ng:add-rule', rule);
      }
      setCtxMenu(null);
    },
    [ctxMenu, board, currentBoardId],
  );

  const SortHeader = useCallback(
    ({ label, field }: { readonly label: string; readonly field: BoardSortKey }) => (
      <button
        type="button"
        onClick={() => {
          handleSort(field);
        }}
        className="flex items-center gap-0.5 text-left text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        {label}
        {sortKey === field && (
          <span className="text-[var(--color-accent)]">{sortDir === 'asc' ? '▲' : '▼'}</span>
        )}
      </button>
    ),
    [handleSort, sortKey, sortDir],
  );

  return (
    <section className="flex h-full flex-col" onKeyDown={handleScrollKeyboard}>
      {/* Header */}
      <div className="flex h-8 items-center gap-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3">
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text-secondary)]"
          title={board?.title ?? 'スレッド一覧'}
        >
          {board?.title ?? 'スレッド一覧'}
        </span>
        {subjectLoading && (
          <MdiIcon
            path={mdiLoading}
            size={12}
            className="animate-spin text-[var(--color-accent)]"
          />
        )}
        {subjects.length > 0 && (
          <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
            {subjects.length} スレッド
          </span>
        )}
        {board !== null && (
          <>
            <button
              type="button"
              onClick={openNewThreadEditor}
              className={`shrink-0 rounded p-0.5 hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] ${
                newThreadEditorOpen
                  ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)]'
              }`}
              title="スレッドを新規作成"
            >
              <MdiIcon path={mdiPencilPlus} size={12} />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
              title="スレッド一覧を再取得"
            >
              <MdiIcon
                path={subjectLoading ? mdiLoading : mdiRefresh}
                size={12}
                className={subjectLoading ? 'animate-spin' : ''}
              />
            </button>
          </>
        )}
      </div>

      {/* New Thread Editor */}
      {newThreadEditorOpen && board !== null && (
        <Suspense fallback={null}>
          <NewThreadEditor
            boardUrl={board.url}
            onClose={closeNewThreadEditor}
            initialDraft={nextThreadDraft}
          />
        </Suspense>
      )}

      {/* Filter */}
      {subjects.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/30 px-3 py-1">
          <MdiIcon
            path={mdiMagnify}
            size={12}
            className="shrink-0 text-[var(--color-text-muted)]"
          />
          <SearchInputWithHistory
            value={filter}
            onChange={setFilter}
            storageKey="vbbb-search-history-thread-list"
            placeholder="スレッドを検索..."
            inputClassName="min-w-0 w-full bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          {filter.length > 0 && (
            <>
              <span className="text-xs text-[var(--color-text-muted)]">
                {filteredSubjects.length} 件
              </span>
              <button
                type="button"
                onClick={clearFilterWithScrollRestore}
                className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                aria-label="検索をクリア"
              >
                <MdiIcon path={mdiClose} size={12} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Table header */}
      <div className="flex h-6 items-center gap-1 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/50 px-3">
        <div className="w-8">
          <SortHeader label="#" field="index" />
        </div>
        <div className="w-5" />
        <div className="min-w-0 flex-1">
          <SortHeader label="タイトル" field="title" />
        </div>
        <div className="w-12 text-right">
          <SortHeader label="勢い" field="ikioi" />
        </div>
        <div className="w-10 text-right">
          <SortHeader label="完走" field="completionRate" />
        </div>
        <div className="w-16 text-right">
          <SortHeader label="作成日" field="firstPostDate" />
        </div>
        <div className="w-12 text-right">
          <SortHeader label="レス" field="count" />
        </div>
        <div className="w-6" />
      </div>

      {/* Thread rows — no virtual scrolling */}
      <div
        ref={listScrollRef}
        className="relative flex-1 overflow-y-auto"
        onWheel={handleListWheel}
      >
        {board === null && (
          <p className="p-4 text-center text-xs text-[var(--color-text-muted)]">
            板を選択してください
          </p>
        )}
        {sortedSubjects.map((subject, i) => {
          const threadId = subject.fileName.replace('.dat', '');
          const threadUrl = board !== null ? `${board.url}dat/${threadId}.dat` : '';
          const isFavorite = favoriteUrlToId.has(threadUrl);
          const isNormalAbon = normalAbonThreads.has(subject.fileName);
          const ageSageVal = indexMap.get(subject.fileName);
          const firstPostTs = subject.firstPostTs;

          if (isNormalAbon) {
            return (
              <div
                key={subject.fileName}
                data-file-name={subject.fileName}
                className="flex w-full items-center gap-1 border-b border-[var(--color-border-secondary)] px-3 py-1 text-xs opacity-40"
                style={{ height: THREAD_ROW_HEIGHT }}
              >
                <span className="text-[var(--color-text-muted)]">あぼーん</span>
              </div>
            );
          }

          return (
            <div
              key={subject.fileName}
              data-file-name={subject.fileName}
              className="flex w-full cursor-pointer items-center gap-1 border-b border-[var(--color-border-secondary)] px-3 text-xs hover:bg-[var(--color-bg-hover)]"
              style={{ height: THREAD_ROW_HEIGHT }}
              onClick={() => {
                handleOpenThread(subject);
              }}
              onContextMenu={(e) => {
                handleContextMenu(e, subject);
              }}
            >
              <div className="w-8 shrink-0 text-right text-[var(--color-text-muted)]">{i + 1}</div>
              <div className="w-5 shrink-0 text-center">{ageSageBadge(ageSageVal)}</div>
              <div className="min-w-0 flex-1 truncate text-[var(--color-text-primary)]">
                {subject.title}
              </div>
              <div className="w-12 shrink-0 text-right text-[var(--color-text-muted)]">
                {subject.ikioi > 0 ? subject.ikioi.toFixed(1) : ''}
              </div>
              <div className="w-10 shrink-0 text-right text-[var(--color-text-muted)]">
                {Math.round(subject.completionRate)}%
              </div>
              <div className="w-16 shrink-0 text-right text-[var(--color-text-muted)]">
                {formatTimestamp(firstPostTs)}
              </div>
              <div className="w-12 shrink-0 text-right text-[var(--color-text-primary)]">
                {subject.count}
              </div>
              <div className="w-6 shrink-0 text-center">
                <button
                  type="button"
                  onClick={(e) => {
                    handleToggleFavorite(e, subject);
                  }}
                  className="rounded p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-warning)]"
                >
                  <MdiIcon path={isFavorite ? mdiStar : mdiStarOutline} size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edge refresh overlay */}
      {edgeRefreshing && <RefreshOverlay />}

      {/* Context menu */}
      {ctxMenu !== null && (
        <ContextMenuContainer x={ctxMenu.x} y={ctxMenu.y}>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => {
              handleOpenThread(ctxMenu.subject);
              setCtxMenu(null);
            }}
          >
            スレッドを開く
          </button>
          <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => {
              if (ctxMenu.isFavorite) {
                const favId = favoriteUrlToId.get(buildThreadUrl(ctxMenu.subject));
                if (favId !== undefined) void window.electronApi.invoke('fav:remove', favId);
              } else {
                handleToggleFavorite(
                  { stopPropagation: () => undefined } as React.MouseEvent,
                  ctxMenu.subject,
                );
              }
              setCtxMenu(null);
            }}
          >
            {ctxMenu.isFavorite ? 'お気に入りから削除' : 'お気に入りに追加'}
          </button>
          <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => {
              handleCtxAddNg(AbonType.Normal);
            }}
          >
            NGスレッド (あぼーん)
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={() => {
              handleCtxAddNg(AbonType.Transparent);
            }}
          >
            NGスレッド (透明あぼーん)
          </button>
        </ContextMenuContainer>
      )}
    </section>
  );
}
