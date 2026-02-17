/**
 * Inline image thumbnail component.
 * Uses IntersectionObserver-based lazy loading with a fixed-size placeholder
 * to prevent layout shift. Click opens a full-featured image modal.
 */
import { useState, useCallback } from 'react';
import { ImageModal } from './ImageModal';
import { MediaPlaceholder } from './MediaPlaceholder';
import { useLazyLoad } from '../../hooks/use-lazy-load';

interface ImageThumbnailProps {
  readonly url: string;
  readonly displayUrl: string;
  /** All image URLs in the context (for keyboard navigation in modal) */
  readonly allImageUrls?: readonly string[] | undefined;
}

const THUMBNAIL_MAX_WIDTH = 200;
const THUMBNAIL_MAX_HEIGHT = 200;

export function ImageThumbnail({ url, displayUrl, allImageUrls }: ImageThumbnailProps): React.JSX.Element {
  const [modalOpen, setModalOpen] = useState(false);
  const [hasError, setHasError] = useState(false);
  const { ref, isVisible } = useLazyLoad<HTMLSpanElement>({ rootMargin: '300px' });

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  const handleError = useCallback(() => {
    console.warn(`[ImageThumbnail] 画像読み込みエラー — url: ${url} / displayUrl: ${displayUrl}`);
    setHasError(true);
  }, [url, displayUrl]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setModalOpen(true);
    }
  }, []);

  if (hasError) {
    return (
      <span className="inline-block rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
        [画像読み込みエラー]
      </span>
    );
  }

  return (
    <>
      <span ref={ref} className="my-1 inline-block" style={{ minWidth: `${String(THUMBNAIL_MAX_WIDTH)}px`, minHeight: `${String(THUMBNAIL_MAX_HEIGHT)}px` }}>
        {isVisible ? (
          <button
            type="button"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className="cursor-pointer border-none bg-transparent p-0"
            title="クリックで画像ビューアを開く"
            aria-label="画像ビューアを開く"
          >
            <img
              src={displayUrl}
              alt={url}
              loading="lazy"
              onError={handleError}
              className="rounded border border-[var(--color-border-secondary)] transition-opacity hover:opacity-80"
              style={{ maxWidth: `${String(THUMBNAIL_MAX_WIDTH)}px`, maxHeight: `${String(THUMBNAIL_MAX_HEIGHT)}px` }}
              referrerPolicy="no-referrer"
            />
          </button>
        ) : (
          <MediaPlaceholder width={THUMBNAIL_MAX_WIDTH} height={THUMBNAIL_MAX_HEIGHT} mediaType="image" />
        )}
      </span>

      {modalOpen && <ImageModal url={url} allImageUrls={allImageUrls} onClose={handleCloseModal} />}
    </>
  );
}
