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
import { getCookie, setCookie, removeCookie } from './cookie-store';

const logger = createLogger('donguri');

const ACORN_COOKIE = 'acorn';
const ACORN_DOMAIN = '.5ch.net';

/** Current donguri state (updated based on post responses) */
let currentState: DonguriState = { status: DonguriStatus.None, message: '' };

/**
 * Get the current donguri state.
 * Checks acorn cookie presence and returns combined state.
 */
export function getDonguriState(): DonguriState {
  const acorn = getCookie(ACORN_COOKIE, '5ch.net');

  if (acorn === undefined) {
    // If we previously had an active state, reset to None
    if (currentState.status === DonguriStatus.Active) {
      currentState = { status: DonguriStatus.None, message: '' };
    }
    return currentState;
  }

  // If we have an acorn cookie and no error state, we're active
  if (currentState.status === DonguriStatus.None) {
    currentState = { status: DonguriStatus.Active, message: '' };
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
  currentState = { status: DonguriStatus.Active, message: '' };
  logger.info('Acorn cookie set (value masked)');
}

/**
 * Clear the acorn cookie and reset state.
 */
export function clearAcornCookie(): void {
  removeCookie(ACORN_COOKIE, ACORN_DOMAIN);
  currentState = { status: DonguriStatus.None, message: '' };
  logger.info('Acorn cookie cleared');
}

/**
 * Handle a post result related to donguri system.
 * Updates the internal state based on the post result type.
 */
export function handleDonguriPostResult(resultType: PostResultType, responseHtml: string): DonguriState {
  switch (resultType) {
    case PostResultType.Donguri:
      // Donguri was consumed (planted)
      currentState = {
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
        status: DonguriStatus.Broken,
        message: errorDetail,
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
  currentState = { status: DonguriStatus.None, message: '' };
}
