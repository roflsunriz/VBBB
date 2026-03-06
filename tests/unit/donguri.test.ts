import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDonguriState,
  hasAcornCookie,
  setAcornCookie,
  clearAcornCookie,
  handleDonguriPostResult,
  resetDonguriState,
} from '../../src/main/services/donguri';
import { clearAllCookies, getCookie } from '../../src/main/services/cookie-store';
import { PostResultType } from '../../src/types/domain';

const TEST_DOMAIN = '5ch.io';

beforeEach(() => {
  clearAllCookies();
  resetDonguriState();
});

describe('getDonguriState', () => {
  it('returns None status by default', () => {
    const state = getDonguriState(TEST_DOMAIN);
    expect(state.status).toBe('none');
  });
});

describe('hasAcornCookie', () => {
  it('returns false when no acorn cookie', () => {
    expect(hasAcornCookie(TEST_DOMAIN)).toBe(false);
  });

  it('returns true when acorn cookie is set', () => {
    setAcornCookie('test-acorn', TEST_DOMAIN);
    expect(hasAcornCookie(TEST_DOMAIN)).toBe(true);
  });
});

describe('setAcornCookie', () => {
  it('sets acorn cookie and updates state to Active', () => {
    setAcornCookie('acorn-value', TEST_DOMAIN);
    expect(getCookie('acorn', TEST_DOMAIN)).toBeDefined();
    expect(getDonguriState(TEST_DOMAIN).status).toBe('active');
  });
});

describe('clearAcornCookie', () => {
  it('clears acorn cookie and resets state', () => {
    setAcornCookie('acorn-value', TEST_DOMAIN);
    clearAcornCookie(TEST_DOMAIN);
    expect(getCookie('acorn', TEST_DOMAIN)).toBeUndefined();
    expect(getDonguriState(TEST_DOMAIN).status).toBe('none');
  });
});

describe('handleDonguriPostResult', () => {
  it('handles grtDonguri result', () => {
    const state = handleDonguriPostResult(PostResultType.Donguri, 'どんぐりを埋めました');
    expect(state.status).toBe('consumed');
    expect(state.message).toContain('どんぐりを消費');
  });

  it('handles broken_acorn error', () => {
    const state = handleDonguriPostResult(PostResultType.DonguriError, 'broken_acorn detected');
    expect(state.status).toBe('broken');
    expect(state.message).toContain('broken_acorn');
  });

  it('handles [1044] error', () => {
    const state = handleDonguriPostResult(PostResultType.DonguriError, 'Error [1044] occurred');
    expect(state.status).toBe('broken');
    expect(state.message).toContain('[1044]');
  });

  it('handles [1045] error', () => {
    const state = handleDonguriPostResult(PostResultType.DonguriError, 'Error [1045]');
    expect(state.status).toBe('broken');
    expect(state.message).toContain('[1045]');
  });

  it('handles [0088] error', () => {
    const state = handleDonguriPostResult(PostResultType.DonguriError, 'Error [0088]');
    expect(state.status).toBe('broken');
    expect(state.message).toContain('[0088]');
  });

  it('does not change state for non-donguri result', () => {
    setAcornCookie('test', TEST_DOMAIN);
    const stateBefore = getDonguriState(TEST_DOMAIN);
    handleDonguriPostResult(PostResultType.OK, '書きこみが終わりました');
    const stateAfter = getDonguriState(TEST_DOMAIN);
    expect(stateAfter.status).toBe(stateBefore.status);
  });
});
