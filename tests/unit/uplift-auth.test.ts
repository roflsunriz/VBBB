import { describe, it, expect, beforeEach } from 'vitest';
import { getUpliftSession, upliftLogout } from '../../src/main/services/uplift-auth';
import { clearAllCookies, getCookie, setCookie } from '../../src/main/services/cookie-store';

const TEST_DOMAIN = '5ch.io';

beforeEach(() => {
  clearAllCookies();
  upliftLogout(TEST_DOMAIN);
});

describe('getUpliftSession', () => {
  it('returns logged out state by default', () => {
    const session = getUpliftSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(false);
    expect(session.sessionId).toBe('');
  });
});

describe('upliftLogout', () => {
  it('clears session state', () => {
    upliftLogout(TEST_DOMAIN);
    const session = getUpliftSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(false);
    expect(session.sessionId).toBe('');
  });

  it('removes sid cookie', () => {
    setCookie({
      name: 'sid',
      value: 'test-session',
      domain: '.5ch.io',
      path: '/',
      sessionOnly: true,
      secure: true,
    });
    expect(getCookie('sid', TEST_DOMAIN)).toBeDefined();

    upliftLogout(TEST_DOMAIN);
    expect(getCookie('sid', TEST_DOMAIN)).toBeUndefined();
  });
});
