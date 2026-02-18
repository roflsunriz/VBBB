/**
 * Full-featured image modal / lightbox.
 * Supports: drag to move, zoom in/out, fit to view, original size, save, open in external browser.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  mdiClose,
  mdiMagnifyPlusOutline,
  mdiMagnifyMinusOutline,
  mdiFitToScreen,
  mdiArrowExpandAll,
  mdiContentSave,
  mdiOpenInNew,
} from '@mdi/js';
import { MdiIcon } from '../common/MdiIcon';

interface ImageModalProps {
  readonly url: string;
  /** All image URLs in the context for left/right keyboard navigation */
  readonly allImageUrls?: readonly string[] | undefined;
  readonly onClose: () => void;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;

export function ImageModal({ url, allImageUrls, onClose }: ImageModalProps): React.JSX.Element {
  const [currentUrl, setCurrentUrl] = useState(url);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [fitScale, setFitScale] = useState(1);
  const lastMouse = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const fileName = currentUrl.split('/').pop() ?? 'image.jpg';

  // Calculate fit-to-view scale on load
  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (img === null || container === null) return;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    setNaturalSize({ w: nw, h: nh });

    const cw = container.clientWidth - 80;
    const ch = container.clientHeight - 80;
    const fit = Math.min(1, cw / nw, ch / nh);
    setFitScale(fit);
    setScale(fit);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Keyboard shortcuts (including F19: left/right navigation)
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
      if (e.key === '-') setScale((s) => Math.max(ZOOM_MIN, s - ZOOM_STEP));
      if (e.key === '0') { setScale(1); setPosition({ x: 0, y: 0 }); }

      // Left/Right arrow navigation
      if (allImageUrls !== undefined && allImageUrls.length > 1) {
        const idx = allImageUrls.indexOf(currentUrl);
        if (e.key === 'ArrowLeft' && idx > 0) {
          const prev = allImageUrls[idx - 1];
          if (prev !== undefined) { setCurrentUrl(prev); setScale(1); setPosition({ x: 0, y: 0 }); }
        }
        if (e.key === 'ArrowRight' && idx < allImageUrls.length - 1) {
          const next = allImageUrls[idx + 1];
          if (next !== undefined) { setCurrentUrl(next); setScale(1); setPosition({ x: 0, y: 0 }); }
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); };
  }, [onClose, allImageUrls, currentUrl]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setScale((s) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s + delta)));
  }, []);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragging(true);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent): void => {
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setPosition((p) => ({ x: p.x + dx, y: p.y + dy }));
    };

    const handleMouseUp = (): void => {
      setDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging]);

  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(ZOOM_MIN, s - ZOOM_STEP));
  }, []);

  const handleFitToView = useCallback(() => {
    setScale(fitScale);
    setPosition({ x: 0, y: 0 });
  }, [fitScale]);

  const handleOriginalSize = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleSave = useCallback(() => {
    void window.electronApi.invoke('image:save', currentUrl, fileName);
  }, [currentUrl, fileName]);

  const handleOpenExternal = useCallback(() => {
    void window.electronApi.invoke('shell:open-external', currentUrl);
  }, [currentUrl]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const zoomPercent = Math.round(scale * 100);

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Toolbar */}
      <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-[var(--color-bg-secondary)]/90 px-2 py-1 shadow-lg backdrop-blur">
        <button type="button" onClick={handleZoomOut} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]" title="Zoom out (-)">
          <MdiIcon path={mdiMagnifyMinusOutline} size={16} />
        </button>
        <span className="min-w-12 text-center text-xs text-[var(--color-text-secondary)]">{zoomPercent}%</span>
        <button type="button" onClick={handleZoomIn} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]" title="Zoom in (+)">
          <MdiIcon path={mdiMagnifyPlusOutline} size={16} />
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        <button type="button" onClick={handleFitToView} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]" title="Fit to view">
          <MdiIcon path={mdiFitToScreen} size={16} />
        </button>
        <button type="button" onClick={handleOriginalSize} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]" title="Original size (0)">
          <MdiIcon path={mdiArrowExpandAll} size={16} />
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        <button type="button" onClick={handleSave} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]" title="Save image">
          <MdiIcon path={mdiContentSave} size={16} />
        </button>
        <button type="button" onClick={handleOpenExternal} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]" title="Open in browser">
          <MdiIcon path={mdiOpenInNew} size={16} />
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--color-border-primary)]" />

        <button type="button" onClick={onClose} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]" title="Close (Esc)">
          <MdiIcon path={mdiClose} size={16} />
        </button>
      </div>

      {/* Image info */}
      <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-[var(--color-bg-secondary)]/90 px-3 py-1 text-xs text-[var(--color-text-muted)] shadow-lg backdrop-blur">
        {allImageUrls !== undefined && allImageUrls.length > 1 && (
          <span className="mr-2">[{allImageUrls.indexOf(currentUrl) + 1}/{allImageUrls.length}] ← → で切替</span>
        )}
        {naturalSize.w > 0 ? `${String(naturalSize.w)} x ${String(naturalSize.h)}` : ''} — {fileName}
      </div>

      {/* Image */}
      <img
        ref={imgRef}
        src={currentUrl}
        alt={fileName}
        onLoad={handleImageLoad}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        className="max-h-none max-w-none select-none"
        style={{
          transform: `translate(${String(position.x)}px, ${String(position.y)}px) scale(${String(scale)})`,
          cursor: dragging ? 'grabbing' : 'grab',
          transformOrigin: 'center center',
        }}
        draggable={false}
        referrerPolicy="no-referrer"
      />
    </div>,
    document.body,
  );
}
