/**
 * Context menu container that automatically clamps position to stay within the viewport.
 * Prevents menus from extending beyond screen edges.
 */
import { useRef, useEffect } from 'react';

interface ContextMenuContainerProps {
  readonly x: number;
  readonly y: number;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly role?: string;
  readonly onClick?: (e: React.MouseEvent) => void;
}

export function ContextMenuContainer({
  x,
  y,
  children,
  className,
  role,
  onClick,
}: ContextMenuContainerProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let cx = x;
    let cy = y;
    if (cx + rect.width > vw) cx = vw - rect.width - 4;
    if (cy + rect.height > vh) cy = vh - rect.height - 4;
    if (cx < 0) cx = 4;
    if (cy < 0) cy = 4;
    el.style.left = `${String(cx)}px`;
    el.style.top = `${String(cy)}px`;
  });

  return (
    <div
      ref={ref}
      className={className}
      style={{ left: x, top: y }}
      role={role}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
