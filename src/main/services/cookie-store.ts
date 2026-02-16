/**
 * Cookie store service.
 * In-memory cookie management with optional file persistence.
 * Handles domain matching, expiry, and session-only cookies.
 */
import { join } from 'node:path';
import type { StoredCookie } from '@shared/cookie';
import { SESSION_ONLY_COOKIES } from '@shared/cookie';
import { createLogger } from '../logger';
import { atomicWriteFile, readFileSafe } from './file-io';

const logger = createLogger('cookie-store');

const COOKIE_FILE = 'cookies.txt';

/** In-memory cookie store: key = "domain|path|name" */
const cookies = new Map<string, StoredCookie>();

function cookieKey(domain: string, path: string, name: string): string {
  return `${domain}|${path}|${name}`;
}

/**
 * Check if a domain matches a cookie domain.
 * A cookie with domain ".5ch.net" matches "example.5ch.net".
 */
export function domainMatches(cookieDomain: string, requestDomain: string): boolean {
  const cd = cookieDomain.toLowerCase();
  const rd = requestDomain.toLowerCase();

  if (cd === rd) return true;

  // Leading dot means subdomain match
  if (cd.startsWith('.')) {
    return rd.endsWith(cd) || rd === cd.substring(1);
  }

  // Exact match or subdomain
  return rd === cd || rd.endsWith(`.${cd}`);
}

/**
 * Check if a path matches a cookie path.
 */
function pathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === '/') return true;
  return requestPath.startsWith(cookiePath);
}

/**
 * Check if a cookie has expired.
 */
function isExpired(cookie: StoredCookie): boolean {
  if (cookie.expires === undefined) return false;
  return new Date(cookie.expires).getTime() < Date.now();
}

/**
 * Determine if a cookie name is session-only.
 */
function isSessionOnly(name: string): boolean {
  return SESSION_ONLY_COOKIES.includes(name);
}

/**
 * Set (add or update) a cookie in the store.
 */
export function setCookie(cookie: StoredCookie): void {
  const key = cookieKey(cookie.domain, cookie.path, cookie.name);
  cookies.set(key, {
    ...cookie,
    sessionOnly: cookie.sessionOnly || isSessionOnly(cookie.name),
  });
}

/**
 * Get all cookies matching a given URL.
 */
export function getCookiesForUrl(url: string): readonly StoredCookie[] {
  let hostname: string;
  let pathname: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    pathname = parsed.pathname;
  } catch {
    return [];
  }

  const matching: StoredCookie[] = [];
  const expiredKeys: string[] = [];

  for (const [key, cookie] of cookies) {
    if (isExpired(cookie)) {
      expiredKeys.push(key);
      continue;
    }
    if (domainMatches(cookie.domain, hostname) && pathMatches(cookie.path, pathname)) {
      matching.push(cookie);
    }
  }

  // Clean up expired cookies
  for (const key of expiredKeys) {
    cookies.delete(key);
  }

  return matching;
}

/**
 * Get a specific cookie by name and domain.
 */
export function getCookie(name: string, domain: string): StoredCookie | undefined {
  for (const cookie of cookies.values()) {
    if (cookie.name === name && domainMatches(cookie.domain, domain) && !isExpired(cookie)) {
      return cookie;
    }
  }
  return undefined;
}

/**
 * Remove a cookie by name and domain.
 */
export function removeCookie(name: string, domain: string): void {
  const keysToRemove: string[] = [];
  for (const [key, cookie] of cookies) {
    if (cookie.name === name && domainMatches(cookie.domain, domain)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    cookies.delete(key);
  }
}

/**
 * Build a Cookie header string for a given URL.
 */
export function buildCookieHeader(url: string): string {
  const matched = getCookiesForUrl(url);
  if (matched.length === 0) return '';
  return matched.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Parse Set-Cookie header(s) and add to the store.
 * Does NOT log cookie values for security.
 */
export function parseSetCookieHeaders(headers: Readonly<Record<string, string>>, requestUrl: string): void {
  // Set-Cookie may be a single header or comma-separated (per HTTP spec)
  // In practice, each Set-Cookie is a separate header, but our headersToRecord joins them
  const setCookieValue = headers['set-cookie'];
  if (setCookieValue === undefined) return;

  let requestHost: string;
  let requestPath: string;
  try {
    const parsed = new URL(requestUrl);
    requestHost = parsed.hostname;
    requestPath = parsed.pathname;
  } catch {
    return;
  }

  // Split on commas that are followed by a cookie name (rough heuristic)
  // More robust: split on newlines if available, otherwise treat as single
  const cookieStrings = setCookieValue.split(/,\s*(?=[A-Za-z_]+=)/);

  for (const cookieStr of cookieStrings) {
    const parts = cookieStr.split(';').map((p) => p.trim());
    const nameValue = parts[0];
    if (nameValue === undefined) continue;

    const eqIdx = nameValue.indexOf('=');
    if (eqIdx < 0) continue;

    const name = nameValue.substring(0, eqIdx).trim();
    const value = nameValue.substring(eqIdx + 1).trim();
    if (name.length === 0) continue;

    let domain = requestHost;
    let path = requestPath;
    let expires: string | undefined;
    let secure = false;

    for (let i = 1; i < parts.length; i++) {
      const attr = parts[i];
      if (attr === undefined) continue;
      const attrLower = attr.toLowerCase();

      if (attrLower.startsWith('domain=')) {
        domain = attr.substring(7).trim();
      } else if (attrLower.startsWith('path=')) {
        path = attr.substring(5).trim();
      } else if (attrLower.startsWith('expires=')) {
        const dateStr = attr.substring(8).trim();
        const date = new Date(dateStr);
        if (!Number.isNaN(date.getTime())) {
          expires = date.toISOString();
        }
      } else if (attrLower.startsWith('max-age=')) {
        const maxAge = parseInt(attr.substring(8).trim(), 10);
        if (!Number.isNaN(maxAge)) {
          expires = new Date(Date.now() + maxAge * 1000).toISOString();
        }
      } else if (attrLower === 'secure') {
        secure = true;
      }
    }

    const cookie: StoredCookie = {
      name,
      value,
      domain,
      path,
      expires,
      sessionOnly: isSessionOnly(name),
      secure,
    };

    setCookie(cookie);
    logger.info(`Cookie set: ${name} for domain ${domain} (value masked)`);
  }
}

/**
 * Serialize persistent cookies to a text file format.
 * Session-only cookies are excluded.
 * Format: domain\tpath\tname\tvalue\texpires\tsecure
 */
export function serializeCookies(): string {
  const lines: string[] = [];
  for (const cookie of cookies.values()) {
    if (cookie.sessionOnly) continue;
    if (isExpired(cookie)) continue;
    const fields = [
      cookie.domain,
      cookie.path,
      cookie.name,
      cookie.value,
      cookie.expires ?? '',
      cookie.secure ? '1' : '0',
    ];
    lines.push(fields.join('\t'));
  }
  return lines.join('\n');
}

/**
 * Deserialize cookies from the text file format.
 */
export function deserializeCookies(content: string): void {
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    const fields = trimmed.split('\t');
    if (fields.length < 4) continue;

    const domain = fields[0] ?? '';
    const path = fields[1] ?? '';
    const name = fields[2] ?? '';
    const value = fields[3] ?? '';
    const expires = fields[4] !== undefined && fields[4].length > 0 ? fields[4] : undefined;
    const secure = fields[5] === '1';

    if (name.length === 0 || domain.length === 0) continue;

    const cookie: StoredCookie = {
      name,
      value,
      domain,
      path,
      expires,
      sessionOnly: isSessionOnly(name),
      secure,
    };

    // Skip expired cookies on load
    if (!isExpired(cookie)) {
      setCookie(cookie);
    }
  }
}

/**
 * Load cookies from disk.
 */
export function loadCookies(dataDir: string): void {
  const filePath = join(dataDir, COOKIE_FILE);
  const content = readFileSafe(filePath);
  if (content !== null) {
    deserializeCookies(content.toString('utf-8'));
    logger.info('Cookies loaded from disk');
  }
}

/**
 * Save persistent cookies to disk.
 */
export async function saveCookies(dataDir: string): Promise<void> {
  const filePath = join(dataDir, COOKIE_FILE);
  const content = serializeCookies();
  await atomicWriteFile(filePath, content);
  logger.info('Cookies saved to disk');
}

/**
 * Clear all cookies from the in-memory store.
 */
export function clearAllCookies(): void {
  cookies.clear();
}

/**
 * Get total number of cookies in the store (for diagnostics).
 */
export function getCookieCount(): number {
  return cookies.size;
}
