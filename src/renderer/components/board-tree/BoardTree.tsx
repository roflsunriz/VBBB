/**
 * Board tree panel (左ペイン).
 * Displays categories and boards in a collapsible tree.
 */
import { useState, useCallback } from 'react';
import {
  mdiFolderOpen,
  mdiFolder,
  mdiBulletinBoard,
  mdiRefresh,
  mdiLoading,
} from '@mdi/js';
import type { Board, Category } from '@shared/domain';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

function CategoryNode({
  category,
  onSelectBoard,
  selectedBoardUrl,
}: {
  readonly category: Category;
  readonly onSelectBoard: (board: Board) => void;
  readonly selectedBoardUrl: string | null;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-1 rounded px-2 py-1 text-left text-xs hover:bg-neutral-700"
      >
        <MdiIcon path={expanded ? mdiFolderOpen : mdiFolder} size={14} className="text-amber-400" />
        <span className="truncate font-medium text-neutral-300">{category.name}</span>
        <span className="ml-auto text-neutral-600">{category.boards.length}</span>
      </button>
      {expanded && (
        <div className="ml-3">
          {category.boards.map((board) => (
            <button
              key={board.url}
              type="button"
              onClick={() => { onSelectBoard(board); }}
              className={`flex w-full items-center gap-1 rounded px-2 py-0.5 text-left text-xs hover:bg-neutral-700 ${
                selectedBoardUrl === board.url ? 'bg-neutral-700 text-blue-400' : 'text-neutral-400'
              }`}
            >
              <MdiIcon path={mdiBulletinBoard} size={12} className="text-neutral-500" />
              <span className="truncate">{board.title}</span>
            </button>
          ))}
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

  const handleSelectBoard = useCallback(
    (board: Board) => {
      void selectBoard(board);
    },
    [selectBoard],
  );

  const handleFetchMenu = useCallback(() => {
    void fetchMenu();
  }, [fetchMenu]);

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-700 bg-neutral-850">
      {/* Header */}
      <div className="flex h-8 items-center justify-between border-b border-neutral-700 bg-neutral-800 px-2">
        <span className="text-xs font-medium text-neutral-400">板一覧</span>
        <button
          type="button"
          onClick={handleFetchMenu}
          disabled={menuLoading}
          className="rounded p-0.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 disabled:opacity-50"
          title="板一覧を更新"
        >
          <MdiIcon
            path={menuLoading ? mdiLoading : mdiRefresh}
            size={14}
            className={menuLoading ? 'animate-spin' : ''}
          />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-1">
        {menu === null && !menuLoading && (
          <p className="px-2 py-4 text-center text-xs text-neutral-500">
            更新ボタンで板一覧を取得
          </p>
        )}
        {menu?.categories.map((category) => (
          <CategoryNode
            key={category.name}
            category={category}
            onSelectBoard={handleSelectBoard}
            selectedBoardUrl={selectedBoard?.url ?? null}
          />
        ))}
      </div>
    </aside>
  );
}
