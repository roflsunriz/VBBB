/**
 * Diagnostic log types for the console modal.
 * Used to stream structured log entries from main process to renderer.
 */

/** Log severity level */
export const DiagLogLevel = {
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
} as const;
export type DiagLogLevel = (typeof DiagLogLevel)[keyof typeof DiagLogLevel];

/** A single diagnostic log entry */
export interface DiagLogEntry {
  /** ISO 8601 timestamp */
  readonly timestamp: string;
  /** Log severity */
  readonly level: DiagLogLevel;
  /** Logger tag (e.g. "post", "http-client", "cookie-store") */
  readonly tag: string;
  /** Log message (sensitive values already masked) */
  readonly message: string;
}
