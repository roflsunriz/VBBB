/**
 * Horizontal resize handle for adjustable pane heights.
 * Renders a thin draggable divider at the top edge of a panel.
 * Dragging up increases height, dragging down decreases height.
 */
import { useCallback, useRef, useEffect } from 'react';

interface TopResizeHandleProps {
  /** Called with delta-y (pixels) while dragging. Negative = upward, Positive = downward. */
  readonly onResize: (deltaY: number) => void;
  /** Called when drag ends */
  readonly onResizeEnd?: () => void;
}

export function TopResizeHandle({ onResize, onResizeEnd }: TopResizeHandleProps): React.JSX.Element {
  const dragging = useRef(false);
  const lastY = useRef(0);
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);

  useEffect(() => { onResizeRef.current = onResize; }, [onResize]);
  useEffect(() => { onResizeEndRef.current = onResizeEnd; }, [onResizeEnd]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    const delta = e.clientY - lastY.current;
    lastY.current = e.clientY;
    onResizeRef.current(delta);
  }, []);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    onResizeEndRef.current?.();
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      lastY.current = e.clientY;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove, handleMouseUp],
  );

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className="group relative z-10 h-1 shrink-0 cursor-row-resize"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-x-0 -top-0.5 h-2 group-hover:bg-[var(--color-accent)]/20" />
      <div className="h-px w-full bg-[var(--color-border-primary)] group-hover:bg-[var(--color-accent)]" />
    </div>
  );
}
