import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBeSession,
  beLogout,
  parseBeId,
  buildBeProfileUrl,
} from '../../src/main/services/be-auth';
import { clearAllCookies, setCookie, getCookie } from '../../src/main/services/cookie-store';

beforeEach(() => {
  clearAllCookies();
});

describe('getBeSession', () => {
  it('returns logged out when no cookies', () => {
    const session = getBeSession();
    expect(session.loggedIn).toBe(false);
  });

  it('returns logged in when both DMDM and MDMD present', () => {
    setCookie({
      name: 'DMDM',
      value: 'val1',
      domain: '.5ch.net',
      path: '/',
      sessionOnly: false,
      secure: false,
    });
    setCookie({
      name: 'MDMD',
      value: 'val2',
      domain: '.5ch.net',
      path: '/',
      sessionOnly: false,
      secure: false,
    });

    const session = getBeSession();
    expect(session.loggedIn).toBe(true);
  });

  it('returns logged out when only DMDM present', () => {
    setCookie({
      name: 'DMDM',
      value: 'val1',
      domain: '.5ch.net',
      path: '/',
      sessionOnly: false,
      secure: false,
    });

    const session = getBeSession();
    expect(session.loggedIn).toBe(false);
  });
});

describe('beLogout', () => {
  it('clears DMDM and MDMD cookies', () => {
    setCookie({
      name: 'DMDM',
      value: 'val1',
      domain: '.5ch.net',
      path: '/',
      sessionOnly: false,
      secure: false,
    });
    setCookie({
      name: 'MDMD',
      value: 'val2',
      domain: '.5ch.net',
      path: '/',
      sessionOnly: false,
      secure: false,
    });

    beLogout();

    expect(getCookie('DMDM', '5ch.net')).toBeUndefined();
    expect(getCookie('MDMD', '5ch.net')).toBeUndefined();
  });
});

describe('parseBeId', () => {
  it('parses standard BE:ID-Level pattern', () => {
    const result = parseBeId('2024/01/15(月) 12:34:56 ID:abc123 BE:34600695-4');
    expect(result).toBeDefined();
    expect(result?.beId).toBe('34600695');
    expect(result?.beLevel).toBe('4');
  });

  it('returns undefined when no BE pattern', () => {
    expect(parseBeId('2024/01/15(月) 12:34:56 ID:abc123')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseBeId('')).toBeUndefined();
  });

  it('parses BE with different levels', () => {
    const result = parseBeId('BE:12345678-99');
    expect(result?.beId).toBe('12345678');
    expect(result?.beLevel).toBe('99');
  });
});

describe('buildBeProfileUrl', () => {
  it('builds correct profile URL', () => {
    const url = buildBeProfileUrl('34600695', 42);
    expect(url).toBe('https://be.5ch.net/test/p.php?i=34600695/42');
  });

  it('handles res number 1', () => {
    const url = buildBeProfileUrl('12345678', 1);
    expect(url).toBe('https://be.5ch.net/test/p.php?i=12345678/1');
  });
});
