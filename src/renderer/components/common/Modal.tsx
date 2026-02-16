/**
 * Generic modal overlay component.
 * Renders children inside a centered dialog with backdrop.
 */
import { useCallback, useEffect, useRef } from 'react';

interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
  readonly width?: string;
}

export function Modal({ open, onClose, children, width = 'max-w-lg' }: ModalProps): React.JSX.Element | null {
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === backdropRef.current) {
        onClose();
      }
    },
    [onClose],
  );

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

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      <div className={`${width} mx-4 w-full animate-[fadeIn_0.15s_ease-out]`}>
        {children}
      </div>
    </div>
  );
}
