/**
 * Board tree panel (左ペイン).
 * Displays categories and boards in a collapsible tree.
 * Supports right-click context menu for favorites and board NG.
 */
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  mdiFolderOpen,
  mdiFolder,
  mdiBulletinBoard,
  mdiRefresh,
  mdiLoading,
  mdiMagnify,
  mdiClose,
} from '@mdi/js';
import type { Board, Category } from '@shared/domain';
import { BoardType } from '@shared/domain';
import type { FavItem, FavNode } from '@shared/favorite';
import { AbonType, NgTarget } from '@shared/ng';
import type { NgRule } from '@shared/ng';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { useScrollKeyboard } from '../../hooks/use-scroll-keyboard';

/** Context menu state */
interface BoardCtxMenu {
  readonly x: number;
  readonly y: number;
  readonly board: Board;
  readonly isFavorite: boolean;
}

function CategoryNode({
  category,
  onSelectBoard,
  selectedBoardUrl,
  onContextMenu,
  boardNgSet,
  boardNormalAbonSet,
}: {
  readonly category: Category;
  readonly onSelectBoard: (board: Board) => void;
  readonly selectedBoardUrl: string | null;
  readonly onContextMenu: (e: React.MouseEvent, board: Board) => void;
  readonly boardNgSet: ReadonlySet<string>;
  readonly boardNormalAbonSet: ReadonlySet<string>;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // Filter boards: transparent NG = hidden, normal NG = placeholder
  const visibleBoards = useMemo(() =>
    category.boards.filter((b) => !boardNgSet.has(b.bbsId)),
  [category.boards, boardNgSet]);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs hover:bg-[var(--color-bg-hover)]"
      >
        <MdiIcon path={expanded ? mdiFolderOpen : mdiFolder} size={14} className="text-[var(--color-warning)]" />
        <span className="truncate font-medium text-[var(--color-text-secondary)]">{category.name}</span>
        <span className="ml-auto text-[var(--color-text-muted)]">{visibleBoards.length}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {visibleBoards.map((board) => {
            const isNormalAbon = boardNormalAbonSet.has(board.bbsId);
            if (isNormalAbon) {
              return (
                <div
                  key={board.url}
                  className="flex w-full items-center gap-1 rounded px-2 py-0.5 text-xs opacity-40"
                  onContextMenu={(e) => { onContextMenu(e, board); }}
                >
                  <MdiIcon path={mdiBulletinBoard} size={12} className="text-[var(--color-text-muted)]" />
                  <span className="truncate text-[var(--color-res-abon)]">あぼーん</span>
                </div>
              );
            }
            return (
              <button
                key={board.url}
                type="button"
                onClick={() => { onSelectBoard(board); }}
                onContextMenu={(e) => { onContextMenu(e, board); }}
                className={`flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-xs hover:bg-[var(--color-bg-hover)] ${
                  selectedBoardUrl === board.url
                    ? 'bg-[var(--color-bg-active)] text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                <MdiIcon path={mdiBulletinBoard} size={12} className="text-[var(--color-text-muted)]" />
                <span className="truncate">{board.title}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BoardTree(): React.JSX.Element {
  const menu = useBBSStore((s) => s.menu);
  const menuLoading = useBBSStore((s) => s.menuLoading);
  const selectedBoard = useBBSStore((s) => s.selectedBoard);
  const fetchMenu = useBBSStore((s) => s.fetchMenu);
  const selectBoard = useBBSStore((s) => s.selectBoard);
  const addFavorite = useBBSStore((s) => s.addFavorite);
  const removeFavorite = useBBSStore((s) => s.removeFavorite);
  const favorites = useBBSStore((s) => s.favorites);
  const ngRules = useBBSStore((s) => s.ngRules);
  const addNgRule = useBBSStore((s) => s.addNgRule);
  const externalBoards = useBBSStore((s) => s.externalBoards);
  const removeExternalBoard = useBBSStore((s) => s.removeExternalBoard);

  const [ctxMenu, setCtxMenu] = useState<BoardCtxMenu | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleScrollKeyboard = useScrollKeyboard(scrollContainerRef);

  // Close context menu on click
  useEffect(() => {
    if (ctxMenu === null) return;
    const handler = (): void => { setCtxMenu(null); };
    document.addEventListener('click', handler);
    return () => { document.removeEventListener('click', handler); };
  }, [ctxMenu]);

  // Clamp context menu position within viewport
  useEffect(() => {
    const el = ctxMenuRef.current;
    if (ctxMenu === null || el === null) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = ctxMenu.x;
    let y = ctxMenu.y;
    if (x + rect.width > vw) x = vw - rect.width - 4;
    if (y + rect.height > vh) y = vh - rect.height - 4;
    if (x < 0) x = 4;
    if (y < 0) y = 4;
    el.style.left = `${String(x)}px`;
    el.style.top = `${String(y)}px`;
  }, [ctxMenu]);

  // Build favorite board URL set and URL-to-ID map
  const favoriteUrlToId = useMemo(() => {
    const map = new Map<string, string>();
    const walk = (nodes: readonly FavNode[]): void => {
      for (const node of nodes) {
        if (node.kind === 'item' && node.type === 'board') {
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

  const favoriteUrls = useMemo(() => new Set(favoriteUrlToId.keys()), [favoriteUrlToId]);

  // Board-level NG rules
  const boardNgRules = useMemo(() =>
    ngRules.filter((r) => r.target === NgTarget.Board && r.enabled),
  [ngRules]);

  // Sets of NG board IDs by type
  const boardNgTransparentSet = useMemo(() => {
    const set = new Set<string>();
    for (const rule of boardNgRules) {
      if (rule.abonType === AbonType.Transparent && rule.boardId !== undefined) {
        set.add(rule.boardId);
      }
    }
    return set;
  }, [boardNgRules]);

  const boardNgNormalSet = useMemo(() => {
    const set = new Set<string>();
    for (const rule of boardNgRules) {
      if (rule.abonType === AbonType.Normal && rule.boardId !== undefined) {
        set.add(rule.boardId);
      }
    }
    return set;
  }, [boardNgRules]);

  // F20+F33: Merge external boards as a virtual "外部" category and filter
  const filteredCategories = useMemo(() => {
    const baseCats: Category[] = menu !== null ? [...menu.categories] : [];

    // F20: Add external boards as virtual "外部" category
    if (externalBoards.length > 0) {
      baseCats.push({ name: '外部', boards: externalBoards });
    }

    if (searchFilter.trim().length === 0) return baseCats;
    const lower = searchFilter.toLowerCase();
    return baseCats
      .map((cat) => {
        // Match category name
        if (cat.name.toLowerCase().includes(lower)) return cat;
        // Match individual boards
        const matchedBoards = cat.boards.filter((b) => b.title.toLowerCase().includes(lower));
        if (matchedBoards.length === 0) return null;
        return { ...cat, boards: matchedBoards };
      })
      .filter((c): c is Category => c !== null);
  }, [menu, externalBoards, searchFilter]);

  const handleSelectBoard = useCallback(
    (board: Board) => {
      void selectBoard(board);
    },
    [selectBoard],
  );

  const handleFetchMenu = useCallback(() => {
    void fetchMenu();
  }, [fetchMenu]);

  const handleBoardCtxMenu = useCallback(
    (e: React.MouseEvent, board: Board) => {
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({
        x: e.clientX,
        y: e.clientY,
        board,
        isFavorite: favoriteUrls.has(board.url),
      });
    },
    [favoriteUrls],
  );

  const handleCtxAddFav = useCallback(() => {
    if (ctxMenu !== null) {
      const node: FavItem = {
        id: `fav-board-${ctxMenu.board.bbsId}-${String(Date.now())}`,
        kind: 'item',
        type: 'board',
        boardType: ctxMenu.board.boardType ?? BoardType.Type2ch,
        url: ctxMenu.board.url,
        title: ctxMenu.board.title,
      };
      void addFavorite(node);
    }
    setCtxMenu(null);
  }, [ctxMenu, addFavorite]);

  const handleCtxRemoveFav = useCallback(() => {
    if (ctxMenu !== null) {
      const favId = favoriteUrlToId.get(ctxMenu.board.url);
      if (favId !== undefined) {
        void removeFavorite(favId);
      }
    }
    setCtxMenu(null);
  }, [ctxMenu, favoriteUrlToId, removeFavorite]);

  const handleCtxNgNormal = useCallback(() => {
    if (ctxMenu !== null) {
      const rule: NgRule = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        target: NgTarget.Board,
        abonType: AbonType.Normal,
        matchMode: 'plain',
        tokens: [ctxMenu.board.title],
        boardId: ctxMenu.board.bbsId,
        enabled: true,
      };
      void addNgRule(rule);
    }
    setCtxMenu(null);
  }, [ctxMenu, addNgRule]);

  const handleCtxNgTransparent = useCallback(() => {
    if (ctxMenu !== null) {
      const rule: NgRule = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
        target: NgTarget.Board,
        abonType: AbonType.Transparent,
        matchMode: 'plain',
        tokens: [ctxMenu.board.title],
        boardId: ctxMenu.board.bbsId,
        enabled: true,
      };
      void addNgRule(rule);
    }
    setCtxMenu(null);
  }, [ctxMenu, addNgRule]);

  // F20: Check if the context menu board is an external board
  const isCtxExternal = useMemo(() => {
    if (ctxMenu === null) return false;
    return externalBoards.some((b) => b.url === ctxMenu.board.url);
  }, [ctxMenu, externalBoards]);

  const handleCtxRemoveExternal = useCallback(() => {
    if (ctxMenu !== null) {
      removeExternalBoard(ctxMenu.board.url);
    }
    setCtxMenu(null);
  }, [ctxMenu, removeExternalBoard]);

  return (
    <div className="flex h-full flex-col" onKeyDown={handleScrollKeyboard}>
      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] px-2">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">板一覧</span>
        <button
          type="button"
          onClick={handleFetchMenu}
          disabled={menuLoading}
          className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          title="板一覧を更新"
        >
          <MdiIcon
            path={menuLoading ? mdiLoading : mdiRefresh}
            size={14}
            className={menuLoading ? 'animate-spin' : ''}
          />
        </button>
      </div>

      {/* F33: Category search bar */}
      {menu !== null && (
        <div className="flex items-center gap-1 border-b border-[var(--color-border-secondary)] px-2 py-1">
          <MdiIcon path={mdiMagnify} size={11} className="shrink-0 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => { setSearchFilter(e.target.value); }}
            placeholder="カテゴリ・板を検索..."
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
          {searchFilter.length > 0 && (
            <>
              <span className="text-[10px] text-[var(--color-text-muted)]">{filteredCategories.length} カテゴリ</span>
              <button
                type="button"
                onClick={() => { setSearchFilter(''); }}
                className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                aria-label="検索をクリア"
              >
                <MdiIcon path={mdiClose} size={11} />
              </button>
            </>
          )}
        </div>
      )}

      {/* Tree */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-1">
        {menu === null && !menuLoading && (
          <p className="px-2 py-4 text-center text-xs text-[var(--color-text-muted)]">
            更新ボタンで板一覧を取得
          </p>
        )}
        {filteredCategories.map((category) => (
          <CategoryNode
            key={category.name}
            category={category}
            onSelectBoard={handleSelectBoard}
            selectedBoardUrl={selectedBoard?.url ?? null}
            onContextMenu={handleBoardCtxMenu}
            boardNgSet={boardNgTransparentSet}
            boardNormalAbonSet={boardNgNormalSet}
          />
        ))}
      </div>

      {/* Board context menu */}
      {ctxMenu !== null && (
        <div
          ref={ctxMenuRef}
          className="fixed z-50 min-w-48 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
        >
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
            NG板 (通常あぼーん)
          </button>
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleCtxNgTransparent}
            role="menuitem"
          >
            NG板 (透明あぼーん)
          </button>
          {isCtxExternal && (
            <>
              <div className="mx-2 my-0.5 border-t border-[var(--color-border-secondary)]" />
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-error)] hover:bg-[var(--color-bg-hover)]"
                onClick={handleCtxRemoveExternal}
                role="menuitem"
              >
                外部板を削除
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
