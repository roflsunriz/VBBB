/**
 * Vertical resize handle for adjustable pane widths.
 * Renders a thin draggable divider between panes.
 */
import { useCallback, useRef, useEffect } from 'react';

interface ResizeHandleProps {
  /** Called with delta-x (pixels) while dragging */
  readonly onResize: (deltaX: number) => void;
  /** Called when drag ends */
  readonly onResizeEnd?: () => void;
}

export function ResizeHandle({ onResize, onResizeEnd }: ResizeHandleProps): React.JSX.Element {
  const dragging = useRef(false);
  const lastX = useRef(0);
  const onResizeRef = useRef(onResize);
  const onResizeEndRef = useRef(onResizeEnd);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);
  useEffect(() => {
    onResizeEndRef.current = onResizeEnd;
  }, [onResizeEnd]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    const delta = e.clientX - lastX.current;
    lastX.current = e.clientX;
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
      lastX.current = e.clientX;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [handleMouseMove, handleMouseUp],
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="group relative z-10 w-1 shrink-0 cursor-col-resize"
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-y-0 -left-0.5 w-2 group-hover:bg-[var(--color-accent)]/20" />
      <div className="h-full w-px bg-[var(--color-border-primary)] group-hover:bg-[var(--color-accent)]" />
    </div>
  );
}
