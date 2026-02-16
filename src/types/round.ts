/**
 * Round (patrol) list types.
 * Manages scheduled fetching of boards and threads.
 */

/** Board round entry from RoundBoard.2ch */
export interface RoundBoardEntry {
  readonly url: string;
  readonly boardTitle: string;
  readonly roundName: string;
}

/** Thread/item round entry from RoundItem.2ch */
export interface RoundItemEntry {
  readonly url: string;
  readonly boardTitle: string;
  readonly fileName: string;
  readonly threadTitle: string;
  readonly roundName: string;
}

/** Round list file version */
export const ROUND_FILE_VERSION = '2.00' as const;

/** Separator used in round files */
export const ROUND_SEPARATOR = '#1' as const;

/** Round timer settings */
export interface RoundTimerConfig {
  readonly enabled: boolean;
  /** Interval in minutes */
  readonly intervalMinutes: number;
}

/** Default round timer config */
export const DEFAULT_ROUND_TIMER: RoundTimerConfig = {
  enabled: false,
  intervalMinutes: 15,
};
