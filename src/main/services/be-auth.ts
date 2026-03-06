/**
 * Be authentication service.
 * Handles login to be.5ch.net (or configured domain) and DMDM/MDMD Cookie management.
 *
 * IMPORTANT: Passwords are NEVER persisted or logged.
 */
import type { BeSession } from '@shared/auth';
import { createLogger } from '../logger';
import { setCookie, getCookie, removeCookie, parseSetCookieHeaders } from './cookie-store';
import { httpFetch } from './http-client';

const logger = createLogger('be-auth');

const DMDM_COOKIE = 'DMDM';
const MDMD_COOKIE = 'MDMD';

/**
 * Attempt Be login.
 * Returns success/failure. On success, stores DMDM/MDMD Cookies in CookieStore.
 *
 * @param mail - Be account email address
 * @param password - Be account password (NEVER persisted)
 * @param domain - 5ch base domain (e.g. "5ch.io")
 */
export async function beLogin(
  mail: string,
  password: string,
  domain: string,
): Promise<{ success: boolean; message: string }> {
  logger.info('Attempting Be login (credentials masked)');

  const loginUrl = `https://be.${domain}/log`;
  const beDomain = `.${domain}`;
  const body = `mail=${encodeURIComponent(mail)}&pass=${encodeURIComponent(password)}`;

  try {
    const response = await httpFetch({
      url: loginUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: `https://be.${domain}/`,
      },
      body,
    });

    // Parse Set-Cookie headers to extract DMDM/MDMD
    parseSetCookieHeaders(response.headers, loginUrl);

    const dmdm = getCookie(DMDM_COOKIE, domain);
    const mdmd = getCookie(MDMD_COOKIE, domain);

    if (dmdm !== undefined && mdmd !== undefined) {
      logger.info('Be login successful (DMDM/MDMD obtained)');
      return { success: true, message: 'Be login successful' };
    }

    // If Set-Cookie parsing didn't find them, try manual extraction
    const setCookieHeader = response.headers['set-cookie'] ?? '';
    const dmdmMatch = /DMDM=([^;,\s]+)/.exec(setCookieHeader);
    const mdmdMatch = /MDMD=([^;,\s]+)/.exec(setCookieHeader);

    if (dmdmMatch?.[1] !== undefined && mdmdMatch?.[1] !== undefined) {
      setCookie({
        name: DMDM_COOKIE,
        value: dmdmMatch[1],
        domain: beDomain,
        path: '/',
        sessionOnly: false,
        secure: false,
      });
      setCookie({
        name: MDMD_COOKIE,
        value: mdmdMatch[1],
        domain: beDomain,
        path: '/',
        sessionOnly: false,
        secure: false,
      });
      logger.info('Be login successful (manual cookie extraction)');
      return { success: true, message: 'Be login successful' };
    }

    logger.warn('Be login failed: no DMDM/MDMD cookies received');
    return { success: false, message: 'Login failed: invalid credentials or server error' };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`Be login error: ${errorMsg}`);
    return { success: false, message: `Login error: ${errorMsg}` };
  }
}

/**
 * Logout from Be. Clears DMDM/MDMD cookies.
 *
 * @param domain - 5ch base domain (e.g. "5ch.io")
 */
export function beLogout(domain: string): void {
  const beDomain = `.${domain}`;
  removeCookie(DMDM_COOKIE, beDomain);
  removeCookie(MDMD_COOKIE, beDomain);
  logger.info('Be logged out');
}

/**
 * Get current Be session state.
 *
 * @param domain - 5ch base domain (e.g. "5ch.io")
 */
export function getBeSession(domain: string): BeSession {
  const dmdm = getCookie(DMDM_COOKIE, domain);
  const mdmd = getCookie(MDMD_COOKIE, domain);
  return { loggedIn: dmdm !== undefined && mdmd !== undefined };
}

/**
 * Parse a Be ID from a DAT datetime field.
 * Pattern: "BE:34600695-4" → { beId: "34600695", beLevel: "4" }
 */
export function parseBeId(dateTimeField: string): { beId: string; beLevel: string } | undefined {
  const match = /BE:(\d+)-(\d+)/.exec(dateTimeField);
  if (match?.[1] !== undefined && match[2] !== undefined) {
    return { beId: match[1], beLevel: match[2] };
  }
  return undefined;
}

/**
 * Build a Be profile URL from a Be ID and res number.
 *
 * @param beId - Be account ID
 * @param resNumber - Response number
 * @param domain - 5ch base domain (e.g. "5ch.io")
 */
export function buildBeProfileUrl(beId: string, resNumber: number, domain: string): string {
  return `https://be.${domain}/test/p.php?i=${beId}/${String(resNumber)}`;
}
