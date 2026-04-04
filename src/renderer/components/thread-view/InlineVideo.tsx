/**
 * Inline video launcher component.
 * Uses IntersectionObserver-based lazy loading with a fixed-size placeholder
 * to prevent layout shift. Playback itself happens in a dedicated BrowserWindow.
 */
import { useCallback, useRef } from 'react';
import { MediaPlaceholder } from './MediaPlaceholder';
import { useLazyLoad } from '../../hooks/use-lazy-load';

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
  const { ref, isVisible } = useLazyLoad<HTMLSpanElement>({ rootMargin: '300px' });
  const videoElRef = useRef<HTMLButtonElement | null>(null);

  const handleOpenPlayer = useCallback(() => {
    void window.electronApi.invoke('media:open', {
      mediaType: 'video',
      url,
      originalUrl,
      initialVolume,
    });
  }, [initialVolume, originalUrl, url]);

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
        <button
          ref={videoElRef}
          type="button"
          onClick={handleOpenPlayer}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenPlayer();
            }
          }}
          className="flex h-full w-full flex-col items-center justify-center rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-secondary)] px-3 py-3 text-center focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] hover:bg-[var(--color-bg-hover)]"
          style={{
            maxWidth: `${String(VIDEO_MAX_WIDTH)}px`,
            maxHeight: `${String(VIDEO_MAX_HEIGHT)}px`,
          }}
        >
          <span className="mb-2 text-sm text-[var(--color-text-primary)]">
            動画プレイヤーで開く
          </span>
          <span className="break-all text-[10px] text-[var(--color-text-muted)]">
            {originalUrl}
          </span>
        </button>
      ) : (
        <MediaPlaceholder width={VIDEO_MAX_WIDTH} height={VIDEO_MAX_HEIGHT} mediaType="video" />
      )}
    </span>
  );
}
