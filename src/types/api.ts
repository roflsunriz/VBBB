/**
 * HTTP communication types.
 */

/** HTTP request configuration */
export interface HttpRequestConfig {
  readonly url: string;
  readonly method: 'GET' | 'POST';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  /** Connection timeout in ms */
  readonly connectTimeout?: number | undefined;
  /** Read timeout in ms */
  readonly readTimeout?: number | undefined;
  /** Range header value (for DAT differential fetch) */
  readonly range?: string | undefined;
  /** If-Modified-Since header value */
  readonly ifModifiedSince?: string | undefined;
  /** Whether to send Accept-Encoding: gzip */
  readonly acceptGzip?: boolean | undefined;
}

/** HTTP response */
export interface HttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer;
  readonly lastModified?: string | undefined;
}

/** Retry configuration for HTTP client */
export interface RetryConfig {
  /** Maximum number of retries */
  readonly maxRetries: number;
  /** Initial delay in ms (doubles each retry) */
  readonly initialDelayMs: number;
  /** Maximum delay in ms */
  readonly maxDelayMs: number;
  /** HTTP status codes to retry on */
  readonly retryableStatuses: readonly number[];
}

/** Encoding types supported */
export const EncodingType = {
  ShiftJIS: 'Shift_JIS',
  EUCJP: 'EUC-JP',
  UTF8: 'UTF-8',
} as const;
export type EncodingType = (typeof EncodingType)[keyof typeof EncodingType];
