/**
 * Generic modal overlay component.
 * Renders children inside a centered dialog with backdrop.
 * Supports optional resizing via corner drag handle.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_MODAL_WIDTH = 300;
const MIN_MODAL_HEIGHT = 200;

interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly width?: string | undefined;
  /** Enable corner-drag resizing. Requires initialWidth & initialHeight. */
  readonly resizable?: boolean | undefined;
  /** Pixel width on first open (used only when resizable is true). */
  readonly initialWidth?: number | undefined;
  /** Pixel height on first open (used only when resizable is true). */
  readonly initialHeight?: number | undefined;
}

export function Modal({
  open,
  onClose,
  children,
  width = 'max-w-lg',
  resizable,
  initialWidth,
  initialHeight,
}: ModalProps): React.JSX.Element | null {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Resizable dimensions
  const [modalW, setModalW] = useState(initialWidth ?? 500);
  const [modalH, setModalH] = useState(initialHeight ?? 400);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  /** Timestamp of last resize mouseUp — used to suppress backdrop close right after resize. */
  const resizeEndTime = useRef(0);

  // Reset dimensions when modal re-opens with new initial values
  useEffect(() => {
    if (open && resizable === true) {
      setModalW(initialWidth ?? 500);
      setModalH(initialHeight ?? 400);
    }
  }, [open, resizable, initialWidth, initialHeight]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (dragging.current) return;
      if (resizable === true && Date.now() - resizeEndTime.current < 300) return;
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose, resizable],
  );

  /** Prevent mouseDown inside modal content from contributing to a backdrop click event. */
  const stopMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  // Resize drag handlers
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY, w: modalW, h: modalH };
      document.body.style.cursor = 'se-resize';
      document.body.style.userSelect = 'none';
    },
    [modalW, modalH],
  );

  useEffect(() => {
    if (!open || resizable !== true) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setModalW(Math.max(MIN_MODAL_WIDTH, dragStart.current.w + dx));
      setModalH(Math.max(MIN_MODAL_HEIGHT, dragStart.current.h + dy));
    };

    const handleMouseUp = (): void => {
      if (dragging.current) {
        dragging.current = false;
        resizeEndTime.current = Date.now();
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [open, resizable]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      {resizable === true ? (
        <div
          className="relative animate-[fadeIn_0.15s_ease-out]"
          style={{ width: modalW, height: modalH }}
          onMouseDown={stopMouseDown}
        >
          <div className="flex h-full w-full flex-col overflow-hidden">
            {children}
          </div>
          {/* Corner resize handle */}
          <div
            onMouseDown={handleResizeMouseDown}
            className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize"
            aria-label="リサイズ"
            role="separator"
          >
            <svg viewBox="0 0 16 16" className="h-full w-full text-[var(--color-text-muted)] opacity-60">
              <path d="M14 14L14 8M14 14L8 14M10 14L14 10" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </div>
        </div>
      ) : (
        <div className={`${width} mx-4 w-full animate-[fadeIn_0.15s_ease-out]`} onMouseDown={stopMouseDown}>
          {children}
        </div>
      )}
    </div>
  );
}
