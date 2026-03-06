/**
 * UPLIFT authentication service.
 * Handles login to uplift.5ch.net (or configured domain) and session management.
 *
 * IMPORTANT: Passwords are NEVER persisted or logged.
 */
import type { UpliftSession } from '@shared/auth';
import { DEFAULT_5CH_DOMAIN, DEFAULT_USER_AGENT } from '@shared/file-format';
import { createLogger } from '../logger';
import { setCookie, getCookie, removeCookie } from './cookie-store';
import { httpFetch } from './http-client';

const logger = createLogger('uplift-auth');

const SID_COOKIE_NAME = 'sid';

/** Current UPLIFT session state */
let currentSession: UpliftSession = { loggedIn: false, sessionId: '' };

/** Active 5ch domain — updated via setActiveDomain when user changes the setting */
let activeDomain: string = DEFAULT_5CH_DOMAIN;

/**
 * Update the active 5ch domain used for cookie lookups in getUpliftSid.
 * Called from IPC handlers whenever the domain config changes.
 */
export function setActiveDomain(domain: string): void {
  activeDomain = domain;
}

/**
 * Attempt UPLIFT login.
 * Returns success/failure. On success, stores sid Cookie in CookieStore.
 *
 * @param userId - UPLIFT user ID
 * @param password - UPLIFT password (NEVER persisted)
 * @param domain - 5ch base domain (e.g. "5ch.io")
 */
export async function upliftLogin(
  userId: string,
  password: string,
  domain: string,
): Promise<{ success: boolean; message: string }> {
  logger.info('Attempting UPLIFT login (credentials masked)');

  const loginUrl = `https://uplift.${domain}/log`;
  const referer = `https://uplift.${domain}/login`;
  const upliftDomain = `.${domain}`;
  const body = `usr=${encodeURIComponent(userId)}&pwd=${encodeURIComponent(password)}&log=`;

  try {
    const response = await httpFetch({
      url: loginUrl,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: referer,
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
          domain: upliftDomain,
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
 *
 * @param domain - 5ch base domain (e.g. "5ch.io")
 */
export function upliftLogout(domain: string): void {
  const upliftDomain = `.${domain}`;
  removeCookie(SID_COOKIE_NAME, upliftDomain);
  currentSession = { loggedIn: false, sessionId: '' };
  logger.info('UPLIFT logged out');
}

/**
 * Get current UPLIFT session state.
 *
 * @param domain - 5ch base domain (e.g. "5ch.io")
 */
export function getUpliftSession(domain: string): UpliftSession {
  // Also check if the sid cookie still exists
  if (currentSession.loggedIn) {
    const sidCookie = getCookie(SID_COOKIE_NAME, domain);
    if (sidCookie === undefined) {
      currentSession = { loggedIn: false, sessionId: '' };
    }
  }
  return currentSession;
}

/**
 * Get the current sid value for injection into requests.
 * Returns empty string if not logged in.
 * Uses the activeDomain set via setActiveDomain (defaults to DEFAULT_5CH_DOMAIN).
 */
export function getUpliftSid(): string {
  const sidCookie = getCookie(SID_COOKIE_NAME, activeDomain);
  return sidCookie?.value ?? '';
}
