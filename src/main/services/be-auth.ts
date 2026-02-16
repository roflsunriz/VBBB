/**
 * Be authentication service.
 * Handles login to be.5ch.net and DMDM/MDMD Cookie management.
 *
 * IMPORTANT: Passwords are NEVER persisted or logged.
 */
import type { BeSession } from '@shared/auth';
import { createLogger } from '../logger';
import { setCookie, getCookie, removeCookie, parseSetCookieHeaders } from './cookie-store';
import { httpFetch } from './http-client';

const logger = createLogger('be-auth');

const BE_LOGIN_URL = 'https://be.5ch.net/log';
const BE_DOMAIN = '.5ch.net';
const DMDM_COOKIE = 'DMDM';
const MDMD_COOKIE = 'MDMD';

/**
 * Attempt Be login.
 * Returns success/failure. On success, stores DMDM/MDMD Cookies in CookieStore.
 *
 * @param mail - Be account email address
 * @param password - Be account password (NEVER persisted)
 */
export async function beLogin(mail: string, password: string): Promise<{ success: boolean; message: string }> {
  logger.info('Attempting Be login (credentials masked)');

  const body = `mail=${encodeURIComponent(mail)}&pass=${encodeURIComponent(password)}`;

  try {
    const response = await httpFetch({
      url: BE_LOGIN_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://be.5ch.net/',
      },
      body,
    });

    // Parse Set-Cookie headers to extract DMDM/MDMD
    parseSetCookieHeaders(response.headers, BE_LOGIN_URL);

    const dmdm = getCookie(DMDM_COOKIE, '5ch.net');
    const mdmd = getCookie(MDMD_COOKIE, '5ch.net');

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
        domain: BE_DOMAIN,
        path: '/',
        sessionOnly: false,
        secure: false,
      });
      setCookie({
        name: MDMD_COOKIE,
        value: mdmdMatch[1],
        domain: BE_DOMAIN,
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
 */
export function beLogout(): void {
  removeCookie(DMDM_COOKIE, BE_DOMAIN);
  removeCookie(MDMD_COOKIE, BE_DOMAIN);
  logger.info('Be logged out');
}

/**
 * Get current Be session state.
 */
export function getBeSession(): BeSession {
  const dmdm = getCookie(DMDM_COOKIE, '5ch.net');
  const mdmd = getCookie(MDMD_COOKIE, '5ch.net');
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
 */
export function buildBeProfileUrl(beId: string, resNumber: number): string {
  return `https://be.5ch.net/test/p.php?i=${beId}/${String(resNumber)}`;
}
