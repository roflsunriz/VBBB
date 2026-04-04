import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mdiArrowExpandAll,
  mdiClose,
  mdiContentSave,
  mdiFitToScreen,
  mdiMagnifyMinusOutline,
  mdiMagnifyPlusOutline,
  mdiOpenInNew,
} from '@mdi/js';
import type { MediaViewerPayload } from '@shared/view-ipc';
import { MdiIcon } from '../common/MdiIcon';

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 10;

export function MediaViewer({
  payload,
  onClose,
}: {
  readonly payload: MediaViewerPayload;
  readonly onClose: () => void;
}): React.JSX.Element {
  const [currentUrl, setCurrentUrl] = useState(payload.url);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [fitScale, setFitScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setCurrentUrl(payload.url);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [payload]);

  useEffect(() => {
    if (payload.mediaType === 'video' && videoRef.current !== null) {
      videoRef.current.volume = Math.min(1, Math.max(0, payload.initialVolume));
    }
    if (payload.mediaType === 'audio' && audioRef.current !== null) {
      audioRef.current.volume = Math.min(1, Math.max(0, payload.initialVolume));
    }
  }, [payload]);

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (img === null || container === null) return;

    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    setNaturalSize({ w: nw, h: nh });

    const cw = container.clientWidth - 80;
    const ch = container.clientHeight - 120;
    const fit = Math.min(1, cw / nw, ch / nh);
    setFitScale(fit);
    setScale(fit);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (payload.mediaType !== 'image') return;

      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
      if (e.key === '-') setScale((s) => Math.max(ZOOM_MIN, s - ZOOM_STEP));
      if (e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      }

      if (payload.allImageUrls !== undefined && payload.allImageUrls.length > 1) {
        const idx = payload.allImageUrls.indexOf(currentUrl);
        if (e.key === 'ArrowLeft' && idx > 0) {
          const prev = payload.allImageUrls[idx - 1];
          if (prev !== undefined) setCurrentUrl(prev);
        }
        if (e.key === 'ArrowRight' && idx < payload.allImageUrls.length - 1) {
          const next = payload.allImageUrls[idx + 1];
          if (next !== undefined) setCurrentUrl(next);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [currentUrl, onClose, payload]);

  useEffect(() => {
    if (!dragging || payload.mediaType !== 'image') return;

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
  }, [dragging, payload.mediaType]);

  const handleOpenExternal = useCallback(() => {
    if (payload.mediaType === 'image') {
      void window.electronApi.invoke('shell:open-external', payload.pageUrl ?? currentUrl);
      return;
    }
    void window.electronApi.invoke('shell:open-external', payload.originalUrl);
  }, [currentUrl, payload]);

  const handleSave = useCallback(() => {
    const fileName = currentUrl.split('/').pop() ?? 'media';
    void window.electronApi.invoke('image:save', currentUrl, fileName);
  }, [currentUrl]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (payload.mediaType !== 'image' || e.button !== 0) return;
      e.preventDefault();
      setDragging(true);
      lastMouse.current = { x: e.clientX, y: e.clientY };
    },
    [payload.mediaType],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (payload.mediaType !== 'image') return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setScale((s) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s + delta)));
    },
    [payload.mediaType],
  );

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border-primary)] px-3 py-2">
        <div className="text-sm font-semibold">
          {payload.mediaType === 'image'
            ? '画像ビューア'
            : payload.mediaType === 'video'
              ? '動画プレイヤー'
              : '音声プレイヤー'}
        </div>
        <div className="flex items-center gap-1">
          {payload.mediaType === 'image' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setScale((s) => Math.max(ZOOM_MIN, s - ZOOM_STEP));
                }}
                className="rounded p-1 hover:bg-[var(--color-bg-hover)]"
                title="縮小"
              >
                <MdiIcon path={mdiMagnifyMinusOutline} size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
                }}
                className="rounded p-1 hover:bg-[var(--color-bg-hover)]"
                title="拡大"
              >
                <MdiIcon path={mdiMagnifyPlusOutline} size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setScale(fitScale);
                  setPosition({ x: 0, y: 0 });
                }}
                className="rounded p-1 hover:bg-[var(--color-bg-hover)]"
                title="全体表示"
              >
                <MdiIcon path={mdiFitToScreen} size={16} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setScale(1);
                  setPosition({ x: 0, y: 0 });
                }}
                className="rounded p-1 hover:bg-[var(--color-bg-hover)]"
                title="原寸"
              >
                <MdiIcon path={mdiArrowExpandAll} size={16} />
              </button>
            </>
          )}
          {payload.mediaType === 'image' && (
            <button
              type="button"
              onClick={handleSave}
              className="rounded p-1 hover:bg-[var(--color-bg-hover)]"
              title="保存"
            >
              <MdiIcon path={mdiContentSave} size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={handleOpenExternal}
            className="rounded p-1 hover:bg-[var(--color-bg-hover)]"
            title="外部ブラウザで開く"
          >
            <MdiIcon path={mdiOpenInNew} size={16} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-[var(--color-bg-hover)]"
            title="閉じる"
          >
            <MdiIcon path={mdiClose} size={16} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden bg-black/85 p-6"
      >
        {payload.mediaType === 'image' && (
          <img
            ref={imgRef}
            src={currentUrl}
            alt={currentUrl}
            onLoad={handleImageLoad}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            className="max-h-none max-w-none select-none"
            style={{
              transform: `translate(${String(position.x)}px, ${String(position.y)}px) scale(${String(scale)})`,
              transformOrigin: 'center center',
              cursor: dragging ? 'grabbing' : 'grab',
            }}
            draggable={false}
            referrerPolicy="no-referrer"
          />
        )}
        {payload.mediaType === 'video' && (
          <video
            ref={videoRef}
            src={payload.url}
            controls
            autoPlay
            preload="metadata"
            className="max-h-full max-w-full rounded border border-white/10 bg-black"
          />
        )}
        {payload.mediaType === 'audio' && (
          <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-[var(--color-bg-secondary)] p-6 shadow-lg">
            <div className="mb-4 break-all text-sm text-[var(--color-text-muted)]">
              {payload.originalUrl}
            </div>
            <audio
              ref={audioRef}
              src={payload.url}
              controls
              autoPlay
              preload="metadata"
              className="w-full"
            />
          </div>
        )}
      </div>

      {payload.mediaType === 'image' && (
        <div className="border-t border-[var(--color-border-primary)] px-3 py-1.5 text-xs text-[var(--color-text-muted)]">
          {payload.allImageUrls !== undefined && payload.allImageUrls.length > 1
            ? `[${payload.allImageUrls.indexOf(currentUrl) + 1}/${payload.allImageUrls.length}] ← → で切替`
            : currentUrl}
          {naturalSize.w > 0 ? ` / ${String(naturalSize.w)} x ${String(naturalSize.h)}` : ''}
        </div>
      )}
    </div>
  );
}
