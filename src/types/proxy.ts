/**
 * Proxy configuration types.
 * Supports separate read/write proxy settings.
 */

/** Configuration for a single proxy endpoint */
export interface ProxyEndpointConfig {
  /** Whether this proxy is enabled */
  readonly enabled: boolean;
  /** Proxy server address (hostname or IP) */
  readonly address: string;
  /** Proxy server port */
  readonly port: number;
  /** Optional authentication user ID */
  readonly userId: string;
  /** Optional authentication password (stored in config, not hardcoded) */
  readonly password: string;
}

/** Full proxy configuration with separate read/write settings */
export interface ProxyConfig {
  readonly readProxy: ProxyEndpointConfig;
  readonly writeProxy: ProxyEndpointConfig;
}

/** Default (disabled) proxy endpoint */
export const DEFAULT_PROXY_ENDPOINT: ProxyEndpointConfig = {
  enabled: false,
  address: '',
  port: 0,
  userId: '',
  password: '',
} as const;

/** Default (disabled) proxy config */
export const DEFAULT_PROXY_CONFIG: ProxyConfig = {
  readProxy: DEFAULT_PROXY_ENDPOINT,
  writeProxy: DEFAULT_PROXY_ENDPOINT,
} as const;

/** Proxy operation type — determines which proxy to use */
export const ProxyMode = {
  Read: 'read',
  Write: 'write',
} as const;
export type ProxyMode = (typeof ProxyMode)[keyof typeof ProxyMode];
