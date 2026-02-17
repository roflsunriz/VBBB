/**
 * Thread list panel (中央ペイン).
 * Displays subject.txt threads in a sortable, filterable table.
 * Shows age/sage badges and new response counts.
 * Supports right-click context menu for favorites and NG.
 */
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { mdiArrowUp, mdiArrowDown, mdiNewBox, mdiArchive, mdiLoading, mdiMagnify, mdiStar, mdiStarOutline, mdiClose, mdiRefresh } from '@mdi/js';
import { AgeSage, type SubjectRecord } from '@shared/domain';
import type { FavItem, FavNode } from '@shared/favorite';
import { BoardType } from '@shared/domain';
import { AbonType, NgTarget } from '@shared/ng';
import type { NgRule } from '@shared/ng';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { RefreshOverlay } from '../common/RefreshOverlay';
import { useScrollKeyboard } from '../../hooks/use-scroll-keyboard';

type SortKey = 'index' | 'title' | 'count' | 'ikioi' | 'completionRate' | 'firstPostDate' | 'newCount';
type SortDir = 'asc' | 'desc';

/** Compute thread momentum (勢い): posts per day */
function computeIkioi(fileName: string, count: number): number {
  const threadTs = parseInt(fileName.replace('.dat', ''), 10);
  if (Number.isNaN(threadTs) || threadTs <= 0) return 0;
  const elapsedDays = (Date.now() / 1000 - threadTs) / 86400;
  if (elapsedDays <= 0) return 0;
  return count / elapsedDays;
}

/** Format a Unix timestamp to locale date string */
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

/** Context menu state */
interface CtxMenu {
  readonly x: number;
  readonly y: number;
  readonly subject: SubjectRecord;
  readonly isFavorite: boolean;
}

/** Check if a thread matches a thread-level NG rule */
function matchesThreadNg(rule: NgRule, title: string, boardId: string, threadId: string): boolean {
  if (rule.target !== NgTarget.Thread) return false;
  if (!rule.enabled) return false;
  if (rule.boardId !== undefined && rule.boardId !== boardId) return false;
  if (rule.threadId !== undefined) return rule.threadId === threadId;
  if (rule.matchMode === 'regexp') {
    const pattern = rule.tokens[0];
    if (pattern === undefined) return false;
    try { return new RegExp(pattern, 'i').test(title); } catch { return false; }
  }
  return rule.tokens.every((t) => title.includes(t));
}

export function ThreadList(): React.JSX.Element {
  const selectedBoard = useBBSStore((s) => s.selectedBoard);
  const subjects = useBBSStore((s) => s.subjects);
  const threadIndices = useBBSStore((s) => s.threadIndices);
  const subjectLoading = useBBSStore((s) => s.subjectLoading);
  const openThread = useBBSStore((s) => s.openThread);
  const addFavorite = useBBSStore((s) => s.addFavorite);
  const removeFavorite = useBBSStore((s) => s.removeFavorite);
  const favorites = useBBSStore((s) => s.favorites);
  const selectBoard = useBBSStore((s) => s.selectBoard);
  const ngRules = useBBSStore((s) => s.ngRules);
  const addNgRule = useBBSStore((s) => s.addNgRule);
  const boardTabs = useBBSStore((s) => s.boardTabs);
  const activeBoardTabId = useBBSStore((s) => s.activeBoardTabId);
  const setActiveBoardTab = useBBSStore((s) => s.setActiveBoardTab);
  const closeBoardTab = useBBSStore((s) => s.closeBoardTab);
  const refreshSelectedBoard = useBBSStore((s) => s.refreshSelectedBoard);

  const [sortKey, setSortKey] = useState<SortKey>('index');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState('');
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  const [boardTabCtxMenu, setBoardTabCtxMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [edgeRefreshing, setEdgeRefreshing] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const handleScrollKeyboard = useScrollKeyboard(listScrollRef);
  const edgeRefreshUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeRefreshLockedRef = useRef(false);

  // Close board tab context menu on click
  useEffect(() => {
    if (boardTabCtxMenu === null) return;
    const handler = (): void => { setBoardTabCtxMenu(null); };
    document.addEventListener('click', handler);
    return () => { document.removeEventListener('click', handler); };
  }, [boardTabCtxMenu]);

  // Close context menu on click
  useEffect(() => {
    if (ctxMenu === null) return;
    const handler = (): void => { setCtxMenu(null); };
    document.addEventListener('click', handler);
    return () => { document.removeEventListener('click', handler); };
  }, [ctxMenu]);

  // Build index maps for AgeSage and new count lookup
  const indexMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const idx of threadIndices) {
      map.set(idx.fileName, idx.ageSage);
    }
    return map;
  }, [threadIndices]);

  const newCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const idx of threadIndices) {
      if (idx.newResCount > 0) {
        map.set(idx.fileName, idx.newResCount);
      }
    }
    return map;
  }, [threadIndices]);

  // Build favorite lookup (thread URLs already in favorites)
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

  // Thread-level NG rules
  const threadNgRules = useMemo(() =>
    ngRules.filter((r) => r.target === NgTarget.Thread && r.enabled),
  [ngRules]);

  // Extract boardId for NG matching
  const currentBoardId = useMemo(() => {
    if (selectedBoard === null) return '';
    try {
      const segments = new URL(selectedBoard.url).pathname.split('/').filter((s) => s.length > 0);
      return segments[segments.length - 1] ?? '';
    } catch {
      return '';
    }
  }, [selectedBoard]);

  // Deduplicate subjects by fileName to prevent duplicate threads from appearing
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

    // Text filter
    if (filter.trim().length > 0) {
      const lower = filter.toLowerCase();
      result = result.filter((s) => s.title.toLowerCase().includes(lower));
    }

    // Thread NG filter
    if (threadNgRules.length > 0 && currentBoardId.length > 0) {
      result = result.filter((s) => {
        const threadId = s.fileName.replace('.dat', '');
        for (const rule of threadNgRules) {
          if (matchesThreadNg(rule, s.title, currentBoardId, threadId)) {
            // For transparent abon, completely hide
            if (rule.abonType === AbonType.Transparent) return false;
          }
        }
        return true;
      });
    }

    return result;
  }, [uniqueSubjects, filter, threadNgRules, currentBoardId]);

  // Check if a thread is NG'd (normal abon - show as placeholder)
  const normalAbonThreads = useMemo(() => {
    if (threadNgRules.length === 0 || currentBoardId.length === 0) return new Set<string>();
    const set = new Set<string>();
    for (const s of subjects) {
      const threadId = s.fileName.replace('.dat', '');
      for (const rule of threadNgRules) {
        if (matchesThreadNg(rule, s.title, currentBoardId, threadId) && rule.abonType === AbonType.Normal) {
          set.add(s.fileName);
          break;
        }
      }
    }
    return set;
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
        case 'newCount': {
          const na = newCountMap.get(a.fileName) ?? 0;
          const nb = newCountMap.get(b.fileName) ?? 0;
          cmp = na - nb;
          break;
        }
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return items;
  }, [filteredSubjects, sortKey, sortDir, newCountMap]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const handleOpenThread = useCallback(
    (subject: SubjectRecord) => {
      if (selectedBoard === null) return;
      const threadId = subject.fileName.replace('.dat', '');
      void openThread(selectedBoard.url, threadId, subject.title);
    },
    [selectedBoard, openThread],
  );

  const buildThreadUrl = useCallback(
    (subject: SubjectRecord): string => {
      if (selectedBoard === null) return '';
      const threadId = subject.fileName.replace('.dat', '');
      return `${selectedBoard.url}dat/${threadId}.dat`;
    },
    [selectedBoard],
  );

  const handleAddFavorite = useCallback(
    (e: React.MouseEvent, subject: SubjectRecord) => {
      e.stopPropagation();
      if (selectedBoard === null) return;
      const threadId = subject.fileName.replace('.dat', '');
      const threadUrl = `${selectedBoard.url}dat/${threadId}.dat`;
      const node: FavItem = {
        id: `fav-${threadId}-${String(Date.now())}`,
        kind: 'item',
        type: 'thread',
        boardType: selectedBoard.boardType ?? BoardType.Type2ch,
        url: threadUrl,
        title: subject.title,
      };
      void addFavorite(node);
    },
    [selectedBoard, addFavorite],
  );

  const handleRemoveFavorite = useCallback(
    (subject: SubjectRecord) => {
      const threadUrl = buildThreadUrl(subject);
      const favId = favoriteUrlToId.get(threadUrl);
      if (favId !== undefined) {
        void removeFavorite(favId);
      }
    },
    [buildThreadUrl, favoriteUrlToId, removeFavorite],
  );

  const handleRefresh = useCallback(() => {
    if (selectedBoard === null || subjectLoading) return;
    void refreshSelectedBoard();
  }, [selectedBoard, subjectLoading, refreshSelectedBoard]);

  const handleListWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = listScrollRef.current;
    if (container === null) return;
    if (edgeRefreshLockedRef.current || subjectLoading || selectedBoard === null) return;

    const atTop = container.scrollTop <= 0;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 5;
    const scrollingUp = e.deltaY < 0;
    const scrollingDown = e.deltaY > 0;

    if ((atTop && scrollingUp) || (atBottom && scrollingDown)) {
      edgeRefreshLockedRef.current = true;
      setEdgeRefreshing(true);
      void refreshSelectedBoard().finally(() => { setEdgeRefreshing(false); });

      if (edgeRefreshUnlockTimerRef.current !== null) {
        clearTimeout(edgeRefreshUnlockTimerRef.current);
      }
      edgeRefreshUnlockTimerRef.current = setTimeout(() => {
        edgeRefreshLockedRef.current = false;
        edgeRefreshUnlockTimerRef.current = null;
      }, 1200);
    }
  }, [subjectLoading, selectedBoard, refreshSelectedBoard]);

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

  const handleCtxAddFav = useCallback(() => {
    if (ctxMenu !== null) {
      const fakeEvent = { stopPropagation: () => undefined } as React.MouseEvent;
      handleAddFavorite(fakeEvent, ctxMenu.subject);
    }
    setCtxMenu(null);
  }, [ctxMenu, handleAddFavorite]);

  const handleCtxRemoveFav = useCallback(() => {
    if (ctxMenu !== null) {
      handleRemoveFavorite(ctxMenu.subject);
    }
    setCtxMenu(null);
  }, [ctxMenu, handleRemoveFavorite]);

  const handleCtxNgNormal = useCallback(() => {
    if (ctxMenu !== null && selectedBoard !== null) {
      const threadId = ctxMenu.subject.fileName.replace('.dat', '');
      const rule: NgRule = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        target: NgTarget.Thread,
        abonType: AbonType.Normal,
        matchMode: 'plain',
        tokens: [ctxMenu.subject.title],
        boardId: currentBoardId.length > 0 ? currentBoardId : undefined,
        threadId,
        enabled: true,
      };
      void addNgRule(rule);
    }
    setCtxMenu(null);
  }, [ctxMenu, selectedBoard, currentBoardId, addNgRule]);

  const handleCtxNgTransparent = useCallback(() => {
    if (ctxMenu !== null && selectedBoard !== null) {
      const threadId = ctxMenu.subject.fileName.replace('.dat', '');
      const rule: NgRule = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        target: NgTarget.Thread,
        abonType: AbonType.Transparent,
        matchMode: 'plain',
        tokens: [ctxMenu.subject.title],
        boardId: currentBoardId.length > 0 ? currentBoardId : undefined,
        threadId,
        enabled: true,
      };
      void addNgRule(rule);
    }
    setCtxMenu(null);
  }, [ctxMenu, selectedBoard, currentBoardId, addNgRule]);

  const SortHeader = useCallback(
    ({ label, field }: { readonly label: string; readonly field: SortKey }) => (
      <button
        type="button"
        onClick={() => { handleSort(field); }}
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

  const handleCloseBoardTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      closeBoardTab(tabId);
    },
    [closeBoardTab],
  );

  const handleBoardTabContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setBoardTabCtxMenu({ x: e.clientX, y: e.clientY, tabId });
    },
    [],
  );

  const handleAddBoardToRound = useCallback(() => {
    if (boardTabCtxMenu === null) return;
    const bt = boardTabs.find((t) => t.id === boardTabCtxMenu.tabId);
    if (bt === undefined) return;
    void window.electronApi.invoke('round:add-board', {
      url: bt.board.url,
      boardTitle: bt.board.title,
      roundName: '',
    });
    setBoardTabCtxMenu(null);
  }, [boardTabCtxMenu, boardTabs]);

  const handleBoardTabRefresh = useCallback(() => {
    if (boardTabCtxMenu === null) return;
    const bt = boardTabs.find((t) => t.id === boardTabCtxMenu.tabId);
    if (bt === undefined || subjectLoading) return;
    void selectBoard(bt.board).then(() => {
      void refreshSelectedBoard();
    });
    setBoardTabCtxMenu(null);
  }, [boardTabCtxMenu, boardTabs, subjectLoading, selectBoard, refreshSelectedBoard]);

  useEffect(() => {
    return () => {
      if (edgeRefreshUnlockTimerRef.current !== null) {
        clearTimeout(edgeRefreshUnlockTimerRef.current);
      }
    };
  }, []);

  // F24: Add board tab to favorites
  const handleAddBoardToFavorite = useCallback(() => {
    if (boardTabCtxMenu === null) return;
    const bt = boardTabs.find((t) => t.id === boardTabCtxMenu.tabId);
    if (bt === undefined) return;
    const node: FavItem = {
      id: `fav-board-${String(Date.now())}`,
      kind: 'item',
      type: 'board',
      boardType: bt.board.boardType ?? BoardType.Type2ch,
      url: bt.board.url,
      title: bt.board.title,
    };
    void addFavorite(node);
    setBoardTabCtxMenu(null);
  }, [boardTabCtxMenu, boardTabs, addFavorite]);

  return (
    <section className="relative flex h-full min-w-0 flex-1 flex-col" onKeyDown={handleScrollKeyboard}>
      {/* Board tabs */}
      {boardTabs.length > 0 && (
        <div className="flex h-7 items-center border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)]">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {boardTabs.map((bt) => (
              <div
                key={bt.id}
                role="tab"
                tabIndex={0}
                onClick={() => { setActiveBoardTab(bt.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveBoardTab(bt.id); }}
                onContextMenu={(e) => { handleBoardTabContextMenu(e, bt.id); }}
                className={`group flex max-w-36 shrink-0 cursor-pointer items-center gap-1 rounded-t px-2 py-0.5 text-xs ${
                  bt.id === activeBoardTabId
                    ? 'bg-[var(--color-bg-active)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]'
                }`}
                aria-selected={bt.id === activeBoardTabId}
              >
                <span className="truncate">{bt.board.title}</span>
                <button
                  type="button"
                  onClick={(e) => { handleCloseBoardTab(e, bt.id); }}
                  className="ml-0.5 rounded p-0.5 opacity-0 hover:bg-[var(--color-bg-tertiary)] group-hover:opacity-100"
                  aria-label="板タブを閉じる"
                >
                  <MdiIcon path={mdiClose} size={9} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header with board title and refresh */}
      <div className="flex h-8 items-center gap-2 border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-3">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--color-text-secondary)]">
          {selectedBoard !== null ? selectedBoard.title : 'スレッド一覧'}
        </span>
        {subjectLoading && <MdiIcon path={mdiLoading} size={12} className="animate-spin text-[var(--color-accent)]" />}
        {subjects.length > 0 && (
          <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{subjects.length} スレッド</span>
        )}
        {selectedBoard !== null && (
          <button
            type="button"
            onClick={handleRefresh}
            className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            title="スレッド一覧を再取得"
          >
            <MdiIcon path={subjectLoading ? mdiLoading : mdiRefresh} size={12} className={subjectLoading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Filter input */}
      {subjects.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)]/30 px-3 py-1">
          <MdiIcon path={mdiMagnify} size={12} className="shrink-0 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); }}
            placeholder="スレッドを検索..."
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          {filter.length > 0 && (
            <>
              <span className="text-xs text-[var(--color-text-muted)]">{filteredSubjects.length} 件</span>
              <button
                type="button"
                onClick={() => { setFilter(''); }}
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
        <div className="w-10 text-right">
          <SortHeader label="新着" field="newCount" />
        </div>
        <div className="w-12 text-right">
          <SortHeader label="レス" field="count" />
        </div>
        <div className="w-6" />
      </div>

      {/* Thread rows */}
      <div ref={listScrollRef} className="relative flex-1 overflow-y-auto" onWheel={handleListWheel}>
        {selectedBoard === null && (
          <p className="p-4 text-center text-xs text-[var(--color-text-muted)]">板を選択してください</p>
        )}
        {sortedSubjects.map((subject, i) => {
          const threadId = subject.fileName.replace('.dat', '');
          const newCount = newCountMap.get(subject.fileName);
          const threadUrl = selectedBoard !== null ? `${selectedBoard.url}dat/${threadId}.dat` : '';
          const isFavorite = favoriteUrlToId.has(threadUrl);
          const isNormalAbon = normalAbonThreads.has(subject.fileName);

          if (isNormalAbon) {
            return (
              <div
                key={subject.fileName}
                className="flex w-full items-center gap-1 border-b border-[var(--color-border-secondary)] px-3 py-1 text-xs opacity-40"
                onContextMenu={(e) => { handleContextMenu(e, subject); }}
              >
                <span className="w-8 shrink-0 text-[var(--color-text-muted)]">{String(i + 1)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--color-res-abon)]">あぼーん</span>
              </div>
            );
          }

          return (
            <button
              key={subject.fileName}
              type="button"
              onClick={() => { handleOpenThread(subject); }}
              onContextMenu={(e) => { handleContextMenu(e, subject); }}
              className="flex w-full items-center gap-1 border-b border-[var(--color-border-secondary)] px-3 py-1 text-left text-xs hover:bg-[var(--color-bg-secondary)]"
            >
              <span className="w-8 shrink-0 text-[var(--color-text-muted)]">{String(i + 1)}</span>
              <span className="w-5 shrink-0">{ageSageBadge(indexMap.get(subject.fileName))}</span>
              <span className="min-w-0 flex-1 truncate text-[var(--color-text-secondary)]">{subject.title}</span>
              <span className="w-12 shrink-0 text-right text-[var(--color-text-muted)]">
                {subject.ikioi >= 1 ? String(Math.round(subject.ikioi)) : subject.ikioi.toFixed(1)}
              </span>
              <span className="w-10 shrink-0 text-right text-[var(--color-text-muted)]">
                {subject.completionRate >= 100
                  ? '100%'
                  : `${subject.completionRate.toFixed(0)}%`}
              </span>
              <span className="w-16 shrink-0 text-right text-[var(--color-text-muted)]">
                {formatTimestamp(subject.firstPostTs)}
              </span>
              <span className="w-10 shrink-0 text-right">
                {newCount !== undefined && newCount > 0 && (
                  <span className="rounded bg-[var(--color-accent)] px-1 py-0.5 text-[10px] font-bold text-white">
                    +{newCount}
                  </span>
                )}
              </span>
              <span className="w-12 shrink-0 text-right text-[var(--color-text-muted)]">{subject.count}</span>
              <span
                className="w-6 shrink-0 cursor-pointer text-center"
                onClick={(e) => { handleAddFavorite(e, subject); }}
                role="button"
                tabIndex={-1}
                title={isFavorite ? 'お気に入り済み' : 'お気に入りに追加'}
              >
                <MdiIcon
                  path={isFavorite ? mdiStar : mdiStarOutline}
                  size={12}
                  className={isFavorite ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-warning)]'}
                />
              </span>
            </button>
          );
        })}
      </div>

      {edgeRefreshing && <RefreshOverlay />}

      {/* Board tab context menu (F13 + F24) */}
      {boardTabCtxMenu !== null && (
        <div
          className="fixed z-50 min-w-40 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ left: boardTabCtxMenu.x, top: boardTabCtxMenu.y }}
          role="menu"
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleBoardTabRefresh}
            role="menuitem"
          >
            更新
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleAddBoardToFavorite}
            role="menuitem"
          >
            お気に入りに追加
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleAddBoardToRound}
            role="menuitem"
          >
            巡回に追加
          </button>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu !== null && (
        <div
          className="fixed z-50 min-w-48 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleRefresh}
            role="menuitem"
          >
            更新
          </button>
          <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
          {ctxMenu.isFavorite ? (
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              onClick={handleCtxRemoveFav}
              role="menuitem"
            >
              お気に入りから削除
            </button>
          ) : (
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              onClick={handleCtxAddFav}
              role="menuitem"
            >
              お気に入りに追加
            </button>
          )}
          <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleCtxNgNormal}
            role="menuitem"
          >
            NGスレッド (通常あぼーん)
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleCtxNgTransparent}
            role="menuitem"
          >
            NGスレッド (透明あぼーん)
          </button>
        </div>
      )}
    </section>
  );
}
