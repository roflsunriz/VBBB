/**
 * Image preview and external preview types.
 */

/** A detected image URL in thread body */
export interface DetectedImage {
  /** Original URL as found in the text */
  readonly url: string;
  /** Display-ready URL (may be cleaned up for direct image access) */
  readonly displayUrl: string;
}

/** A detected video URL in thread body */
export interface DetectedVideo {
  /** Video source URL for the <video> element */
  readonly url: string;
  /** Original URL as found in the text (may differ from url if cleaned) */
  readonly originalUrl: string;
}

/** An external preview rule from extpreview.ini */
export interface ExtPreviewRule {
  /** URL match pattern (regex) */
  readonly pattern: string;
  /** Command to execute (or 'nop' to skip) */
  readonly command: string;
  /** Whether to show confirmation dialog */
  readonly confirm: boolean;
  /** Whether to continue processing after this rule */
  readonly continueProcessing: boolean;
}
