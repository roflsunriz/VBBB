/**
 * DAT replacement rule types.
 * Used by replace.ini to sanitize DAT content before local storage.
 */

/** A single DAT replacement rule */
export interface ReplaceRule {
  /** Search string (may contain escape sequences) */
  readonly search: string;
  /** Replacement string (empty means replace with same-length spaces) */
  readonly replacement: string;
}
