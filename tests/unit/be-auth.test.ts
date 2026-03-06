import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../src/main/services/http-client', () => ({
  httpFetch: vi.fn(),
}));

import {
  getBeSession,
  beLogin,
  beLogout,
  parseBeId,
  buildBeProfileUrl,
} from '../../src/main/services/be-auth';
import { clearAllCookies, setCookie, getCookie } from '../../src/main/services/cookie-store';
import { httpFetch } from '../../src/main/services/http-client';
import type { HttpResponse } from '../../src/types/api';

const mockHttpFetch = httpFetch as unknown as Mock<typeof httpFetch>;

const TEST_DOMAIN = '5ch.io';

function makeResponse(overrides: Partial<HttpResponse> = {}): HttpResponse {
  return {
    status: 200,
    headers: {},
    body: Buffer.from(''),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearAllCookies();
});

describe('beLogin', () => {
  it('succeeds when server returns DMDM and MDMD cookies', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        headers: {
          'set-cookie':
            'DMDM=dmdmvalue123; Path=/; Domain=.5ch.io\nMDMD=mdmdvalue456; Path=/; Domain=.5ch.io',
        },
        body: Buffer.from('Login OK'),
      }),
    );

    const result = await beLogin('test@example.com', 'password', TEST_DOMAIN);
    expect(result.success).toBe(true);
    expect(result.message).toContain('successful');

    const session = getBeSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(true);
  });

  it('fails when server returns no DMDM/MDMD cookies', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        headers: {},
        body: Buffer.from('Login failed'),
      }),
    );

    const result = await beLogin('bad@example.com', 'wrongpass', TEST_DOMAIN);
    expect(result.success).toBe(false);

    const session = getBeSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(false);
  });

  it('succeeds with manual Set-Cookie header extraction fallback', async () => {
    // Simulate a single concatenated Set-Cookie header (some servers do this)
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        headers: {
          'set-cookie': 'DMDM=manual_dmdm; Path=/, MDMD=manual_mdmd; Path=/',
        },
        body: Buffer.from('OK'),
      }),
    );

    const result = await beLogin('user@example.com', 'pass', TEST_DOMAIN);
    expect(result.success).toBe(true);
  });

  it('handles network error gracefully', async () => {
    mockHttpFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await beLogin('user@example.com', 'pass', TEST_DOMAIN);
    expect(result.success).toBe(false);
    expect(result.message).toContain('error');
  });

  it('POSTs to the correct Be login URL', async () => {
    mockHttpFetch.mockResolvedValueOnce(makeResponse());

    await beLogin('test@example.com', 'pass', TEST_DOMAIN);

    expect(mockHttpFetch).toHaveBeenCalledOnce();
    const callArgs = mockHttpFetch.mock.calls[0]?.[0];
    expect(callArgs?.url).toBe(`https://be.${TEST_DOMAIN}/log`);
    expect(callArgs?.method).toBe('POST');
    expect(callArgs?.body).toContain('mail=test%40example.com');
    expect(callArgs?.body).toContain('pass=pass');
  });
});

describe('getBeSession', () => {
  it('returns logged out when no cookies', () => {
    const session = getBeSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(false);
  });

  it('returns logged in when both DMDM and MDMD present', () => {
    setCookie({
      name: 'DMDM',
      value: 'val1',
      domain: '.5ch.io',
      path: '/',
      sessionOnly: false,
      secure: false,
    });
    setCookie({
      name: 'MDMD',
      value: 'val2',
      domain: '.5ch.io',
      path: '/',
      sessionOnly: false,
      secure: false,
    });

    const session = getBeSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(true);
  });

  it('returns logged out when only DMDM present', () => {
    setCookie({
      name: 'DMDM',
      value: 'val1',
      domain: '.5ch.io',
      path: '/',
      sessionOnly: false,
      secure: false,
    });

    const session = getBeSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(false);
  });
});

describe('beLogout', () => {
  it('clears DMDM and MDMD cookies', () => {
    setCookie({
      name: 'DMDM',
      value: 'val1',
      domain: '.5ch.io',
      path: '/',
      sessionOnly: false,
      secure: false,
    });
    setCookie({
      name: 'MDMD',
      value: 'val2',
      domain: '.5ch.io',
      path: '/',
      sessionOnly: false,
      secure: false,
    });

    beLogout(TEST_DOMAIN);

    expect(getCookie('DMDM', '5ch.io')).toBeUndefined();
    expect(getCookie('MDMD', '5ch.io')).toBeUndefined();
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
  it('builds correct profile URL for configured domain', () => {
    const url = buildBeProfileUrl('34600695', 42, TEST_DOMAIN);
    expect(url).toBe('https://be.5ch.io/test/p.php?i=34600695/42');
  });

  it('handles res number 1', () => {
    const url = buildBeProfileUrl('12345678', 1, TEST_DOMAIN);
    expect(url).toBe('https://be.5ch.io/test/p.php?i=12345678/1');
  });

  it('uses the provided domain in the URL', () => {
    const url = buildBeProfileUrl('99999999', 10, 'example.com');
    expect(url).toBe('https://be.example.com/test/p.php?i=99999999/10');
  });
});
