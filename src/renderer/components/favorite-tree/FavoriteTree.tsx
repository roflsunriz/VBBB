/**
 * Favorite tree panel.
 * Displays bookmarked boards and threads in a tree structure.
 * Supports right-click context menu for deletion.
 */
import { useEffect, useCallback, useState, useMemo, useRef } from 'react';
import {
  mdiStar,
  mdiFolderOpen,
  mdiFolder,
  mdiFolderPlus,
  mdiForumOutline,
  mdiBulletinBoard,
  mdiDelete,
  mdiMagnify,
  mdiClose,
  mdiMinus,
} from '@mdi/js';
import { SearchInputWithHistory } from '../common/SearchInputWithHistory';
import type { FavNode, FavFolder, FavItem } from '@shared/favorite';
import { parseAnyThreadUrl, parseExternalBoardUrl } from '@shared/url-parser';
import { useBBSStore } from '../../stores/bbs-store';
import { MdiIcon } from '../common/MdiIcon';
import { useScrollKeyboard } from '../../hooks/use-scroll-keyboard';
import { ContextMenuContainer } from '../common/ContextMenuContainer';

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
  dnd,
}: {
  readonly item: FavItem;
  readonly depth: number;
  readonly onRemove: (id: string) => void;
  readonly onContextMenu: (e: React.MouseEvent, node: FavNode) => void;
  readonly dnd: DndHandlers;
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
  const isOver = dnd.dragOverId === item.id;

  return (
    <div
      className={`group flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-[var(--color-bg-hover)] ${isOver && dnd.dragOverPos === 'before' ? 'border-t-2 border-[var(--color-accent)]' : ''} ${isOver && dnd.dragOverPos === 'after' ? 'border-b-2 border-[var(--color-accent)]' : ''}`}
      style={{ paddingLeft: `${String(8 + depth * 12)}px` }}
      draggable
      onDragStart={(e) => {
        dnd.onDragStart(e, item.id);
      }}
      onDragOver={(e) => {
        dnd.onDragOver(e, item.id, 'item');
      }}
      onDragLeave={dnd.onDragLeave}
      onDrop={(e) => {
        dnd.onDrop(e, item.id, 'item');
      }}
      onContextMenu={(e) => {
        onContextMenu(e, item);
      }}
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
        onClick={() => {
          onRemove(item.id);
        }}
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
  dnd,
}: {
  readonly folder: FavFolder;
  readonly depth: number;
  readonly onToggle: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onContextMenu: (e: React.MouseEvent, node: FavNode) => void;
  readonly dnd: DndHandlers;
}): React.JSX.Element {
  const isOver = dnd.dragOverId === folder.id;
  return (
    <>
      <div
        className={`group flex items-center gap-1 px-2 py-0.5 text-xs hover:bg-[var(--color-bg-hover)] ${isOver && dnd.dragOverPos === 'before' ? 'border-t-2 border-[var(--color-accent)]' : ''} ${isOver && dnd.dragOverPos === 'inside' ? 'bg-[var(--color-accent)]/10 ring-1 ring-inset ring-[var(--color-accent)]' : ''} ${isOver && dnd.dragOverPos === 'after' ? 'border-b-2 border-[var(--color-accent)]' : ''}`}
        style={{ paddingLeft: `${String(8 + depth * 12)}px` }}
        draggable
        onDragStart={(e) => {
          dnd.onDragStart(e, folder.id);
        }}
        onDragOver={(e) => {
          dnd.onDragOver(e, folder.id, 'folder');
        }}
        onDragLeave={dnd.onDragLeave}
        onDrop={(e) => {
          dnd.onDrop(e, folder.id, 'folder');
        }}
        onContextMenu={(e) => {
          onContextMenu(e, folder);
        }}
      >
        <button
          type="button"
          onClick={() => {
            onToggle(folder.id);
          }}
          className="flex min-w-0 flex-1 items-center gap-1"
        >
          <MdiIcon
            path={folder.expanded ? mdiFolderOpen : mdiFolder}
            size={14}
            className="shrink-0 text-[var(--color-warning)]"
          />
          <span className="truncate font-medium text-[var(--color-text-primary)]">
            {folder.title}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            onRemove(folder.id);
          }}
          className="shrink-0 rounded p-0.5 opacity-0 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-error)] group-hover:opacity-100"
          aria-label="削除"
        >
          <MdiIcon path={mdiDelete} size={12} />
        </button>
      </div>
      {folder.expanded &&
        folder.children.map((child) => (
          <FavNodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            onToggle={onToggle}
            onRemove={onRemove}
            onContextMenu={onContextMenu}
            dnd={dnd}
          />
        ))}
    </>
  );
}

interface DndHandlers {
  readonly onDragStart: (e: React.DragEvent, nodeId: string) => void;
  readonly onDragOver: (e: React.DragEvent, nodeId: string, kind: FavNode['kind']) => void;
  readonly onDragLeave: (e: React.DragEvent) => void;
  readonly onDrop: (e: React.DragEvent, nodeId: string, kind: FavNode['kind']) => void;
  readonly dragOverId: string | null;
  readonly dragOverPos: 'before' | 'inside' | 'after' | null;
}

function FavSeparatorRow({
  id,
  depth,
  onRemove,
  onContextMenu,
  dnd,
}: {
  readonly id: string;
  readonly depth: number;
  readonly onRemove: (id: string) => void;
  readonly onContextMenu: (e: React.MouseEvent, node: FavNode) => void;
  readonly dnd: DndHandlers;
}): React.JSX.Element {
  const node: FavNode = { id, kind: 'separator' };
  const isOver = dnd.dragOverId === id;
  return (
    <div
      className={`group flex items-center px-2 py-0.5 ${isOver && dnd.dragOverPos === 'before' ? 'border-t-2 border-[var(--color-accent)]' : ''} ${isOver && dnd.dragOverPos === 'after' ? 'border-b-2 border-[var(--color-accent)]' : ''}`}
      style={{ paddingLeft: `${String(8 + depth * 12)}px` }}
      draggable
      onDragStart={(e) => {
        dnd.onDragStart(e, id);
      }}
      onDragOver={(e) => {
        dnd.onDragOver(e, id, 'separator');
      }}
      onDragLeave={dnd.onDragLeave}
      onDrop={(e) => {
        dnd.onDrop(e, id, 'separator');
      }}
      onContextMenu={(e) => {
        onContextMenu(e, node);
      }}
    >
      <hr className="flex-1 border-t border-[var(--color-border-secondary)]" />
      <button
        type="button"
        onClick={() => {
          onRemove(id);
        }}
        className="ml-1 shrink-0 rounded p-0.5 opacity-0 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-error)] group-hover:opacity-100"
        aria-label="削除"
      >
        <MdiIcon path={mdiDelete} size={10} />
      </button>
    </div>
  );
}

function FavNodeRow({
  node,
  depth,
  onToggle,
  onRemove,
  onContextMenu,
  dnd,
}: {
  readonly node: FavNode;
  readonly depth: number;
  readonly onToggle: (id: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onContextMenu: (e: React.MouseEvent, node: FavNode) => void;
  readonly dnd: DndHandlers;
}): React.JSX.Element {
  if (node.kind === 'separator') {
    return (
      <FavSeparatorRow
        id={node.id}
        depth={depth}
        onRemove={onRemove}
        onContextMenu={onContextMenu}
        dnd={dnd}
      />
    );
  }
  if (node.kind === 'folder') {
    return (
      <FavFolderRow
        folder={node}
        depth={depth}
        onToggle={onToggle}
        onRemove={onRemove}
        onContextMenu={onContextMenu}
        dnd={dnd}
      />
    );
  }
  return (
    <FavItemRow
      item={node}
      depth={depth}
      onRemove={onRemove}
      onContextMenu={onContextMenu}
      dnd={dnd}
    />
  );
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

/** Recursively filter favorite tree nodes by search term */
function filterFavNodes(nodes: readonly FavNode[], lower: string): readonly FavNode[] {
  const result: FavNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'separator') continue;
    if (node.kind === 'item') {
      if (node.title.toLowerCase().includes(lower)) {
        result.push(node);
      }
    } else {
      const titleMatch = node.title.toLowerCase().includes(lower);
      const filteredChildren = titleMatch ? node.children : filterFavNodes(node.children, lower);
      if (titleMatch || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren, expanded: true });
      }
    }
  }
  return result;
}

/** Collect all folders from the tree (flat list) */
function collectFolders(nodes: readonly FavNode[]): readonly FavFolder[] {
  const result: FavFolder[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      result.push(node);
      result.push(...collectFolders(node.children));
    }
  }
  return result;
}

function computeDragPosition(
  e: React.DragEvent,
  kind: FavNode['kind'],
): 'before' | 'inside' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const ratio = y / rect.height;
  if (kind === 'folder') {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'inside';
  }
  return ratio < 0.5 ? 'before' : 'after';
}

export function FavoriteTree(): React.JSX.Element {
  const favorites = useBBSStore((s) => s.favorites);
  const fetchFavorites = useBBSStore((s) => s.fetchFavorites);
  const saveFavorites = useBBSStore((s) => s.saveFavorites);
  const removeFavorite = useBBSStore((s) => s.removeFavorite);
  const addFavFolder = useBBSStore((s) => s.addFavFolder);
  const addFavSeparator = useBBSStore((s) => s.addFavSeparator);
  const moveFavToFolder = useBBSStore((s) => s.moveFavToFolder);
  const reorderFavorite = useBBSStore((s) => s.reorderFavorite);

  const [searchFilter, setSearchFilter] = useState('');
  const [ctxMenu, setCtxMenu] = useState<FavCtxMenu | null>(null);
  const [folderSubMenu, setFolderSubMenu] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const folderInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const handleScrollKeyboard = useScrollKeyboard(scrollContainerRef);

  // DnD state
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'before' | 'inside' | 'after' | null>(null);

  const filteredChildren = useMemo(() => {
    const trimmed = searchFilter.trim().toLowerCase();
    if (trimmed.length === 0) return favorites.children;
    return filterFavNodes(favorites.children, trimmed);
  }, [favorites.children, searchFilter]);

  const allFolders = useMemo(() => collectFolders(favorites.children), [favorites.children]);

  useEffect(() => {
    void fetchFavorites();
  }, [fetchFavorites]);

  useEffect(() => {
    if (ctxMenu === null) return;
    const handler = (): void => {
      setCtxMenu(null);
      setFolderSubMenu(false);
    };
    document.addEventListener('click', handler);
    return () => {
      document.removeEventListener('click', handler);
    };
  }, [ctxMenu]);

  const handleToggle = useCallback(
    (folderId: string) => {
      const updated = toggleFolderExpand(favorites.children, folderId);
      void saveFavorites({ children: updated });
    },
    [favorites, saveFavorites],
  );

  const handleRemove = useCallback(
    (nodeId: string) => {
      void removeFavorite(nodeId);
    },
    [removeFavorite],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FavNode) => {
    e.preventDefault();
    e.stopPropagation();
    const title = node.kind === 'separator' ? '水平線' : node.title;
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, nodeTitle: title, node });
    setFolderSubMenu(false);
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

  const handleAddFolder = useCallback(() => {
    setIsCreatingFolder(true);
    setNewFolderName('');
    requestAnimationFrame(() => {
      folderInputRef.current?.focus();
    });
  }, []);

  const handleFolderNameSubmit = useCallback(() => {
    const trimmed = newFolderName.trim();
    if (trimmed.length > 0) {
      void addFavFolder(trimmed);
    }
    setIsCreatingFolder(false);
    setNewFolderName('');
  }, [newFolderName, addFavFolder]);

  const handleFolderNameCancel = useCallback(() => {
    setIsCreatingFolder(false);
    setNewFolderName('');
  }, []);

  const handleAddSeparator = useCallback(() => {
    void addFavSeparator();
  }, [addFavSeparator]);

  const handleMoveToFolder = useCallback(
    (folderId: string) => {
      if (ctxMenu !== null) {
        void moveFavToFolder(ctxMenu.nodeId, folderId);
      }
      setCtxMenu(null);
      setFolderSubMenu(false);
    },
    [ctxMenu, moveFavToFolder],
  );

  // DnD handlers
  const handleDragStart = useCallback((e: React.DragEvent, nodeId: string) => {
    setDragNodeId(nodeId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', nodeId);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, nodeId: string, kind: FavNode['kind']) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (nodeId === dragNodeId) return;
      setDragOverId(nodeId);
      setDragOverPos(computeDragPosition(e, kind));
    },
    [dragNodeId],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    const related = e.relatedTarget;
    if (related instanceof Node && e.currentTarget.contains(related)) return;
    setDragOverId(null);
    setDragOverPos(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropId: string, kind: FavNode['kind']) => {
      e.preventDefault();
      if (dragNodeId === null || dragNodeId === dropId) {
        setDragNodeId(null);
        setDragOverId(null);
        setDragOverPos(null);
        return;
      }
      const pos = computeDragPosition(e, kind);
      void reorderFavorite(dragNodeId, dropId, pos);
      setDragNodeId(null);
      setDragOverId(null);
      setDragOverPos(null);
    },
    [dragNodeId, reorderFavorite],
  );

  const dndHandlers: DndHandlers = useMemo(
    () => ({
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      dragOverId,
      dragOverPos,
    }),
    [handleDragStart, handleDragOver, handleDragLeave, handleDrop, dragOverId, dragOverPos],
  );

  return (
    <div className="flex flex-col" onKeyDown={handleScrollKeyboard}>
      {/* Header with create buttons */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border-primary)] px-3 py-1.5">
        <MdiIcon path={mdiStar} size={14} className="text-[var(--color-warning)]" />
        <span className="flex-1 text-xs font-medium text-[var(--color-text-primary)]">
          お気に入り
        </span>
        <button
          type="button"
          onClick={handleAddFolder}
          className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="フォルダを作成"
        >
          <MdiIcon path={mdiFolderPlus} size={14} />
        </button>
        <button
          type="button"
          onClick={handleAddSeparator}
          className="rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
          title="水平線を追加"
        >
          <MdiIcon path={mdiMinus} size={14} />
        </button>
      </div>

      {/* Inline folder name input */}
      {isCreatingFolder && (
        <div className="flex items-center gap-1 border-b border-[var(--color-border-secondary)] px-2 py-1">
          <MdiIcon
            path={mdiFolderPlus}
            size={12}
            className="shrink-0 text-[var(--color-warning)]"
          />
          <input
            ref={folderInputRef}
            type="text"
            value={newFolderName}
            onChange={(e) => {
              setNewFolderName(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleFolderNameSubmit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleFolderNameCancel();
              }
            }}
            onBlur={handleFolderNameSubmit}
            placeholder="フォルダ名を入力..."
            className="min-w-0 flex-1 rounded border border-[var(--color-accent)] bg-[var(--color-bg-primary)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border-secondary)] px-2 py-1">
        <MdiIcon path={mdiMagnify} size={11} className="shrink-0 text-[var(--color-text-muted)]" />
        <SearchInputWithHistory
          value={searchFilter}
          onChange={setSearchFilter}
          storageKey="vbbb-search-history-favorite-tree"
          placeholder="お気に入りを検索..."
          inputClassName="min-w-0 w-full bg-transparent text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
        />
        {searchFilter.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSearchFilter('');
            }}
            className="shrink-0 rounded p-0.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            aria-label="検索をクリア"
          >
            <MdiIcon path={mdiClose} size={11} />
          </button>
        )}
      </div>

      {/* Tree */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {filteredChildren.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-[var(--color-text-muted)]">
            {favorites.children.length === 0
              ? 'お気に入りはありません'
              : '一致するお気に入りはありません'}
          </p>
        ) : (
          filteredChildren.map((node) => (
            <FavNodeRow
              key={node.id}
              node={node}
              depth={0}
              onToggle={handleToggle}
              onRemove={handleRemove}
              onContextMenu={handleContextMenu}
              dnd={dndHandlers}
            />
          ))
        )}
      </div>

      {/* Context menu */}
      {ctxMenu !== null && (
        <ContextMenuContainer
          x={ctxMenu.x}
          y={ctxMenu.y}
          className="fixed z-50 min-w-40 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg"
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
          {ctxMenu.node.kind !== 'folder' && allFolders.length > 0 && (
            <div className="relative">
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                onClick={(e) => {
                  e.stopPropagation();
                  setFolderSubMenu((prev) => !prev);
                }}
                role="menuitem"
              >
                フォルダに移動 &raquo;
              </button>
              {folderSubMenu && (
                <div className="absolute left-full top-0 z-50 min-w-32 rounded border border-[var(--color-border-primary)] bg-[var(--color-bg-secondary)] py-1 shadow-lg">
                  {allFolders.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                      onClick={() => {
                        handleMoveToFolder(f.id);
                      }}
                      role="menuitem"
                    >
                      {f.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-error)] hover:bg-[var(--color-bg-hover)]"
            onClick={handleCtxRemove}
            role="menuitem"
          >
            &quot;
            {ctxMenu.nodeTitle.length > 15
              ? `${ctxMenu.nodeTitle.slice(0, 15)}…`
              : ctxMenu.nodeTitle}
            &quot; を削除
          </button>
        </ContextMenuContainer>
      )}
    </div>
  );
}
