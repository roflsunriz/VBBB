/**
 * Inline image thumbnail component.
 * Uses IntersectionObserver-based lazy loading with a fixed-size placeholder
 * to prevent layout shift. Click opens a dedicated media BrowserWindow.
 */
import { useCallback, useState } from 'react';
import { MediaPlaceholder } from './MediaPlaceholder';
import { useLazyLoad } from '../../hooks/use-lazy-load';
import { useStatusLogStore } from '../../stores/status-log-store';
import { buildMediaErrorDetail, type MediaErrorDetail } from '../../utils/media-error-detail';

interface ImageThumbnailProps {
  readonly url: string;
  readonly displayUrl: string;
  /** All image URLs in the context (for keyboard navigation in modal) */
  readonly allImageUrls?: readonly string[] | undefined;
}

const THUMBNAIL_MAX_WIDTH = 200;
const THUMBNAIL_MAX_HEIGHT = 200;
const MEDIA_PRELOAD_ROOT_MARGIN = '1200px 0px';

export function ImageThumbnail({
  url,
  displayUrl,
  allImageUrls,
}: ImageThumbnailProps): React.JSX.Element {
  const [errorDetail, setErrorDetail] = useState<MediaErrorDetail | null>(null);
  const { ref, isVisible } = useLazyLoad<HTMLSpanElement>({
    rootMargin: MEDIA_PRELOAD_ROOT_MARGIN,
  });

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      void window.electronApi.invoke('media:open', {
        mediaType: 'image',
        url: displayUrl,
        pageUrl: url,
        allImageUrls,
      });
    },
    [allImageUrls, displayUrl, url],
  );

  const handleError = useCallback(() => {
    console.warn(`[ImageThumbnail] 画像読み込みエラー — url: ${url} / displayUrl: ${displayUrl}`);
    useStatusLogStore.getState().pushLog('media', 'error', `画像読み込みエラー: ${displayUrl}`);
    setErrorDetail({
      title: '画像読み込みエラー',
      reason: '原因を確認中です',
      detail: 'URLへ到達できるか、サーバー応答を確認しています。',
      url: displayUrl,
    });
    void buildMediaErrorDetail('画像読み込みエラー', displayUrl, 'image').then(setErrorDetail);
  }, [url, displayUrl]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        void window.electronApi.invoke('media:open', {
          mediaType: 'image',
          url: displayUrl,
          pageUrl: url,
          allImageUrls,
        });
      }
    },
    [allImageUrls, displayUrl, url],
  );

  if (errorDetail !== null) {
    return (
      <span className="inline-flex max-w-full flex-col gap-1 rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
        <span className="font-semibold text-[var(--color-text-primary)]">{errorDetail.title}</span>
        <span>{errorDetail.reason}</span>
        <span className="break-words text-[10px]">{errorDetail.detail}</span>
        <span className="break-all text-[10px] opacity-75">{errorDetail.url}</span>
      </span>
    );
  }

  return (
    <>
      <span
        ref={ref}
        className="my-1 inline-block max-w-full"
        style={{
          width: `min(100%, ${String(THUMBNAIL_MAX_WIDTH)}px)`,
          minHeight: `${String(THUMBNAIL_MAX_HEIGHT)}px`,
        }}
      >
        {isVisible ? (
          <button
            type="button"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="cursor-pointer border-none bg-transparent p-0"
            style={{ maxWidth: '100%' }}
            title="クリックで画像ビューアを開く"
            aria-label="画像ビューアを開く"
          >
            <img
              src={displayUrl}
              alt={url}
              onError={handleError}
              className="rounded border border-[var(--color-border-secondary)] transition-opacity hover:opacity-80"
              style={{
                maxWidth: '100%',
                maxHeight: `${String(THUMBNAIL_MAX_HEIGHT)}px`,
              }}
              referrerPolicy="no-referrer"
            />
          </button>
        ) : (
          <MediaPlaceholder
            width={THUMBNAIL_MAX_WIDTH}
            height={THUMBNAIL_MAX_HEIGHT}
            mediaType="image"
          />
        )}
      </span>
    </>
  );
}
