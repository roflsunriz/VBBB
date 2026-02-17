/**
 * Donguri (acorn) system service.
 * Manages acorn Cookie state and donguri-related post result handling.
 *
 * Note: Donguri detection patterns may change over time.
 * This implementation uses known patterns from the spec.
 */
import type { DonguriState } from '@shared/auth';
import { DonguriStatus } from '@shared/auth';
import { PostResultType } from '@shared/domain';
import { createLogger } from '../logger';
import { buildCookieHeader, getCookie, parseSetCookieHeaders, removeCookie, setCookie } from './cookie-store';
import { decodeBuffer } from './encoding';
import { httpFetch } from './http-client';

const logger = createLogger('donguri');

const ACORN_COOKIE = 'acorn';
const ACORN_DOMAIN = '.5ch.net';
const DONGURI_ROOT_URL = 'https://donguri.5ch.net/';
const DONGURI_LOGIN_URL = 'https://donguri.5ch.net/login';

/** Current donguri state (updated based on post responses) */
let currentState: DonguriState = { status: DonguriStatus.None, message: '', loggedIn: false };

interface DonguriLoginResult {
  readonly success: boolean;
  readonly message: string;
  readonly state: DonguriState;
}

function normalizeText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractWithRegex(html: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(html);
  if (match?.[1] === undefined) return undefined;
  const value = normalizeText(match[1]);
  return value.length > 0 ? value : undefined;
}

function parseDonguriHomeHtml(html: string): DonguriState {
  const id = extractWithRegex(html, /\[ID:([^\]]+)\]/);
  const mode = extractWithRegex(html, /(警備員|ハンター)(?:[^<\[]*)?\[ID:/);
  const userName = extractWithRegex(html, /<div class="stats header">([\s\S]*?)<\/div>/i);
  const level = extractWithRegex(html, /レベル[:：]\s*([^<\s]+)/);
  const acorn = extractWithRegex(html, /(?:どんぐり残高|種子残高)[:：]\s*([^<\n]+)/);
  const cannonStats = extractWithRegex(html, /<label>\s*大砲の統計\s*<\/label>\s*<div>([\s\S]*?)<\/div>/i);
  const fightStats = extractWithRegex(html, /<label>\s*大乱闘の統計\s*<\/label>\s*<div>([\s\S]*?)<\/div>/i);
  const loggedIn = id !== undefined && id.length > 0;
  const hasAcornCookie = getCookie(ACORN_COOKIE, '5ch.net') !== undefined;

  return {
    status: loggedIn || hasAcornCookie ? DonguriStatus.Active : DonguriStatus.None,
    message: loggedIn ? '' : 'どんぐりにログインしていません',
    loggedIn,
    userId: id,
    userName,
    userMode: mode,
    level,
    acorn,
    cannonStats,
    fightStats,
  };
}

function applyDonguriStatHeader(
  state: DonguriState,
  headers: Readonly<Record<string, string>> | undefined,
): DonguriState {
  if (headers === undefined) return state;
  const raw = headers['x-donguri-stat'];
  if (raw === undefined || raw.trim().length === 0) return state;
  return {
    ...state,
    donguriStat: raw.trim(),
  };
}

function decodeDonguriHtml(
  body: Buffer,
  headers: Readonly<Record<string, string>>,
): string {
  const contentType = headers['content-type'] ?? '';
  if (/charset\s*=\s*(?:shift[_-]?jis|sjis)/i.test(contentType)) {
    return decodeBuffer(body, 'Shift_JIS');
  }
  if (/charset\s*=\s*euc[_-]?jp/i.test(contentType)) {
    return decodeBuffer(body, 'EUC-JP');
  }
  return decodeBuffer(body, 'UTF-8');
}

/**
 * Get the current donguri state.
 * Checks acorn cookie presence and returns combined state.
 */
export function getDonguriState(): DonguriState {
  const acorn = getCookie(ACORN_COOKIE, '5ch.net');

  if (acorn === undefined) {
    if (currentState.loggedIn !== true && currentState.status === DonguriStatus.Active) {
      currentState = { status: DonguriStatus.None, message: '', loggedIn: false };
    }
    return currentState;
  }

  // If we have an acorn cookie and no error state, keep active
  if (currentState.status === DonguriStatus.None) {
    currentState = { status: DonguriStatus.Active, message: '', loggedIn: false };
  }

  return currentState;
}

/**
 * Check if acorn cookie is present.
 */
export function hasAcornCookie(): boolean {
  return getCookie(ACORN_COOKIE, '5ch.net') !== undefined;
}

/**
 * Set an acorn cookie value manually.
 */
export function setAcornCookie(value: string): void {
  setCookie({
    name: ACORN_COOKIE,
    value,
    domain: ACORN_DOMAIN,
    path: '/',
    sessionOnly: false,
    secure: false,
  });
  currentState = { status: DonguriStatus.Active, message: '', loggedIn: false };
  logger.info('Acorn cookie set (value masked)');
}

/**
 * Clear the acorn cookie and reset state.
 */
export function clearAcornCookie(): void {
  removeCookie(ACORN_COOKIE, ACORN_DOMAIN);
  currentState = { status: DonguriStatus.None, message: '', loggedIn: false };
  logger.info('Acorn cookie cleared');
}

/**
 * Refresh donguri state by fetching donguri home page and parsing details.
 */
export async function refreshDonguriState(): Promise<DonguriState> {
  try {
    const response = await httpFetch({
      url: DONGURI_ROOT_URL,
      method: 'GET',
    });

    if (response.status !== 200) {
      currentState = {
        ...getDonguriState(),
        message: `どんぐり状態の取得に失敗しました (HTTP ${String(response.status)})`,
      };
      return currentState;
    }

    const html = decodeDonguriHtml(response.body, response.headers);
    const parsed = parseDonguriHomeHtml(html);
    currentState = applyDonguriStatHeader(parsed, response.headers);
    return currentState;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    currentState = {
      ...getDonguriState(),
      message: `どんぐり状態取得エラー: ${message}`,
    };
    return currentState;
  }
}

/**
 * Login to donguri with mail/password.
 * Successful login is verified by refreshing donguri home state.
 */
export async function loginDonguri(mail: string, password: string): Promise<DonguriLoginResult> {
  const trimmedMail = mail.trim();
  const trimmedPassword = password;
  if (trimmedMail.length === 0 || trimmedPassword.length === 0) {
    return {
      success: false,
      message: 'メールアドレスとパスワードを入力してください',
      state: getDonguriState(),
    };
  }

  const body = new URLSearchParams({
    email: trimmedMail,
    pass: trimmedPassword,
  }).toString();

  const cookieHeader = buildCookieHeader(DONGURI_LOGIN_URL);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Referer: DONGURI_ROOT_URL,
  };
  if (cookieHeader.length > 0) {
    headers['Cookie'] = cookieHeader;
  }

  try {
    const response = await httpFetch({
      url: DONGURI_LOGIN_URL,
      method: 'POST',
      headers,
      body,
    });
    parseSetCookieHeaders(response.headers, DONGURI_LOGIN_URL);

    const refreshed = await refreshDonguriState();
    if (refreshed.loggedIn === true) {
      return {
        success: true,
        message: 'どんぐりにログインしました',
        state: refreshed,
      };
    }

    return {
      success: false,
      message: `どんぐりログインに失敗しました (HTTP ${String(response.status)})`,
      state: refreshed,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `どんぐりログインエラー: ${message}`,
      state: getDonguriState(),
    };
  }
}

/**
 * Handle a post result related to donguri system.
 * Updates the internal state based on the post result type.
 */
export function handleDonguriPostResult(
  resultType: PostResultType,
  responseHtml: string,
  responseHeaders?: Readonly<Record<string, string>>,
): DonguriState {
  const nextStateBase = applyDonguriStatHeader(currentState, responseHeaders);
  currentState = nextStateBase;

  switch (resultType) {
    case PostResultType.Donguri:
      // Donguri was consumed (planted)
      currentState = {
        ...currentState,
        status: DonguriStatus.Consumed,
        message: 'どんぐりを消費しました。実が出るまでお待ちください。',
      };
      logger.info('Donguri consumed');
      break;

    case PostResultType.DonguriError: {
      // Broken acorn cookie
      let errorDetail = 'acorn Cookie が破損しています';
      if (responseHtml.includes('[1044]')) {
        errorDetail = '[1044] acorn Cookie 再取得が必要です';
      } else if (responseHtml.includes('[1045]')) {
        errorDetail = '[1045] acorn Cookie 再取得が必要です';
      } else if (responseHtml.includes('[0088]')) {
        errorDetail = '[0088] acorn Cookie 再取得が必要です';
      } else if (responseHtml.includes('broken_acorn')) {
        errorDetail = 'broken_acorn: Cookie を再取得してください';
      }

      currentState = {
        ...currentState,
        status: DonguriStatus.Broken,
        message: errorDetail,
        loggedIn: false,
      };
      logger.warn(`Donguri error: ${errorDetail}`);
      break;
    }

    default:
      // Not a donguri-related result, don't change state
      break;
  }

  return currentState;
}

/**
 * Reset donguri state to default.
 */
export function resetDonguriState(): void {
  currentState = { status: DonguriStatus.None, message: '', loggedIn: false };
}
