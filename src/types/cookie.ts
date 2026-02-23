/**
 * Cookie management types.
 */

/** A stored cookie with full metadata */
export interface StoredCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  /** ISO date string for expiry, or undefined for session cookies */
  readonly expires?: string | undefined;
  /** Whether this cookie should only be kept in memory (not persisted to disk) */
  readonly sessionOnly: boolean;
  /** Whether this cookie is secure (HTTPS only) */
  readonly secure: boolean;
}

/** Cookie names used by various authentication systems */
export const WellKnownCookies = {
  /** UPLIFT session ID */
  Sid: 'sid',
  /** Be login cookie 1 */
  DMDM: 'DMDM',
  /** Be login cookie 2 */
  MDMD: 'MDMD',
  /** Donguri acorn cookie */
  Acorn: 'acorn',
  /** Server-issued confirmation cookie */
  SPID: 'SPID',
  /** Server-issued confirmation cookie */
  PON: 'PON',
} as const;

/** Cookies that must NOT be persisted to disk (session-only) */
export const SESSION_ONLY_COOKIES: readonly string[] = [WellKnownCookies.Sid] as const;
