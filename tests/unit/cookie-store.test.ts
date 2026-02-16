import { describe, it, expect, beforeEach } from 'vitest';
import {
  setCookie,
  getCookiesForUrl,
  getCookie,
  removeCookie,
  buildCookieHeader,
  parseSetCookieHeaders,
  serializeCookies,
  deserializeCookies,
  clearAllCookies,
  domainMatches,
  getCookieCount,
} from '../../src/main/services/cookie-store';
import type { StoredCookie } from '../../src/types/cookie';

beforeEach(() => {
  clearAllCookies();
});

describe('domainMatches', () => {
  it('matches exact domain', () => {
    expect(domainMatches('example.com', 'example.com')).toBe(true);
  });

  it('matches subdomain with leading dot', () => {
    expect(domainMatches('.5ch.net', 'agree.5ch.net')).toBe(true);
  });

  it('matches exact domain without leading dot', () => {
    expect(domainMatches('5ch.net', '5ch.net')).toBe(true);
  });

  it('matches subdomain without leading dot', () => {
    expect(domainMatches('5ch.net', 'agree.5ch.net')).toBe(true);
  });

  it('does not match different domain', () => {
    expect(domainMatches('example.com', 'other.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(domainMatches('Example.COM', 'example.com')).toBe(true);
  });
});

describe('setCookie / getCookie', () => {
  it('stores and retrieves a cookie', () => {
    const cookie: StoredCookie = {
      name: 'test',
      value: 'abc123',
      domain: '5ch.net',
      path: '/',
      sessionOnly: false,
      secure: false,
    };
    setCookie(cookie);
    const result = getCookie('test', '5ch.net');
    expect(result).toBeDefined();
    expect(result?.value).toBe('abc123');
  });

  it('returns undefined for non-existent cookie', () => {
    const result = getCookie('nonexistent', '5ch.net');
    expect(result).toBeUndefined();
  });

  it('overwrites cookie with same domain/path/name', () => {
    setCookie({ name: 'test', value: 'old', domain: '5ch.net', path: '/', sessionOnly: false, secure: false });
    setCookie({ name: 'test', value: 'new', domain: '5ch.net', path: '/', sessionOnly: false, secure: false });
    const result = getCookie('test', '5ch.net');
    expect(result?.value).toBe('new');
  });
});

describe('getCookiesForUrl', () => {
  it('returns matching cookies', () => {
    setCookie({ name: 'a', value: '1', domain: '.5ch.net', path: '/', sessionOnly: false, secure: false });
    setCookie({ name: 'b', value: '2', domain: 'other.com', path: '/', sessionOnly: false, secure: false });

    const result = getCookiesForUrl('https://agree.5ch.net/test');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('a');
  });

  it('filters expired cookies', () => {
    setCookie({
      name: 'expired',
      value: 'old',
      domain: '5ch.net',
      path: '/',
      expires: new Date(Date.now() - 10_000).toISOString(),
      sessionOnly: false,
      secure: false,
    });

    const result = getCookiesForUrl('https://5ch.net/');
    expect(result).toHaveLength(0);
  });

  it('returns cookies with path matching', () => {
    setCookie({ name: 'root', value: '1', domain: '5ch.net', path: '/', sessionOnly: false, secure: false });
    setCookie({ name: 'sub', value: '2', domain: '5ch.net', path: '/test/', sessionOnly: false, secure: false });

    const rootResult = getCookiesForUrl('https://5ch.net/');
    expect(rootResult).toHaveLength(1);
    expect(rootResult[0]?.name).toBe('root');

    const subResult = getCookiesForUrl('https://5ch.net/test/page');
    expect(subResult).toHaveLength(2);
  });
});

describe('removeCookie', () => {
  it('removes a cookie by name and domain', () => {
    setCookie({ name: 'test', value: '123', domain: '5ch.net', path: '/', sessionOnly: false, secure: false });
    expect(getCookie('test', '5ch.net')).toBeDefined();

    removeCookie('test', '5ch.net');
    expect(getCookie('test', '5ch.net')).toBeUndefined();
  });
});

describe('buildCookieHeader', () => {
  it('builds a proper Cookie header', () => {
    setCookie({ name: 'a', value: '1', domain: '.5ch.net', path: '/', sessionOnly: false, secure: false });
    setCookie({ name: 'b', value: '2', domain: '.5ch.net', path: '/', sessionOnly: false, secure: false });

    const header = buildCookieHeader('https://agree.5ch.net/test');
    expect(header).toContain('a=1');
    expect(header).toContain('b=2');
    expect(header).toContain('; ');
  });

  it('returns empty string when no cookies match', () => {
    const header = buildCookieHeader('https://example.com/');
    expect(header).toBe('');
  });
});

describe('parseSetCookieHeaders', () => {
  it('parses a simple Set-Cookie header', () => {
    const headers: Record<string, string> = {
      'set-cookie': 'SPID=abc123; path=/; domain=.5ch.net',
    };
    parseSetCookieHeaders(headers, 'https://agree.5ch.net/test');

    const cookie = getCookie('SPID', '5ch.net');
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe('abc123');
    expect(cookie?.domain).toBe('.5ch.net');
  });

  it('parses cookie with expires', () => {
    const futureDate = new Date(Date.now() + 86400 * 1000).toUTCString();
    const headers: Record<string, string> = {
      'set-cookie': `test=value; expires=${futureDate}; path=/`,
    };
    parseSetCookieHeaders(headers, 'https://5ch.net/');

    const cookie = getCookie('test', '5ch.net');
    expect(cookie).toBeDefined();
    expect(cookie?.expires).toBeDefined();
  });

  it('marks sid as session-only', () => {
    const headers: Record<string, string> = {
      'set-cookie': 'sid=session123; path=/; domain=.5ch.net',
    };
    parseSetCookieHeaders(headers, 'https://uplift.5ch.net/log');

    const cookie = getCookie('sid', '5ch.net');
    expect(cookie).toBeDefined();
    expect(cookie?.sessionOnly).toBe(true);
  });

  it('does nothing when no Set-Cookie header', () => {
    const headers: Record<string, string> = { 'content-type': 'text/html' };
    parseSetCookieHeaders(headers, 'https://5ch.net/');
    expect(getCookieCount()).toBe(0);
  });
});

describe('serialize / deserialize', () => {
  it('round-trips persistent cookies', () => {
    setCookie({ name: 'DMDM', value: 'val1', domain: '.5ch.net', path: '/', sessionOnly: false, secure: false });
    setCookie({ name: 'MDMD', value: 'val2', domain: '.5ch.net', path: '/', sessionOnly: false, secure: true });

    const serialized = serializeCookies();
    clearAllCookies();
    expect(getCookieCount()).toBe(0);

    deserializeCookies(serialized);
    expect(getCookieCount()).toBe(2);

    const dmdm = getCookie('DMDM', '5ch.net');
    expect(dmdm?.value).toBe('val1');

    const mdmd = getCookie('MDMD', '5ch.net');
    expect(mdmd?.value).toBe('val2');
    expect(mdmd?.secure).toBe(true);
  });

  it('excludes session-only cookies from serialization', () => {
    setCookie({ name: 'sid', value: 'secret', domain: '.5ch.net', path: '/', sessionOnly: true, secure: false });
    setCookie({ name: 'DMDM', value: 'keep', domain: '.5ch.net', path: '/', sessionOnly: false, secure: false });

    const serialized = serializeCookies();
    expect(serialized).not.toContain('sid');
    expect(serialized).toContain('DMDM');
  });

  it('excludes expired cookies from serialization', () => {
    setCookie({
      name: 'old',
      value: 'expired',
      domain: '5ch.net',
      path: '/',
      expires: new Date(Date.now() - 10_000).toISOString(),
      sessionOnly: false,
      secure: false,
    });

    const serialized = serializeCookies();
    expect(serialized).not.toContain('old');
  });
});
