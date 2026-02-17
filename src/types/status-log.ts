/**
 * Types for the lightweight status console panel.
 * Unlike diagnostic logs (DiagLogEntry) which stream from the main process,
 * status logs are renderer-side events for user-facing status display.
 */

/** Categories of status log events */
export const StatusLogCategory = {
  Network: 'network',
  Board: 'board',
  Thread: 'thread',
  Post: 'post',
  Media: 'media',
} as const;
export type StatusLogCategory = (typeof StatusLogCategory)[keyof typeof StatusLogCategory];

/** Severity / outcome level for a status log entry */
export const StatusLogLevel = {
  Info: 'info',
  Success: 'success',
  Warn: 'warn',
  Error: 'error',
} as const;
export type StatusLogLevel = (typeof StatusLogLevel)[keyof typeof StatusLogLevel];

/** A single status log entry displayed in the status console */
export interface StatusLogEntry {
  /** Auto-incremented unique id */
  readonly id: number;
  /** Event category */
  readonly category: StatusLogCategory;
  /** Severity / outcome */
  readonly level: StatusLogLevel;
  /** Human-readable message */
  readonly message: string;
  /** Unix epoch milliseconds (Date.now()) */
  readonly timestamp: number;
}
