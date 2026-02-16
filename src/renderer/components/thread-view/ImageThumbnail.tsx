/**
 * Inline image thumbnail component.
 * Renders image URLs as lazy-loaded thumbnails with click-to-enlarge.
 */
import { useState, useCallback } from 'react';

interface ImageThumbnailProps {
  readonly url: string;
  readonly displayUrl: string;
}

const THUMBNAIL_MAX_WIDTH = 200;
const THUMBNAIL_MAX_HEIGHT = 200;

export function ImageThumbnail({ url, displayUrl }: ImageThumbnailProps): React.JSX.Element {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsExpanded((prev) => !prev);
    }
    if (e.key === 'Escape' && isExpanded) {
      setIsExpanded(false);
    }
  }, [isExpanded]);

  if (hasError) {
    return (
      <span className="inline-block rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-xs text-[var(--color-text-muted)]">
        [画像読み込みエラー]
      </span>
    );
  }

  return (
    <span className="my-1 inline-block">
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className="cursor-pointer border-none bg-transparent p-0"
        title={isExpanded ? 'クリックで縮小' : 'クリックで拡大'}
        aria-label={isExpanded ? '画像を縮小' : '画像を拡大'}
      >
        <img
          src={displayUrl}
          alt={url}
          loading="lazy"
          onError={handleError}
          className="rounded border border-[var(--color-border-secondary)]"
          style={
            isExpanded
              ? { maxWidth: '100%', maxHeight: '80vh' }
              : { maxWidth: `${String(THUMBNAIL_MAX_WIDTH)}px`, maxHeight: `${String(THUMBNAIL_MAX_HEIGHT)}px` }
          }
          referrerPolicy="no-referrer"
        />
      </button>
    </span>
  );
}
