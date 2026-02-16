/**
 * Post history types.
 * Records of sent posts for audit and retry purposes.
 */

/** A single post history entry */
export interface PostHistoryEntry {
  readonly timestamp: string;
  readonly boardUrl: string;
  readonly threadId: string;
  readonly name: string;
  readonly mail: string;
  readonly message: string;
}

/** Default max file size for sent.ini (1MB) */
export const SENT_INI_MAX_SIZE = 1_048_576 as const;
