/**
 * Inline video player component.
 * Uses IntersectionObserver-based lazy loading with a fixed-size placeholder
 * to prevent layout shift. Only loads video when scrolled into view.
 */
import { useState, useCallback } from 'react';
import { MediaPlaceholder } from './MediaPlaceholder';
import { useLazyLoad } from '../../hooks/use-lazy-load';
import { useStatusLogStore } from '../../stores/status-log-store';

interface InlineVideoProps {
  readonly url: string;
  readonly originalUrl: string;
}

const VIDEO_MAX_WIDTH = 320;
const VIDEO_MAX_HEIGHT = 240;

export function InlineVideo({ url, originalUrl }: InlineVideoProps): React.JSX.Element {
  const [hasError, setHasError] = useState(false);
  const { ref, isVisible } = useLazyLoad<HTMLSpanElement>({ rootMargin: '300px' });

  const handleError = useCallback(() => {
    console.warn(`[InlineVideo] 動画読み込みエラー — url: ${url} / originalUrl: ${originalUrl}`);
    setHasError(true);
    useStatusLogStore.getState().pushLog('media', 'error', `動画読み込みエラー: ${originalUrl}`);
  }, [url, originalUrl]);

  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    if (el) {
      el.volume = 0.1;
    }
  }, []);

  const handleOpenExternal = useCallback(() => {
    void window.electronApi.invoke('shell:open-external', originalUrl);
  }, [originalUrl]);

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
    <span ref={ref} className="my-1 inline-block" style={{ minWidth: `${String(VIDEO_MAX_WIDTH)}px`, minHeight: `${String(VIDEO_MAX_HEIGHT)}px` }}>
      {isVisible ? (
        <video
          ref={videoRef}
          src={url}
          controls
          preload="metadata"
          loop
          playsInline
          onError={handleError}
          className="rounded border border-[var(--color-border-secondary)]"
          style={{ maxWidth: `${String(VIDEO_MAX_WIDTH)}px`, maxHeight: `${String(VIDEO_MAX_HEIGHT)}px` }}
        />
      ) : (
        <MediaPlaceholder width={VIDEO_MAX_WIDTH} height={VIDEO_MAX_HEIGHT} mediaType="video" />
      )}
    </span>
  );
}
