/**
 * Fixed-size placeholder for lazy-loaded media (images and videos).
 * Reserves exact layout space to prevent content shift during scrolling.
 */

interface MediaPlaceholderProps {
  /** Placeholder width in pixels */
  readonly width: number;
  /** Placeholder height in pixels */
  readonly height: number;
  /** Media type label for the icon/text */
  readonly mediaType: 'image' | 'video';
}

export function MediaPlaceholder({ width, height, mediaType }: MediaPlaceholderProps): React.JSX.Element {
  return (
    <span
      className="my-1 inline-flex items-center justify-center rounded border border-[var(--color-border-secondary)] bg-[var(--color-bg-tertiary)]"
      style={{ width: `${String(width)}px`, height: `${String(height)}px` }}
      aria-label={mediaType === 'image' ? '画像読み込み待機中' : '動画読み込み待機中'}
    >
      <span className="flex flex-col items-center gap-1 text-[var(--color-text-muted)]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="h-6 w-6 opacity-40"
          aria-hidden="true"
        >
          {mediaType === 'image' ? (
            <path d="M21 3H3C1.9 3 1 3.9 1 5v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-7-7l-3 3.72L9 13l-4 5h16l-5-6z" />
          ) : (
            <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
          )}
        </svg>
        <span className="text-[10px] opacity-60">
          {mediaType === 'image' ? '画像' : '動画'}
        </span>
      </span>
    </span>
  );
}
