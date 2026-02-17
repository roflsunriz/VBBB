/**
 * Authentication types for UPLIFT, Be, and Donguri systems.
 */

/** UPLIFT session state */
export interface UpliftSession {
  /** Whether the user is currently logged in */
  readonly loggedIn: boolean;
  /** Session ID (not persisted to disk) */
  readonly sessionId: string;
}

/** Be session state */
export interface BeSession {
  /** Whether the user is currently logged in */
  readonly loggedIn: boolean;
}

/** Donguri (acorn) state */
export const DonguriStatus = {
  /** No acorn cookie present */
  None: 'none',
  /** Acorn cookie present and valid */
  Active: 'active',
  /** Acorn cookie is broken / needs re-authentication */
  Broken: 'broken',
  /** Acorn was consumed (donguri planted) */
  Consumed: 'consumed',
} as const;
export type DonguriStatus = (typeof DonguriStatus)[keyof typeof DonguriStatus];

export interface DonguriState {
  readonly status: DonguriStatus;
  /** Human-readable message about the current state */
  readonly message: string;
  /** Whether donguri account is currently logged in */
  readonly loggedIn?: boolean | undefined;
  /** Donguri account ID */
  readonly userId?: string | undefined;
  /** Display name shown on donguri page */
  readonly userName?: string | undefined;
  /** User mode such as 警備員/ハンター */
  readonly userMode?: string | undefined;
  /** Guard/hunter level */
  readonly level?: string | undefined;
  /** Acorn/seed balance */
  readonly acorn?: string | undefined;
  /** Cannon statistics text */
  readonly cannonStats?: string | undefined;
  /** Fight statistics text */
  readonly fightStats?: string | undefined;
  /** X-Donguri-Stat header raw value */
  readonly donguriStat?: string | undefined;
}

/** Combined authentication state */
export interface AuthState {
  readonly uplift: UpliftSession;
  readonly be: BeSession;
  readonly donguri: DonguriState;
}

/** Default (unauthenticated) state */
export const DEFAULT_AUTH_STATE: AuthState = {
  uplift: { loggedIn: false, sessionId: '' },
  be: { loggedIn: false },
  donguri: { status: 'none', message: '', loggedIn: false },
} as const;
