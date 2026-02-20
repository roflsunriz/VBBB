/**
 * Shared types for the application update feature.
 */

/** Result of checking for a new version via GitHub Releases API. */
export interface UpdateCheckResult {
  readonly latestVersion: string;
  readonly hasUpdate: boolean;
}

/** Download progress reported during installer download. */
export interface UpdateProgress {
  readonly percent: number;
  readonly bytesDownloaded: number;
  readonly totalBytes: number;
}
