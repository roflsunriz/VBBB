import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../src/main/services/http-client', () => ({
  httpFetch: vi.fn(),
}));

import { getUpliftSession, upliftLogin, upliftLogout } from '../../src/main/services/uplift-auth';
import { clearAllCookies, getCookie, setCookie } from '../../src/main/services/cookie-store';
import { httpFetch } from '../../src/main/services/http-client';
import type { HttpResponse } from '../../src/types/api';
import { DEFAULT_USER_AGENT } from '../../src/types/file-format';

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
  upliftLogout(TEST_DOMAIN);
});

describe('getUpliftSession', () => {
  it('returns logged out state by default', () => {
    const session = getUpliftSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(false);
    expect(session.sessionId).toBe('');
  });
});

describe('upliftLogin', () => {
  it('succeeds when server returns sid in Set-Cookie', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        headers: { 'set-cookie': 'sid=abc123xyz; Path=/; HttpOnly; Secure' },
        body: Buffer.from(''),
      }),
    );

    const result = await upliftLogin('testuser', 'testpass', TEST_DOMAIN);
    expect(result.success).toBe(true);
    expect(result.message).toContain('successful');

    const session = getUpliftSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(true);
    expect(session.sessionId).toBe(`${DEFAULT_USER_AGENT}:abc123xyz`);

    const sid = getCookie('sid', TEST_DOMAIN);
    expect(sid).toBeDefined();
    expect(sid?.value).toBe('abc123xyz');
  });

  it('fails when server returns no sid cookie', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        headers: {},
        body: Buffer.from('Login failed'),
      }),
    );

    const result = await upliftLogin('baduser', 'badpass', TEST_DOMAIN);
    expect(result.success).toBe(false);

    const session = getUpliftSession(TEST_DOMAIN);
    expect(session.loggedIn).toBe(false);
  });

  it('fails when server returns error body', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 200,
        headers: {},
        body: Buffer.from('error: invalid credentials'),
      }),
    );

    const result = await upliftLogin('user', 'wrongpass', TEST_DOMAIN);
    expect(result.success).toBe(false);
  });

  it('fails when server returns non-200 status', async () => {
    mockHttpFetch.mockResolvedValueOnce(
      makeResponse({
        status: 403,
        headers: {},
        body: Buffer.from('Forbidden'),
      }),
    );

    const result = await upliftLogin('user', 'pass', TEST_DOMAIN);
    expect(result.success).toBe(false);
  });

  it('handles network error gracefully', async () => {
    mockHttpFetch.mockRejectedValueOnce(new Error('Network unreachable'));

    const result = await upliftLogin('user', 'pass', TEST_DOMAIN);
    expect(result.success).toBe(false);
    expect(result.message).toContain('error');
  });

  it('POSTs to the correct uplift login URL', async () => {
    mockHttpFetch.mockResolvedValueOnce(makeResponse());

    await upliftLogin('user', 'pass', TEST_DOMAIN);

    expect(mockHttpFetch).toHaveBeenCalledOnce();
    const callArgs = mockHttpFetch.mock.calls[0]?.[0];
    expect(callArgs?.url).toBe(`https://uplift.${TEST_DOMAIN}/log`);
    expect(callArgs?.method).toBe('POST');
    expect(callArgs?.body).toContain('usr=user');
    expect(callArgs?.body).toContain('pwd=pass');
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
