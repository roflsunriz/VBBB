/**
 * Type definitions for the VBBB DSL (Domain-Specific Language) used in
 * programmatic posting.
 *
 * DSL file extension: .vbbs
 */

/** A single post instruction parsed from a DSL script */
export interface DslPost {
  /** Poster name (empty string = anonymous) */
  readonly name: string;
  /** Mail field (empty string = omit) */
  readonly mail: string;
  /** Post body (required) */
  readonly message: string;
  /** How many times to post this entry (default 1) */
  readonly repeat: number;
  /** Seconds to wait before the NEXT post (undefined = no wait) */
  readonly intervalSec: number | undefined;
}

/** A fully parsed DSL script */
export interface DslScript {
  /** Scheduled start datetime (undefined = start immediately) */
  readonly scheduleAt: Date | undefined;
  /** Countdown seconds before the first post (undefined = no countdown) */
  readonly countdownSec: number | undefined;
  /** Ordered list of posts to execute */
  readonly posts: readonly DslPost[];
}

/** A single parse error with line number */
export interface DslParseError {
  /** 1-based source line number (0 = general / unknown) */
  readonly line: number;
  /** Human-readable error description */
  readonly message: string;
}

/** Result type returned by the DSL parser */
export type DslParseResult =
  | { readonly ok: true; readonly script: DslScript }
  | { readonly ok: false; readonly errors: readonly DslParseError[] };
