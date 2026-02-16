import { describe, it, expect, beforeEach } from 'vitest';
import { getUpliftSession, upliftLogout } from '../../src/main/services/uplift-auth';
import { clearAllCookies, getCookie, setCookie } from '../../src/main/services/cookie-store';

beforeEach(() => {
  clearAllCookies();
  upliftLogout();
});

describe('getUpliftSession', () => {
  it('returns logged out state by default', () => {
    const session = getUpliftSession();
    expect(session.loggedIn).toBe(false);
    expect(session.sessionId).toBe('');
  });
});

describe('upliftLogout', () => {
  it('clears session state', () => {
    upliftLogout();
    const session = getUpliftSession();
    expect(session.loggedIn).toBe(false);
    expect(session.sessionId).toBe('');
  });

  it('removes sid cookie', () => {
    setCookie({
      name: 'sid',
      value: 'test-session',
      domain: '.5ch.net',
      path: '/',
      sessionOnly: true,
      secure: true,
    });
    expect(getCookie('sid', '5ch.net')).toBeDefined();

    upliftLogout();
    expect(getCookie('sid', '5ch.net')).toBeUndefined();
  });
});
