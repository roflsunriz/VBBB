/**
 * Inline video player component.
 * Uses IntersectionObserver-based lazy loading with a fixed-size placeholder
 * to prevent layout shift. Only loads video when scrolled into view.
 *
 * Keyboard shortcuts (when video is focused):
 *   K / Space  — Play / Pause | F — Fullscreen | M — Mute
 *   J / L      — ±10 s seek   | ←/→ — ±5 s     | ↑/↓ — Volume
 *   0–9        — % seek       | Home/End — Start/End
 *   , / .      — Frame step   | < / > — Playback rate
 */
import { useState, useCallback, useRef } from 'react';
import { MediaPlaceholder } from './MediaPlaceholder';
import { useLazyLoad } from '../../hooks/use-lazy-load';
import { useStatusLogStore } from '../../stores/status-log-store';
import { useVideoKeyboard } from '../../hooks/use-video-keyboard';

interface InlineVideoProps {
  readonly url: string;
  readonly originalUrl: string;
  readonly initialVolume: number;
}

const VIDEO_MAX_WIDTH = 320;
const VIDEO_MAX_HEIGHT = 240;
export function InlineVideo({
  url,
  originalUrl,
  initialVolume,
}: InlineVideoProps): React.JSX.Element {
  const [hasError, setHasError] = useState(false);
  const { ref, isVisible } = useLazyLoad<HTMLSpanElement>({ rootMargin: '300px' });
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const handleVideoKeyDown = useVideoKeyboard(videoElRef);

  const handleError = useCallback(() => {
    console.warn(`[InlineVideo] 動画読み込みエラー — url: ${url} / originalUrl: ${originalUrl}`);
    setHasError(true);
    useStatusLogStore.getState().pushLog('media', 'error', `動画読み込みエラー: ${originalUrl}`);
  }, [url, originalUrl]);

  const videoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      videoElRef.current = el;
      if (el) {
        el.volume = Math.min(1, Math.max(0, initialVolume));
      }
    },
    [initialVolume],
  );

  const handleOpenExternal = useCallback(() => {
    void window.electronApi.invoke('shell:open-external', originalUrl);
  }, [originalUrl]);
  const restoreVideoFocus = useCallback(() => {
    requestAnimationFrame(() => {
      videoElRef.current?.focus({ preventScroll: true });
    });
  }, []);

  if (hasError) {
    return (
      <button
        type="button"
        onClick={handleOpenExternal}
        className="inline-block rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:underline"
        title="外部ブラウザで開く"
      >
        [動画読み込みエラー: {originalUrl}]
      </button>
    );
  }

  return (
    <span
      ref={ref}
      className="my-1 inline-block"
      style={{
        minWidth: `${String(VIDEO_MAX_WIDTH)}px`,
        minHeight: `${String(VIDEO_MAX_HEIGHT)}px`,
      }}
    >
      {isVisible ? (
        <video
          ref={videoRef}
          src={url}
          controls
          preload="metadata"
          loop
          playsInline
          tabIndex={0}
          onError={handleError}
          onClick={restoreVideoFocus}
          onPlay={restoreVideoFocus}
          onPause={restoreVideoFocus}
          onVolumeChange={restoreVideoFocus}
          onKeyDown={handleVideoKeyDown}
          className="rounded border border-[var(--color-border-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          style={{
            maxWidth: `${String(VIDEO_MAX_WIDTH)}px`,
            maxHeight: `${String(VIDEO_MAX_HEIGHT)}px`,
          }}
        />
      ) : (
        <MediaPlaceholder width={VIDEO_MAX_WIDTH} height={VIDEO_MAX_HEIGHT} mediaType="video" />
      )}
    </span>
  );
}
