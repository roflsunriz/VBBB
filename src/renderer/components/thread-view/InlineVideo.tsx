/**
 * Inline video player component.
 * Uses IntersectionObserver-based lazy loading with a fixed-size placeholder
 * to prevent layout shift.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { MediaPlaceholder } from './MediaPlaceholder';
import { useLazyLoad } from '../../hooks/use-lazy-load';
import { useVideoKeyboard } from '../../hooks/use-video-keyboard';
import { useStatusLogStore } from '../../stores/status-log-store';

interface InlineVideoProps {
  readonly url: string;
  readonly originalUrl: string;
  readonly initialVolume: number;
}

const VIDEO_MAX_WIDTH = 320;
const VIDEO_MAX_HEIGHT = 240;
const MEDIA_PRELOAD_ROOT_MARGIN = '1200px 0px';
export function InlineVideo({
  url,
  originalUrl,
  initialVolume,
}: InlineVideoProps): React.JSX.Element {
  const { ref, isVisible } = useLazyLoad<HTMLSpanElement>({
    rootMargin: MEDIA_PRELOAD_ROOT_MARGIN,
  });
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoElRef.current;
    if (video === null) return;
    video.volume = Math.min(1, Math.max(0, initialVolume));
  }, [initialVolume, isVisible]);

  const handleOpenPlayer = useCallback(() => {
    void window.electronApi.invoke('media:open', {
      mediaType: 'video',
      url,
      originalUrl,
      initialVolume,
    });
  }, [initialVolume, originalUrl, url]);

  const handleOpenFullscreenPlayer = useCallback(() => {
    void window.electronApi.invoke('media:open', {
      mediaType: 'video',
      url,
      originalUrl,
      initialVolume,
      startFullscreen: true,
    });
  }, [initialVolume, originalUrl, url]);

  const handleVideoKeyDown = useVideoKeyboard(videoElRef, {
    onFullscreen: handleOpenFullscreenPlayer,
  });

  const handleOpenExternal = useCallback(() => {
    void window.electronApi.invoke('shell:open-external', originalUrl);
  }, [originalUrl]);

  const handleError = useCallback(() => {
    console.warn(`[InlineVideo] 動画読み込みエラー — url: ${url}`);
    setHasError(true);
    useStatusLogStore.getState().pushLog('media', 'error', `動画読み込みエラー: ${url}`);
  }, [url]);

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      if (document.fullscreenElement !== videoElRef.current) return;

      const openFullscreenPlayer = (): void => {
        handleOpenFullscreenPlayer();
      };

      void document.exitFullscreen().then(openFullscreenPlayer, openFullscreenPlayer);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [handleOpenFullscreenPlayer]);

  return (
    <span
      ref={ref}
      className="my-1 inline-block max-w-full"
      style={{
        width: `min(100%, ${String(VIDEO_MAX_WIDTH)}px)`,
        minHeight: `${String(VIDEO_MAX_HEIGHT)}px`,
      }}
    >
      {isVisible ? (
        hasError ? (
          <span className="flex h-full w-full flex-col items-start justify-center gap-2 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] px-3 py-3">
            <span className="text-xs text-[var(--color-text-muted)]">動画読み込みエラー</span>
            <span className="max-w-full break-all text-[10px] text-[var(--color-text-muted)]">
              {originalUrl}
            </span>
            <span className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleOpenPlayer}
                className="rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                プレイヤーで開く
              </button>
              <button
                type="button"
                onClick={handleOpenExternal}
                className="rounded border border-[var(--color-border-primary)] px-2 py-1 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              >
                外部で開く
              </button>
            </span>
          </span>
        ) : (
          <span className="inline-flex max-w-full flex-col gap-1">
            <video
              ref={videoElRef}
              src={url}
              controls
              preload="metadata"
              onError={handleError}
              onKeyDown={handleVideoKeyDown}
              className="rounded border border-[var(--color-border-secondary)] bg-black"
              style={{
                maxWidth: '100%',
                maxHeight: `${String(VIDEO_MAX_HEIGHT)}px`,
              }}
            />
            {originalUrl !== url && (
              <span className="max-w-full break-all text-[10px] text-[var(--color-text-muted)]">
                {originalUrl}
              </span>
            )}
          </span>
        )
      ) : (
        <MediaPlaceholder width={VIDEO_MAX_WIDTH} height={VIDEO_MAX_HEIGHT} mediaType="video" />
      )}
    </span>
  );
}
