/**
 * Inline video player component.
 * Renders video URLs as compact <video> elements with native controls.
 */
import { useState, useCallback } from 'react';

interface InlineVideoProps {
  readonly url: string;
  readonly originalUrl: string;
}

const VIDEO_MAX_WIDTH = 320;
const VIDEO_MAX_HEIGHT = 240;

export function InlineVideo({ url, originalUrl }: InlineVideoProps): React.JSX.Element {
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    console.warn(`[InlineVideo] 動画読み込みエラー — url: ${url} / originalUrl: ${originalUrl}`);
    setHasError(true);
  }, [url, originalUrl]);

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
    <span className="my-1 inline-block">
      <video
        src={url}
        controls
        preload="metadata"
        muted
        loop
        playsInline
        onError={handleError}
        className="rounded border border-[var(--color-border-secondary)]"
        style={{ maxWidth: `${String(VIDEO_MAX_WIDTH)}px`, maxHeight: `${String(VIDEO_MAX_HEIGHT)}px` }}
      />
    </span>
  );
}
