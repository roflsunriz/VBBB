/**
 * User settings types.
 * Persisted in localStorage on the renderer side.
 */

/** Highlight settings for own posts and replies */
export interface HighlightSettings {
  /** Highlight own posts (identified by post history) */
  readonly highlightOwnPosts: boolean;
  /** Highlight replies to own posts */
  readonly highlightRepliesToOwn: boolean;
}

/** Default highlight settings */
export const DEFAULT_HIGHLIGHT_SETTINGS: HighlightSettings = {
  highlightOwnPosts: true,
  highlightRepliesToOwn: true,
} as const;
