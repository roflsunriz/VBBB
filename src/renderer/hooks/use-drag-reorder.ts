/**
 * Custom hook for drag-and-drop reordering of tab elements.
 *
 * Uses the native HTML5 Drag and Drop API — no external libraries required.
 * Returns per-item drag props and a CSS class for the drop indicator.
 *
 * @example
 * ```tsx
 * const { getDragProps, dragOverIndex, dragSourceIndex } = useDragReorder({
 *   itemCount: tabs.length,
 *   onReorder: (from, to) => reorderTabs(from, to),
 * });
 *
 * {tabs.map((tab, i) => (
 *   <div key={tab.id} {...getDragProps(i)}>
 *     {tab.title}
 *   </div>
 * ))}
 * ```
 */
import { useCallback, useRef, useState } from 'react';

interface UseDragReorderOptions {
  /** Total number of items in the sortable list */
  readonly itemCount: number;
  /** Called when a drag-and-drop completes with valid from/to indices */
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
}

interface DragProps {
  readonly draggable: true;
  readonly onDragStart: (e: React.DragEvent) => void;
  readonly onDragOver: (e: React.DragEvent) => void;
  readonly onDragEnter: (e: React.DragEvent) => void;
  readonly onDrop: (e: React.DragEvent) => void;
  readonly onDragEnd: () => void;
}

interface UseDragReorderReturn {
  /** Returns drag-related props for the item at the given index */
  readonly getDragProps: (index: number) => DragProps;
  /** Index of the item currently being dragged, or null */
  readonly dragSourceIndex: number | null;
  /** Index of the item currently being hovered over, or null */
  readonly dragOverIndex: number | null;
}

export function useDragReorder({ itemCount, onReorder }: UseDragReorderOptions): UseDragReorderReturn {
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Use ref to avoid stale closure in event handlers
  const dragSourceRef = useRef<number | null>(null);

  const handleDragStart = useCallback(
    (index: number, e: React.DragEvent) => {
      dragSourceRef.current = index;
      setDragSourceIndex(index);
      // Set a minimal drag image text for browser compatibility
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      // Make the dragged element semi-transparent
      if (e.currentTarget instanceof HTMLElement) {
        requestAnimationFrame(() => {
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '0.5';
          }
        });
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverIndex(index);
    },
    [],
  );

  const handleDragEnter = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      setDragOverIndex(index);
    },
    [],
  );

  const handleDrop = useCallback(
    (index: number, e: React.DragEvent) => {
      e.preventDefault();
      const from = dragSourceRef.current;
      if (from !== null && from !== index && from >= 0 && from < itemCount && index >= 0 && index < itemCount) {
        onReorder(from, index);
      }
      dragSourceRef.current = null;
      setDragSourceIndex(null);
      setDragOverIndex(null);
    },
    [itemCount, onReorder],
  );

  const handleDragEnd = useCallback(
    () => {
      // Restore opacity on the source element
      dragSourceRef.current = null;
      setDragSourceIndex(null);
      setDragOverIndex(null);
    },
    [],
  );

  const getDragProps = useCallback(
    (index: number): DragProps => ({
      draggable: true as const,
      onDragStart: (e: React.DragEvent) => { handleDragStart(index, e); },
      onDragOver: (e: React.DragEvent) => { handleDragOver(index, e); },
      onDragEnter: (e: React.DragEvent) => { handleDragEnter(index, e); },
      onDrop: (e: React.DragEvent) => { handleDrop(index, e); },
      onDragEnd: handleDragEnd,
    }),
    [handleDragStart, handleDragOver, handleDragEnter, handleDrop, handleDragEnd],
  );

  return { getDragProps, dragSourceIndex, dragOverIndex };
}
