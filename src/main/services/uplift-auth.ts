/**
 * UPLIFT authentication service.
 * Handles login to uplift.5ch.net and session management.
 *
 * IMPORTANT: Passwords are NEVER persisted or logged.
 */
import type { UpliftSession } from '@shared/auth';
import { DEFAULT_USER_AGENT } from '@shared/file-format';
import { createLogger } from '../logger';
import { setCookie, getCookie, removeCookie } from './cookie-store';
import { httpFetch } from './http-client';

const logger = createLogger('uplift-auth');

const UPLIFT_LOGIN_URL = 'https://uplift.5ch.net/log';
const UPLIFT_REFERER = 'https://uplift.5ch.net/login';
const UPLIFT_DOMAIN = '.5ch.net';
const SID_COOKIE_NAME = 'sid';

/** Current UPLIFT session state */
let currentSession: UpliftSession = { loggedIn: false, sessionId: '' };

/**
 * Attempt UPLIFT login.
 * Returns success/failure. On success, stores sid Cookie in CookieStore.
 *
 * @param userId - UPLIFT user ID
 * @param password - UPLIFT password (NEVER persisted)
 */
export async function upliftLogin(
  userId: string,
  password: string,
): Promise<{ success: boolean; message: string }> {
  logger.info('Attempting UPLIFT login (credentials masked)');

  const body = `usr=${encodeURIComponent(userId)}&pwd=${encodeURIComponent(password)}&log=`;

  try {
    const response = await httpFetch({
      url: UPLIFT_LOGIN_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: UPLIFT_REFERER,
      },
      body,
    });

    // Look for sid in Set-Cookie
    const setCookieHeader = response.headers['set-cookie'];
    if (setCookieHeader !== undefined) {
      // Parse manually to find sid
      const sidMatch = /sid=([^;,\s]+)/.exec(setCookieHeader);
      if (sidMatch?.[1] !== undefined) {
        const sidValue = sidMatch[1];
        // Session ID = {UserAgent}:{SessionValue}
        const sessionId = `${DEFAULT_USER_AGENT}:${sidValue}`;

        setCookie({
          name: SID_COOKIE_NAME,
          value: sidValue,
          domain: UPLIFT_DOMAIN,
          path: '/',
          sessionOnly: true,
          secure: true,
        });

        currentSession = { loggedIn: true, sessionId };
        logger.info('UPLIFT login successful (sid obtained)');
        return { success: true, message: 'UPLIFT login successful' };
      }
    }

    // Check response body for error messages
    const responseText = response.body.toString('utf-8');
    if (
      responseText.includes('error') ||
      responseText.includes('Error') ||
      response.status !== 200
    ) {
      logger.warn('UPLIFT login failed: no sid cookie in response');
      return { success: false, message: 'Login failed: invalid credentials or server error' };
    }

    logger.warn('UPLIFT login: no sid cookie found in response');
    return { success: false, message: 'Login failed: no session cookie received' };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`UPLIFT login error: ${errorMsg}`);
    return { success: false, message: `Login error: ${errorMsg}` };
  }
}

/**
 * Logout from UPLIFT. Clears the sid cookie and session state.
 */
export function upliftLogout(): void {
  removeCookie(SID_COOKIE_NAME, UPLIFT_DOMAIN);
  currentSession = { loggedIn: false, sessionId: '' };
  logger.info('UPLIFT logged out');
}

/**
 * Get current UPLIFT session state.
 */
export function getUpliftSession(): UpliftSession {
  // Also check if the sid cookie still exists
  if (currentSession.loggedIn) {
    const sidCookie = getCookie(SID_COOKIE_NAME, '5ch.net');
    if (sidCookie === undefined) {
      currentSession = { loggedIn: false, sessionId: '' };
    }
  }
  return currentSession;
}

/**
 * Get the current sid value for injection into requests.
 * Returns empty string if not logged in.
 */
export function getUpliftSid(): string {
  const sidCookie = getCookie(SID_COOKIE_NAME, '5ch.net');
  return sidCookie?.value ?? '';
}
