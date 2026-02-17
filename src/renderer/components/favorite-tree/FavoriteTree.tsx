/**
 * Favorite tree panel.
 * Displays bookmarked boards and threads in a tree structure.
 * Supports right-click context menu for deletion.
 */
import { useEffect, useCallback, useState } from 'react';
import { mdiStar, mdiFolderOpen, mdiFolder, mdiForumOutline, mdiBulletinBoard, mdiDelete } from '@mdi/js';
import type { FavNode, FavFolder, FavItem } from '@shared/favorite';
import { parseAnyThreadUrl, parseExternalBoardUrl } from '@shared/url-parser';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';

/** Context menu state for favorite tree */
interface FavCtxMenu {
  readonly x: number;
  readonly y: number;
  readonly nodeId: string;
  readonly nodeTitle: string;
  readonly node: FavNode;
}

function FavItemRow({
  item,
  depth,
  onRemove,
  onContextMenu,
}: {
  readonly item: FavItem;
  readonly depth: number;
  readonly onRemove: (id: string) => void;
  readonly onContextMenu: (e: React.MouseEvent, node: FavNode) => void;
}): React.JSX.Element {
  const selectBoard = useBBSStore((s) => s.selectBoard);
  const openThread = useBBSStore((s) => s.openThread);

  const handleClick = useCallback(() => {
    if (item.type === 'board') {
      const external = parseExternalBoardUrl(item.url);
      if (external !== null) {
        void selectBoard({
          ...external.board,
          title: item.title,
        });
        return;
      }

      try {
        const url = new URL(item.url);
        const segments = url.pathname.split('/').filter((s) => s.length > 0);
        const bbsId = segments[segments.length - 1] ?? '';
        void selectBoard({
          title: item.title,
          url: item.url,
          bbsId,
          serverUrl: `${url.protocol}//${url.host}/`,
          boardType: item.boardType,
        });
      } catch {
        // Invalid URL
      }
    } else {
      const parsed = parseAnyThreadUrl(item.url);
      if (parsed !== null) {
        void (async () => {
          await selectBoard(parsed.board);
          await openThread(parsed.board.url, parsed.threadId, '');
        })();
      }
    }
  }, [item, selectBoard, openThread]);

  const icon = item.type === 'board' ? mdiBulletinBoard : mdiForumOutline;

  return (
    <div
      className="group flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-[var(--color-bg-hover)]"
      style={{ paddingLeft: `${String(8 + depth * 12)}px` }}
      onContextMenu={(e) => { onContextMenu(e, item); }}
    >
      <button
        type="button"
        onClick={handleClick}
        className="flex min-w-0 flex-1 items-center gap-1"
      >
        <MdiIcon path={icon} size={14} className="shrink-0 text-[var(--color-accent)]" />
        <span className="truncate text-[var(--color-text-secondary)]">{item.title}</span>
      </button>
      <button
        type="button"
        onClick={() => { onRemove(item.id); }}
        className="shrink-0 rounded p-0.5 opacity-0 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-error)] group-hover:opacity-100"
        aria-label="削除"
      >
        <MdiIcon path={mdiDelete} size={12} />
      </button>
    </div>
  );
}

function FavFolderRow({
  folder,
  depth,
  onToggle,
  onRemove,
  onContextMenu,
}: {
  readonly folder: FavFolder;
  readonly depth: number;
  readonly onToggle: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onContextMenu: (e: React.MouseEvent, node: FavNode) => void;
}): React.JSX.Element {
  return (
    <>
      <div
        className="group flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-[var(--color-bg-hover)]"
        style={{ paddingLeft: `${String(8 + depth * 12)}px` }}
        onContextMenu={(e) => { onContextMenu(e, folder); }}
      >
        <button
          type="button"
          onClick={() => { onToggle(folder.id); }}
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          <MdiIcon
            path={folder.expanded ? mdiFolderOpen : mdiFolder}
            size={14}
            className="shrink-0 text-[var(--color-warning)]"
          />
          <span className="truncate font-medium text-[var(--color-text-primary)]">{folder.title}</span>
        </button>
        <button
          type="button"
          onClick={() => { onRemove(folder.id); }}
          className="shrink-0 rounded p-0.5 opacity-0 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-error)] group-hover:opacity-100"
          aria-label="削除"
        >
          <MdiIcon path={mdiDelete} size={12} />
        </button>
      </div>
      {folder.expanded && folder.children.map((child) => (
        <FavNodeRow key={child.id} node={child} depth={depth + 1} onToggle={onToggle} onRemove={onRemove} onContextMenu={onContextMenu} />
      ))}
    </>
  );
}

function FavNodeRow({
  node,
  depth,
  onToggle,
  onRemove,
  onContextMenu,
}: {
  readonly node: FavNode;
  readonly depth: number;
  readonly onToggle: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onContextMenu: (e: React.MouseEvent, node: FavNode) => void;
}): React.JSX.Element {
  if (node.kind === 'folder') {
    return <FavFolderRow folder={node} depth={depth} onToggle={onToggle} onRemove={onRemove} onContextMenu={onContextMenu} />;
  }
  return <FavItemRow item={node} depth={depth} onRemove={onRemove} onContextMenu={onContextMenu} />;
}

function toggleFolderExpand(nodes: readonly FavNode[], folderId: string): readonly FavNode[] {
  return nodes.map((node) => {
    if (node.kind === 'folder') {
      if (node.id === folderId) {
        return { ...node, expanded: !node.expanded };
      }
      return { ...node, children: toggleFolderExpand(node.children, folderId) };
    }
    return node;
  });
}

export function FavoriteTree(): React.JSX.Element {
  const favorites = useBBSStore((s) => s.favorites);
  const fetchFavorites = useBBSStore((s) => s.fetchFavorites);
  const saveFavorites = useBBSStore((s) => s.saveFavorites);
  const removeFavorite = useBBSStore((s) => s.removeFavorite);

  const [ctxMenu, setCtxMenu] = useState<FavCtxMenu | null>(null);

  useEffect(() => {
    void fetchFavorites();
  }, [fetchFavorites]);

  // Close context menu on click
  useEffect(() => {
    if (ctxMenu === null) return;
    const handler = (): void => { setCtxMenu(null); };
    document.addEventListener('click', handler);
    return () => { document.removeEventListener('click', handler); };
  }, [ctxMenu]);

  const handleToggle = useCallback((folderId: string) => {
    const updated = toggleFolderExpand(favorites.children, folderId);
    void saveFavorites({ children: updated });
  }, [favorites, saveFavorites]);

  const handleRemove = useCallback((nodeId: string) => {
    void removeFavorite(nodeId);
  }, [removeFavorite]);

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FavNode) => {
    e.preventDefault();
    e.stopPropagation();
    const title = node.kind === 'folder' ? node.title : node.title;
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, nodeTitle: title, node });
  }, []);

  const handleCtxRemove = useCallback(() => {
    if (ctxMenu !== null) {
      void removeFavorite(ctxMenu.nodeId);
    }
    setCtxMenu(null);
  }, [ctxMenu, removeFavorite]);

  const handleCtxAddToRound = useCallback(() => {
    if (ctxMenu === null) return;
    const node = ctxMenu.node;
    if (node.kind === 'item') {
      if (node.type === 'board') {
        void window.electronApi.invoke('round:add-board', {
          url: node.url,
          boardTitle: node.title,
          roundName: '',
        });
      } else {
        void window.electronApi.invoke('round:add-item', {
          url: node.url,
          boardTitle: '',
          fileName: '',
          threadTitle: node.title,
          roundName: '',
        });
      }
    }
    setCtxMenu(null);
  }, [ctxMenu]);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border-primary)] px-3 py-1.5">
        <MdiIcon path={mdiStar} size={14} className="text-[var(--color-warning)]" />
        <span className="text-xs font-medium text-[var(--color-text-primary)]">お気に入り</span>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto">
        {favorites.children.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
            お気に入りはありません
          </p>
        ) : (
          favorites.children.map((node) => (
            <FavNodeRow key={node.id} node={node} depth={0} onToggle={handleToggle} onRemove={handleRemove} onContextMenu={handleContextMenu} />
          ))
        )}
      </div>

      {/* Context menu */}
      {ctxMenu !== null && (
        <div
          className="fixed z-50 min-w-40 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
        >
          {ctxMenu.node.kind === 'item' && (
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              onClick={handleCtxAddToRound}
              role="menuitem"
            >
              巡回に追加
            </button>
          )}
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-error)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleCtxRemove}
            role="menuitem"
          >
            &quot;{ctxMenu.nodeTitle.length > 15 ? `${ctxMenu.nodeTitle.slice(0, 15)}…` : ctxMenu.nodeTitle}&quot; を削除
          </button>
        </div>
      )}
    </div>
  );
}
